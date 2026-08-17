import type { Context } from "kiaao";

import type { EntityId, FrameManager } from "./engine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 系统字段需求
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 移动系统字段需求：实体具备位置与速度 */
export type Movable = { x: number; y: number; vx: number; vy: number };
/** 边界/碰撞系统字段需求：实体具备尺寸 */
export type Bounded = Movable & { w: number; h: number };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 移动系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createMovementSystem<T extends Movable = Movable>() {
  // 移动池：每帧更新位置；静止池：保持不动，零帧写入开销
  const movePool = new Set<EntityId>();
  const staticPool = new Set<EntityId>();

  // register: 接收配置，返回初始化函数
  const register = (props: {
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    moving?: boolean;
  }) => {
    return (id: EntityId, ctx: Context) => {
      const { onMount, onUnmount } = ctx;
      const isMoving = props.moving ?? true;

      onMount(() => {
        (isMoving ? movePool : staticPool).add(id);
      });
      onUnmount(() => {
        movePool.delete(id);
        staticPool.delete(id);
      });

      // 返回数据切片：静止实体的速度恒为 0
      return {
        x: props.x ?? 0,
        y: props.y ?? 0,
        vx: isMoving ? (props.vx ?? 0) : 0,
        vy: isMoving ? (props.vy ?? 0) : 0,
      };
    };
  };

  // update: 帧逻辑，只遍历移动池（静止池实体不参与帧写入）
  const update = (frame: FrameManager<T>, delta: number) => {
    for (const id of movePool) {
      frame(id, (e) => {
        e.x += e.vx * delta;
        e.y += e.vy * delta;
      });
    }
  };

  return [register, update] as const;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 边界反弹系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createBoundarySystem<T extends Bounded = Bounded>() {
  const pool = new Set<EntityId>();

  const register = (props: { w?: number; h?: number }) => {
    return (id: EntityId, ctx: Context) => {
      const { onMount, onUnmount } = ctx;
      onMount(() => {
        pool.add(id);
      });
      onUnmount(() => {
        pool.delete(id);
      });

      // 返回数据切片
      return {
        w: props.w ?? 80,
        h: props.h ?? 80,
      };
    };
  };

  const update = (frame: FrameManager<T>) => {
    const maxX = window.innerWidth;
    const maxY = window.innerHeight;

    for (const id of pool) {
      frame(id, (e) => {
        if (e.x < 0) {
          e.x = 0;
          e.vx = -e.vx;
        }
        if (e.x + e.w > maxX) {
          e.x = maxX - e.w;
          e.vx = -e.vx;
        }
        if (e.y < 0) {
          e.y = 0;
          e.vy = -e.vy;
        }
        if (e.y + e.h > maxY) {
          e.y = maxY - e.h;
          e.vy = -e.vy;
        }
      });
    }
  };

  return [register, update] as const;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 碰撞系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createCollisionSystem<T extends Bounded = Bounded>() {
  // 移动池 + 静止池：配对只发生在移动实体侧，静止×静止不检测
  const movePool = new Set<EntityId>();
  const staticPool = new Set<EntityId>();

  const register = (props: { moving?: boolean }) => {
    return (id: EntityId, ctx: Context) => {
      const { onMount, onUnmount } = ctx;
      const isMoving = props.moving ?? true;

      onMount(() => {
        (isMoving ? movePool : staticPool).add(id);
      });
      onUnmount(() => {
        movePool.delete(id);
        staticPool.delete(id);
      });
      // 碰撞系统不产生新数据
      return {};
    };
  };

  // 单对碰撞处理：bStatic 表示 b 是静止实体（障碍物）
  // 速度只处理碰撞法线方向（分离轴）的分量，切线方向分量保留
  const resolve = (frame: FrameManager<T>, idA: EntityId, idB: EntityId, bStatic: boolean) => {
    const a = frame(idA);
    const b = frame(idB);
    if (!a || !b) return;

    // 矩形相交判定
    const hit = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    if (!hit) return;

    // 分开防止重叠：沿重叠较小的轴推离（min-max 精确重叠量，不受尺寸差异影响）
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

    // 静止实体：不交换速度，撞击者按法线方向反弹并推离（障碍物原地不动）
    if (bStatic) {
      frame(idA, (e) => {
        if (overlapX > overlapY) {
          e.vy = -a.vy;
          if (a.y > b.y) e.y += overlapY;
          else e.y -= overlapY;
        } else {
          e.vx = -a.vx;
          if (a.x > b.x) e.x += overlapX;
          else e.x -= overlapX;
        }
      });
      return;
    }

    // 交换速度（只交换法线方向分量）
    const tempVx = a.vx;
    const tempVy = a.vy;

    if (overlapX > overlapY) {
      frame(idA, (e) => {
        e.vy = b.vy;
        if (a.y > b.y) e.y += overlapY;
      });
      frame(idB, (e) => {
        e.vy = tempVy;
        if (a.y <= b.y) e.y += overlapY;
      });
      return;
    }

    frame(idA, (e) => {
      e.vx = b.vx;
      if (a.x > b.x) e.x += overlapX;
    });
    frame(idB, (e) => {
      e.vx = tempVx;
      if (a.x <= b.x) e.x += overlapX;
    });
  };

  // update: 移动×移动去重配对 + 移动×静止全配对
  const update = (frame: FrameManager<T>) => {
    const moves = Array.from(movePool);
    const statics = Array.from(staticPool);

    for (const [i, idA] of moves.entries()) {
      for (const idB of moves.slice(i + 1)) {
        resolve(frame, idA, idB, false);
      }
    }

    for (const idA of moves) {
      for (const idB of statics) {
        resolve(frame, idA, idB, true);
      }
    }
  };

  return [register, update] as const;
}
