// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 角色状态：每个状态是一个对象，拥有自己的一段时间
//
// 这是对「恐慌逻辑散落三处」的修正。此前：
//   alarm      写 mood/fleeFrom，并清 path/goal/idleLeft/followTime（7 个字段）
//   navigation 读 mood 决定目标策略（pickGoal 分派）
//   behaviour  递减 moodLeft，到期切回 wander
// 三处共同描述一件事——「NPC 被吓到后逃跑」。状态对象把它收进一处：
// 进入、每帧、离开各是一个方法，读起来是一条时间线。
//
// **边界**：状态决定「去哪、什么时候换状态」；「怎么算路径、怎么走」
// 是 navigation 的服务。状态不碰寻路细节，也不必互相知道。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { EntityId, FrameManager } from "engine";

import type { Cell } from "../../world";
import type { Random } from "../../world/random";
import type { ActorEntity, Mood } from "../types";

/** 状态可用的服务。注入而非直接 import，避免状态依赖具体系统 */
export type ActorServices = {
  /**
   * 朝当前 `goal` 走一帧：无路径则先规划，有路径则推进。
   *
   * 「是否已到达」由状态自行观察 `!path.length && !goal` 得出——
   * 推进逻辑不必回报，状态也不必猜。
   */
  moveTowardGoal: (frame: FrameManager<ActorEntity>, id: EntityId, delta: number) => void;
  /** 随机挑一个可通行格作为目的地（避开当前格） */
  pickRandomGoal: (from: Cell) => Cell | undefined;
  /** 挑一个远离威胁的目的地 */
  pickFleeGoal: (from: Cell, threat: Cell) => Cell | undefined;
};

/** 当前帧的运行时上下文，由状态机每帧构造一次 */
export type StateContext = {
  readonly frame: FrameManager<ActorEntity>;
  readonly id: EntityId;
  /**
   * 实体数据的**活对象引用**（不是快照）。
   *
   * 与旧引擎的区别：旧版 `self` 是写时拷贝的快照，`patch` 后不回读；
   * 现在 `self` 与 `patch` 作用于同一对象，写入立即可见。
   *
   * **约定不变**：状态若需在同一个 `update` 里用到「旧值」，应就近存进
   * 局部变量（`const left = self.moodLeft - delta` 就是这种写法），
   * 而不是写完再回读。
   */
  readonly self: Readonly<ActorEntity>;
  /** 当前所在格 */
  readonly cell: Cell;
  /** 写回实体 */
  patch: (fn: (e: ActorEntity) => void) => void;
  /** 切换到另一个状态（写 mood、掷定新时长、执行目标状态的 enter） */
  transition: (next: Mood) => void;
  /** 服务：寻路与移动（由 navigation 提供） */
  services: ActorServices;
};

export type ActorState = {
  readonly name: Mood;
  /** 状态持续时长范围（秒） */
  readonly duration: { min: number; max: number };
  /** 进入状态时的初始化 */
  enter?: (ctx: StateContext) => void;
  /** 每帧推进 */
  update: (ctx: StateContext, delta: number) => void;
};

/** 到达目的地后的小憩时长（秒） */
const REST_MIN = 0.8;
const REST_MAX = 3.5;

export function createStates(random: Random): Record<Mood, ActorState> {
  /**
   * 闲游：走向随机目的地，累了就驻足。
   *
   * 这里有**两个计时**，别混淆：
   * - `moodLeft`——本状态的总时长（6~18s），决定何时换到驻足
   * - `idleLeft`——每次到达目的地后的小憩（0.8~3.5s），决定何时挑下一个目的地
   */
  const wander: ActorState = {
    name: "wander",
    duration: { min: 6, max: 18 },
    update: (ctx, delta) => {
      const { self, services } = ctx;
      const arrived = self.path.length === 0 && !self.goal;

      // 半路不换状态——那会让 NPC 停在空地中央，看起来像卡住
      const left = self.moodLeft - delta;
      if (left <= 0 && arrived) {
        ctx.transition("linger");
        return;
      }
      if (left !== self.moodLeft) {
        ctx.patch((e) => {
          e.moodLeft = left;
        });
      }

      if (!arrived) {
        services.moveTowardGoal(ctx.frame, ctx.id, delta);
        return;
      }

      // 已到达：小憩计时，到点后挑下一个目的地
      const rest = self.idleLeft - delta;
      if (rest > 0) {
        ctx.patch((e) => {
          e.idleLeft = rest;
        });
        return;
      }

      const goal = services.pickRandomGoal(ctx.cell);
      if (!goal) return;
      ctx.patch((e) => {
        e.goal = goal;
        e.followTime = 0;
        e.idleLeft = REST_MIN + random() * (REST_MAX - REST_MIN);
      });
    },
  };

  /** 驻足：原地待一会儿。不规划、不移动——语义就是「站住」 */
  const linger: ActorState = {
    name: "linger",
    duration: { min: 2, max: 6 },
    update: (ctx, delta) => {
      const left = ctx.self.moodLeft - delta;
      if (left <= 0) {
        ctx.transition("wander");
        return;
      }
      ctx.patch((e) => {
        e.moodLeft = left;
      });
    },
  };

  /**
   * 恐慌：持续逃离目击点，直到情绪消退。
   *
   * 这曾是散落三处的那件事，现在整个在这里：
   * - `enter` 清掉既有路径与目标（否则会先走完旧路，看起来像「没反应」）
   * - `update` 每次路径走空就重新挑一个远离威胁的落点，中途不休息
   * - 期满切回闲游，但 `witnessed` 不变——那是记忆，不是情绪
   */
  const panic: ActorState = {
    name: "panic",
    duration: { min: 30, max: 30 },
    enter: (ctx) => {
      ctx.patch((e) => {
        e.path = [];
        e.goal = null;
        e.idleLeft = 0;
        e.followTime = 0;
      });
    },
    update: (ctx, delta) => {
      const { self, services } = ctx;
      const left = self.moodLeft - delta;

      if (left <= 0) {
        // 情绪结束：清掉逃离参照点，但 witnessed 保留
        ctx.patch((e) => {
          e.fleeFrom = null;
        });
        ctx.transition("wander");
        return;
      }
      ctx.patch((e) => {
        e.moodLeft = left;
      });

      // 路径走空且无目标：挑下一个远离威胁的落点。
      // 恐慌期间不休息——逃到一处立刻奔向下一处。
      if (self.path.length > 0 || self.goal) {
        services.moveTowardGoal(ctx.frame, ctx.id, delta);
        return;
      }

      if (!self.fleeFrom) return;
      const goal = services.pickFleeGoal(ctx.cell, self.fleeFrom);
      if (!goal) return;
      ctx.patch((e) => {
        e.goal = goal;
        e.followTime = 0;
      });
    },
  };

  return { wander, linger, panic };
}
