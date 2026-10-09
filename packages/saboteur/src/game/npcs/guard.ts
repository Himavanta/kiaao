// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 保镖：巡逻 / 私有记忆 / 数值 / 岗位——一只 NPC 的全部知识
//
// 这是「户口本」的第二个样本（第一个是 `guest.ts`）。读这一个文件，
// 应当能知道保镖是什么，而不必翻 7 个文件。
//
// 收进来的四处（原先散在别的文件）：
//   - 数值（速度、视距）——原 `views/actor.tsx` 的 `ACTOR_TRAITS` 表
//   - 状态集 `{patrol, panic}`——原 `systems/states.ts` 的 `sets` 表
//   - 岗位（出生格）——原 `views/actor.tsx` 的 `postFor`
//   - 私有记忆 `seen`——本文件原有
//
// **巡逻为什么是「保镖独有」**：客人的 `wander` 全图随机，`patrol` 的
// 差别只有**目标范围**（限定在岗位周边）。机制相同、参数不同——这正是
// 文档 §二「参数轴」的形态。两段代码前半部分（走向目标）逐字相同，
// 这是参数轴的代价，S3 时已记录。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { EntityId } from "engine";

import { TILE, type Cell } from "../../world";
import type { Random } from "../../world/random";
import type { ActorState, RoleStateSet } from "../systems/state-types";
import type { ActorEntity } from "../types";
import { panic } from "./panic";
import type { NpcDef } from "./types";

/** 巡逻岗位的半径（格）：保镖不会离开岗位太远——「守门」的语义 */
const PATROL_RADIUS = 4;

/** 巡逻到位后的停留时长（秒）：比客人短，体现「在岗」 */
const PATROL_REST_MIN = 0.3;
const PATROL_REST_MAX = 1.2;

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
      services.setGoal(ctx.frame, ctx.id, goal);
      ctx.patch((e) => {
        e.idleLeft = PATROL_REST_MIN + random() * (PATROL_REST_MAX - PATROL_REST_MIN);
      });
    },
  };
}

/** 保镖：巡逻 / 恐慌；默认巡逻。**没有** wander / linger——它在岗 */
function makeGuardStates(random: Random): RoleStateSet {
  return {
    entry: "patrol",
    states: { patrol: makePatrol(random), panic },
  };
}

/**
 * 保镖实体的扩展类型：共享字段 + 它私有的字段与方法。
 *
 * 用交叉类型而非改 `ActorEntity`——后者是**所有**角色的共享类型，
 * 往里加只有保镖用的字段会让它重新膨胀（文档 §5.2 的教训）。
 */
export type GuardEntity = ActorEntity & {
  /** 【保镖私有】见过的实体 → 首次见到的累计帧数 */
  seen: Map<EntityId, number>;
  /** 【保镖私有】见过某人吗 */
  hasSeen: (id: EntityId) => boolean;
  /** 【保镖私有】每帧钩子：把「此刻可见」并入「曾经见过」 */
  onFrame: () => void;
};

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
  state.seen = new Map<EntityId, number>();

  state.hasSeen = (id) => state.seen.has(id);

  state.onFrame = () => {
    frameCount += 1;
    // 读**自己**的 visibleIds（perception 写的）——不看别人
    for (const id of state.visibleIds) {
      if (state.seen.has(id)) continue;
      state.seen.set(id, frameCount);
    }
  };

  return state;
}

/** 保镖的户口本：数值、状态、私有记忆、岗位——全在一处 */
export const guard: NpcDef = {
  traits: { speed: 96, sightRange: GUARD_SIGHT_TILES * TILE },
  states: makeGuardStates,
  decorate: createGuardState,
  // 出生格就是它的岗位
  post: (col, row): Cell => ({ col, row }),
};
