// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 共享机制：移动（createPool）
//
// 这份代码**服务这个世界里的每一种实体**——鸟、鹰、以后加的任何东西。
// 它不需要知道对方是什么、在追谁、为什么动。它只做一件事：
// 把 `vx` / `vy` 积分成位置。
//
// 这就是「一份代码服务所有实体」的形态，也是它必须留在系统里的理由：
// 若把它写进每种实体的方法里，加一种实体就复制一遍。
//
// 对照 actor.ts 的 `wander`——那个只属于「鸟」，不是共享机制。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createPool, type FrameManager } from "engine";

/** 移动系统要的字段：速度与位置 */
export type Movable = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export function createMovementSystem() {
  const [pool, enter] = createPool<Movable>();

  const update = (frame: FrameManager<Movable>, delta: number) => {
    for (const id of pool) {
      const e = frame(id);
      if (!e) continue;
      e.x += e.vx * delta;
      e.y += e.vy * delta;
    }
  };

  return { enter, update, pool };
}

/**
 * 边界系统：撞墙反弹。
 *
 * 又一个「一份代码服务所有实体」——它不认识鸟和鹰的差别，
 * 只知道「越界的速度反向」。
 */
export function createBoundarySystem(bounds: { w: number; h: number; pad: number }) {
  const [pool, enter] = createPool<Movable>();

  const update = (frame: FrameManager<Movable>) => {
    for (const id of pool) {
      const e = frame(id);
      if (!e) continue;

      if (e.x < bounds.pad) {
        e.x = bounds.pad;
        e.vx = Math.abs(e.vx);
      } else if (e.x > bounds.w - bounds.pad) {
        e.x = bounds.w - bounds.pad;
        e.vx = -Math.abs(e.vx);
      }

      if (e.y < bounds.pad) {
        e.y = bounds.pad;
        e.vy = Math.abs(e.vy);
      } else if (e.y > bounds.h - bounds.pad) {
        e.y = bounds.h - bounds.pad;
        e.vy = -Math.abs(e.vy);
      }
    }
  };

  return { enter, update };
}
