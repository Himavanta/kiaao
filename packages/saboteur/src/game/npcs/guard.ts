// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 保镖：巡逻 / 私有记忆 / 数值 / 岗位——一只 NPC 的全部知识
//
// 这是「户口本」的第二个样本（第一个是 `guest.ts`）。读这一个文件，
// 应当能知道保镖是什么，而不必翻 7 个文件。
//
// 收进来的五处（原先散在别的文件）：
//   - 数值（速度、视距）——原 `views/actor.tsx` 的 `ACTOR_TRAITS` 表
//   - 状态集 `{patrol, investigate, panic}`——原 `systems/states.ts` 的 `sets` 表
//   - 岗位（出生格）——原 `views/actor.tsx` 的 `postFor`
//   - 私有记忆 `seen`——本文件原有
//   - **对尸体的反应（去查看）**——原先根本没有（保镖与客人一样只会逃跑）
//
// **巡逻为什么是「保镖独有」**：客人的 `wander` 全图随机，`patrol` 的
// 差别只有**目标范围**（限定在岗位周边）。机制相同、参数不同——这正是
// 文档 §二「参数轴」的形态。两段代码前半部分（走向目标）逐字相同，
// 这是参数轴的代价，S3 时已记录。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { ActorContext, EntityId } from "engine";

import { cellAt, TILE, type Cell } from "../../world";
import type { Random } from "../../world/random";
import { ACTOR_SIZE } from "../systems/locomotion";
import type { ActorState, RoleStateSet } from "../systems/state-types";
import type { ActorEntity } from "../types";
import { panic } from "./panic";
import type { NpcDef } from "./types";

/** 巡逻岗位的半径（格）：保镖不会离开岗位太远——「守门」的语义 */
const PATROL_RADIUS = 4;

/** 巡逻到位后的停留时长（秒）：比客人短，体现「在岗」 */
const PATROL_REST_MIN = 0.3;
const PATROL_REST_MAX = 1.2;

/**
 * 查看的时长（秒）：有期限，不能因为一个念头站一天。
 *
 * 短于恐慌（30s）——查看是**任务**，不是情绪：看完就回岗。
 * 若与恐慌等长，保镖会因一具远处的尸体长时间脱岗，开局就失控。
 * 这段时长含**走过去 + 原地观察**两部分。
 */
const INVESTIGATE_MIN = 6;
const INVESTIGATE_MAX = 10;

/** 视距（格）：比客人远，体现「专业」 */
const GUARD_SIGHT_TILES = 9;

/**
 * 巡逻：在岗位附近来回走。
 *
 * 与 `wander` 的差别只有**目标范围**——`pickNearbyGoal(post, …)` 取代
 * `pickRandomGoal()`，其余（到达判定、休息计时）逐字相同。
 *
 * **不声明 `duration`**：巡逻不靠计时切换状态（长期行为）。给它一个固定
 * 区间只会让每帧多一次写实体——S3 收口时发现的死重量。
 *
 * 写成工厂（而非模块常量）是为了闭包捕获 `random`——状态的 `update`
 * 只收 `(ctx, delta)`，随机源得从创建时绑进来。与 `guest.ts` 的
 * `makeWander` 同一手法。
 */
function makePatrol(random: Random): ActorState {
  return {
    name: "patrol",
    update: (ctx, delta) => {
      const { self, services } = ctx;

      // 岗位缺失时退化为驻足，不硬崩（`post` 由注册时定，理论上不会缺）
      if (!self.post) return;

      if (!services.hasArrived(self)) {
        services.moveTowardGoal(self, delta);
        return;
      }

      // 已到位：稍作停留再挑下一个岗内点。巡逻不歇太久——「守门」是它的语义
      const rest = self.idleLeft - delta;
      if (rest > 0) {
        self.idleLeft = rest;
        return;
      }

      const goal = services.pickNearbyGoal(self.post, ctx.cell, PATROL_RADIUS);
      if (!goal) return;
      services.setGoal(self, goal);
      self.idleLeft = PATROL_REST_MIN + random() * (PATROL_REST_MAX - PATROL_REST_MIN);
    },
  };
}

/**
 * 查看：走向「记忆中最后一次见到异常的地方」，停一会再回岗。
 *
 * **这是与客人恐慌最本质的差别**：客人是「远离记忆」，保镖是「走向记忆」。
 * 两者都靠记忆导航，都不用异常源的实时坐标——否则就是全知追踪，与项目
 * 「NPC 只能知道自己看见的」一贯取向相赋。
 *
 * **时长固定、不靠「还在不在」早退**：与 `panic` 同一理由——行为要可预期。
 * 若因为一瞬没看见就提前收工，保镖会走到半路又掉头，看起来像抽搐；
 * 也不该因为看反了方向就白跑一趟。于是不管看到与否，走完这一段再说。
 */
function makeInvestigate(): ActorState {
  return {
    name: "investigate",
    duration: { min: INVESTIGATE_MIN, max: INVESTIGATE_MAX },
    enter: (ctx) => {
      // 路线交给服务清（`path`/`goal`/`followTime` 归 navigation 写）
      ctx.services.clearRoute(ctx.self);
      ctx.self.idleLeft = 0;

      // **_enter 里就把目标定下来**，不能等到 update 里再判「东西还在不在」：
      // update 的 `hasArrived` 初始为 true（无路径无目标），若先检查可见性，
      // 只要目标不在当前视锥里就会立即放弃——实际上等于根本没去过。
      // （实测：旧写法下保镖进入了 investigate 却一步未动。）
      const where = rememberedCell(ctx.self as GuardEntity);
      if (where) ctx.services.setGoal(ctx.self, where);
    },
    update: (ctx, delta) => {
      const { self, services } = ctx;
      const left = self.moodLeft - delta;

      if (left <= 0) {
        self.investigateTarget = null;
        ctx.transition(ctx.entryMood);
        return;
      }
      self.moodLeft = left;

      // 还没到：继续走。到了就地站一会（`hasArrived` 为真时不再调服务），
      // 直到计时自然到期——不提前收工，行为才可预期
      if (!services.hasArrived(self)) {
        services.moveTowardGoal(self, delta);
      }
    },
  };
}

/** 保镖：巡逻 / 查看 / 恐慌；默认巡逻。**没有** wander / linger——它在岗 */
function makeGuardStates(random: Random): RoleStateSet {
  return {
    entry: "patrol",
    states: { patrol: makePatrol(random), investigate: makeInvestigate(), panic },
    // 尸体→上前查看（这是职责）；恐慌的人→自己也跟着逃（「连同事都在跑」
    // 本身就是信号）。两类异常应对不同，所以收一个 `kind` 参数
    reaction: (kind) => (kind === "corpse" ? "investigate" : "panic"),
  };
}

/**
 * 保镖实体的扩展类型：共享字段 + 它私有的字段与方法。
 *
 * 用交叉类型而非改 `ActorEntity`——后者是**所有**角色的共享类型，
 * 往里加只有保镖用的字段会让它重新膨胀（文档 §5.2 的教训）。
 */
export type GuardEntity = ActorEntity & {
  /**
   * 【保镖私有】见过的实体 → 「首次见到的帧号 + 最后一次见到的位置」。
   *
   * **同时存两个时间尺度**：首次帧号是「我认得他多久了」（累计、不覆盖），
   * 位置是「我最后一次在哪看见他」（会更新）。查看要用后者——拿首次的
   * 位置会走向一个早就没人（或早被掳走）的地方。
   *
   * **为什么是个对象而不是两个 Map**：两者同一件事（对同一个人的观测
   * 记录），分开放会出现「一个有、一个没」的不一致。
   */
  seen: Map<EntityId, Sighting>;
  /** 【保镖私有】见过某人吗 */
  hasSeen: (id: EntityId) => boolean;
  /**
   * 【保镖私有】每帧钩子：把「此刻可见」并入「曾经见过」。
   *
   * 签名与引擎的 `HasFrameHook` 一致（收 `ActorContext`）——它需要
   * `ctx.frame` 去读**被看见者**的位置（记的是「它当时在哪」）。
   * 读别人的位置不违反边界：用途只是写自己的私有记忆，不是替别人决策。
   */
  onFrame: (ctx: ActorContext<ActorEntity>) => void;
};

/** 一条观测记录：什么时候第一次见到的，最后一次在哪见到的 */
export type Sighting = {
  /** 首次见到的累计帧号（不被后续覆盖） */
  firstSeenAt: number;
  /** 最后一次见到的格（每次看见都更新） */
  lastSeenAt: Cell;
};

/**
 * 从记忆里取「最后一次见到的格」。
 *
 * 找不到记录（还没看见过 / 记丢了）时返回 `null`——调用方据此收工回岗。
 * 不在这里兜底为「当前位置」：那会让保镖原地站住不知所措，而不是结束任务。
 */
function rememberedCell(state: GuardEntity): Cell | null {
  const target = state.investigateTarget;
  if (target === null) return null;
  return state.seen.get(target)?.lastSeenAt ?? null;
}

/**
 * 把一份基础 state 升格为保镖实体。
 *
 * **方法闭包捕获 `state`**（不是 `this`）：`define` 会把 state 浅拷贝给
 * 渲染信号，用 `this` 的写法在某些调用路径下会指向那个拷贝（文档 §8.2）。
 *
 * **代价（未解决）**：`seen` 是嵌套容器（`Map`），依赖引擎「每帧全量
 * 提交」兜底（能力文档 §3.3 的耦合陷阱）。若将来做选择性提交，
 * `seen.set()` 可能不再被检测到。
 */
function createGuardState(base: ActorEntity): GuardEntity {
  const state = { ...base } as GuardEntity;

  let frameCount = 0;
  state.seen = new Map<EntityId, Sighting>();

  state.hasSeen = (id) => state.seen.has(id);

  state.onFrame = (ctx) => {
    frameCount += 1;

    // 读**自己**的 visibleIds（perception 写的）——不看别人
    for (const id of state.visibleIds) {
      // 记的是**对方当时在哪**，不是「我在哪看见的」——「last seen at」
      // 的语义是后者，而查看要走向的是「我当时看见它的地方」。
      // 位置从帧管理器取（读别人的位置不违反边界：这只用于写自己的
      // 私有记忆，不用于替别人决策）。
      const target = ctx.frame(id);
      if (!target) continue;
      const at = cellAt(target.x + ACTOR_SIZE / 2, target.y + ACTOR_SIZE / 2);
      if (!at) continue;

      const record = state.seen.get(id);
      if (record) {
        // 已认识：只更新「最后一次在哪看见」
        record.lastSeenAt = at;
        continue;
      }
      state.seen.set(id, { firstSeenAt: frameCount, lastSeenAt: at });
    }
  };

  return state;
}

/** 保镖的户口本：符号、数值、状态、私有记忆、岗位——全在一处 */
export const guard: NpcDef = {
  // 地图上的 `G`
  symbols: { G: undefined },
  traits: { speed: 96, sightRange: GUARD_SIGHT_TILES * TILE },
  states: makeGuardStates,
  decorate: createGuardState,
  // 出生格就是它的岗位
  post: (col, row): Cell => ({ col, row }),
};
