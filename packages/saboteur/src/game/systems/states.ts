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
import type { ActorEntity, Mood, NpcRole, Role } from "../types";

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
  /** 在某个点附近挑一个可通行格（巡逻用） */
  pickNearbyGoal: (around: Cell, from: Cell, radius: number) => Cell | undefined;
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
  /**
   * 状态持续时长范围（秒）。
   *
   * **可选**：只有「会自行到期切换」的状态才需要它。`patrol` 是长期行为
   * （守岗，不自行换状态），给它一个 `{min:8,max:8}` 的固定区间只会让
   * 每帧多一次写实体——S3 收口时发现的死重量。
   */
  readonly duration?: { min: number; max: number };
  /** 进入状态时的初始化 */
  enter?: (ctx: StateContext) => void;
  /** 每帧推进 */
  update: (ctx: StateContext, delta: number) => void;
};

/** 到达目的地后的小憩时长（秒） */
const REST_MIN = 0.8;
const REST_MAX = 3.5;

/** 巡逻岗位的半径（格）：保镖不会离开岗位太远——「守门」的语义 */
const PATROL_RADIUS = 4;

/** 巡逻到位后的停留时长（秒）：比客人短，体现「在岗」 */
const PATROL_REST_MIN = 0.3;
const PATROL_REST_MAX = 1.2;

/**
 * 一种 NPC 拥有的状态集。
 *
 * 用 `Partial` 而非完整 `Record<Mood, …>`：每种 NPC **只拥有一部分状态**
 * （这正是 S2 的目的）。查表失败要靠 `behaviour` 兜底，不能假定必有。
 */
export type RoleStateSet = {
  /**
   * 该角色的**默认状态**（初值 + 恐慌消退后的归宿）。
   *
   * 显式声明而非「取第一个键」：后者依赖对象字面量的书写顺序，
   * 重构时极易静默改变行为。`panic` 是共享状态，它不能写死
   * `transition("wander")`——保镖没有 `wander`，得回到自己的岗位。
   */
  entry: Mood;
  states: Partial<Record<Mood, ActorState>>;
};

export function createStates(random: Random): Record<NpcRole, RoleStateSet> {
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
   * 某角色的默认状态。
   *
   * 声明为函数而非常量：它读的 `sets` 定义在末尾（引用上面所有状态对象），
   * 而本函数在帧循环里才被调用——那时 `sets` 早已初始化。
   *
   * 玩家没有状态集，兜底返回 `"wander"`。理论上不会被调用：
   * 玩家不注册 `behaviour.enter`，不入本系统的池。
   */
  function entryMoodOf(role: Role): Mood {
    if (role === "player") return "wander";
    return sets[role].entry;
  }

  /**
   * 恐慌：持续逃离目击点，直到情绪消退。
   *
   * 这曾是散落三处的那件事，现在整个在这里：
   * - `enter` 清掉既有路径与目标（否则会先走完旧路，看起来像「没反应」）
   * - `update` 每次路径走空就重新挑一个远离威胁的落点，中途不休息
   * - 期满回到**本角色的默认状态**（客人→闲游、保镖→回岗），
   *   但 `witnessed` 不变——那是记忆，不是情绪
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
        // 回到本角色的默认状态——**不能写死 "wander"**：
        // 保镖没有 wander，`transition` 会因查不到状态而失效
        ctx.transition(entryMoodOf(self.role));
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

  /**
   * 巡逻：在岗位附近来回走。
   *
   * 与 `wander` 的差别只有**目标范围**：`wander` 全图随机，`patrol` 限定
   * 在 `post` 周边。前半段（走向目标）与 wander 逐字相同——这是「参数轴」
   * 的代价：机制相同、参数不同，代码却要各自写一遍。
   */
  const patrol: ActorState = {
    name: "patrol",
    // 不声明 duration：巡逻不会自行到期换状态（长期行为）
    update: (ctx, delta) => {
      const { self, services } = ctx;

      // 岗位缺失时退化为驻足，不硬崩（`post` 由注册时定，理论上不会缺）
      if (!self.post) return;

      // 这里**没有** `moodLeft` 倒计时：巡逻不靠计时切换状态，
      // 每帧递减它只是白写一次实体（写就要进帧末提交）
      const arrived = self.path.length === 0 && !self.goal;
      if (!arrived) {
        services.moveTowardGoal(ctx.frame, ctx.id, delta);
        return;
      }

      // 已到位：稍作停留再挑下一个岗内点。巡逻不歇太久——「守门」是它的语义
      const rest = self.idleLeft - delta;
      if (rest > 0) {
        ctx.patch((e) => {
          e.idleLeft = rest;
        });
        return;
      }

      const goal = services.pickNearbyGoal(self.post, ctx.cell, PATROL_RADIUS);
      if (!goal) return;
      ctx.patch((e) => {
        e.goal = goal;
        e.followTime = 0;
        e.idleLeft = PATROL_REST_MIN + random() * (PATROL_REST_MAX - PATROL_REST_MIN);
      });
    },
  };

  /**
   * 各 NPC 类型的状态集。定义在末尾——它引用上面所有状态对象。
   *
   * 用 `entry` 显式声明默认状态，而非「取第一个键」：后者依赖字面量
   * 的书写顺序，重构时极易静默改变行为。
   */
  const sets: Record<NpcRole, RoleStateSet> = {
    // 客人：闲游 / 驻足 / 恐慌
    guest: { entry: "wander", states: { wander, linger, panic } },
    // 保镖：巡逻 / 恐慌——没有「闲游」也没有「驻足」
    guard: { entry: "patrol", states: { patrol, panic } },
  };

  return sets;
}
