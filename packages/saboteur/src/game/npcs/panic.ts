// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 恐慌：唯一被多个 NPC 类型共享的状态
//
// 它曾是散落三处的那件事（alarm 写 mood、navigation 读 mood 挑目标、
// behaviour 递减计时）。现在整条时间线在这里：
// - `enter` 清掉既有路径与目标（否则会先走完旧路，看起来像「没反应」）
// - `update` 每次路径走空就重新挑一个远离威胁的落点，中途不休息
// - 期满回到**本角色的默认状态**，但 `witnessed` 不变——那是记忆，不是情绪
//
// **为什么单独一个文件**：客人要它、保镖也要它。放在任一方都会让另一方
// 反向依赖。它是「共享状态」这个事实的显式落点——与「私有状态」
// （`guest.ts` 的 wander、`guard.ts` 的 patrol）形成对照。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { ActorState } from "../systems/state-types";

/**
 * 恐慌持续时长（秒）。
 *
 * 固定值（非区间）：恐慌是「戏」，时长要可预期——玩家目睹 NPC 逃跑后
 * 应当能估计自己还有多久暴露。随机化会让这个判断变成赌博。
 */
const PANIC_DURATION = 30;

export const panic: ActorState = {
  name: "panic",
  duration: { min: PANIC_DURATION, max: PANIC_DURATION },
  enter: (ctx) => {
    // 清路线（服务负责 `path`/`goal`/`followTime`），`idleLeft` 是本
    // 状态自己的计时，自己清
    ctx.services.clearRoute(ctx.frame, ctx.id);
    ctx.patch((e) => {
      e.idleLeft = 0;
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
      // 回到**本角色的默认状态**——不能写死 "wander"：
      // 保镖没有 wander，`transition` 会因查不到状态而失效。
      // 从上下文取（而非读「各角色的状态集」表），避免共享状态反向依赖它。
      ctx.transition(ctx.entryMood);
      return;
    }
    ctx.patch((e) => {
      e.moodLeft = left;
    });

    // 路径走空且无目标：挑下一个远离威胁的落点。
    // 恐慌期间不休息——逃到一处立刻奔向下一处。
    if (!services.hasArrived(self)) {
      services.moveTowardGoal(ctx.frame, ctx.id, delta);
      return;
    }

    if (!self.fleeFrom) return;
    const goal = services.pickFleeGoal(ctx.cell, self.fleeFrom);
    if (!goal) return;
    services.setGoal(ctx.frame, ctx.id, goal);
  },
};
