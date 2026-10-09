// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 客人：闲游 / 驻足，以及它自己的户口本
//
// 这两段状态**只有客人有**——保镖不闲游也不驻足（它在岗）。把「只有它
// 有」的东西放进它自己的文件，是这次整理的核心动作。
//
// 闲游里有两个计时，别混淆：
// - `moodLeft`——本状态的总时长（6~18s），决定何时换到驻足
// - `idleLeft`——每次到达目的地后的小憩（0.8~3.5s），决定何时挑下一个目的地
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Random } from "../../world/random";
import type { ActorState, RoleStateSet } from "../systems/state-types";
import { panic } from "./panic";
import type { NpcDef } from "./types";

/** 到达目的地后的小憩时长（秒） */
const REST_MIN = 0.8;
const REST_MAX = 3.5;

/**
 * 闲游：走向随机目的地，累了就驻足。
 *
 * 半路**不换状态**——那会让 NPC 停在空地中央，看起来像卡住。这是
 * `left <= 0 && arrived` 这个双条件的由来。
 */
function makeWander(random: Random): ActorState {
  return {
    name: "wander",
    duration: { min: 6, max: 18 },
    update: (ctx, delta) => {
      const { self, services } = ctx;
      const arrived = services.hasArrived(self);
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
      // 目的地交给服务写（`goal` + `followTime` 必须成对重置），
      // 本状态只负责「休息多久」这个属于它自己的计时
      services.setGoal(ctx.frame, ctx.id, goal);
      ctx.patch((e) => {
        e.idleLeft = REST_MIN + random() * (REST_MAX - REST_MIN);
      });
    },
  };
}

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

/** 宠物：闲游 / 驻足 / 恐慌；默认闲游 */
function guestStates(random: Random): RoleStateSet {
  return {
    entry: "wander",
    states: { wander: makeWander(random), linger, panic },
  };
}

/** 客人的户口本 */
export const guest: NpcDef = {
  traits: { speed: 78 },
  states: guestStates,
};
