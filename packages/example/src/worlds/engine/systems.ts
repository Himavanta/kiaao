import type { Context } from "kiaao";

import type { EntityId, FrameManager } from "./index";

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

  // enter: 接收配置，返回初始化函数
  const enter = (props: { x?: number; y?: number; vx?: number; vy?: number; moving?: boolean }) => {
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

  return { enter, update };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 边界系统（按边动作：反弹 / 夹住 / 穿过 / 出界）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 边界动作：bounce 反弹 / clamp 夹住 / pass 穿过 / die 标记出界 */
export type BoundAction = "bounce" | "clamp" | "pass" | "die";

/** 四边动作配置 */
export type Bounds = {
  left: BoundAction;
  right: BoundAction;
  top: BoundAction;
  bottom: BoundAction;
};

/** 默认动作：四边反弹（与旧版行为一致） */
const DEFAULT_BOUNDS: Bounds = { left: "bounce", right: "bounce", top: "bounce", bottom: "bounce" };

/** 边界系统字段需求：实体具备尺寸与边界动作 */
export type BoundedEntity = Bounded & { bounds: Bounds };

/** 边界系统事件路由：die 边出界（由组装层绑定消费者） */
export type BoundaryRoutes = { onOut?: (payload: { id: EntityId }) => void };

export function createBoundarySystem<T extends BoundedEntity = BoundedEntity>(
  config?: {
    width?: number;
    height?: number;
  },
  routes?: BoundaryRoutes,
) {
  const pool = new Set<EntityId>();

  const enter = (props: { w?: number; h?: number; bounds?: Partial<Bounds> }) => {
    return (id: EntityId, ctx: Context) => {
      const { onMount, onUnmount } = ctx;
      onMount(() => {
        pool.add(id);
      });
      onUnmount(() => {
        pool.delete(id);
      });

      // 返回数据切片：边界动作参与帧判定
      return {
        w: props.w ?? 80,
        h: props.h ?? 80,
        bounds: { ...DEFAULT_BOUNDS, ...props.bounds },
      };
    };
  };

  // 水平边处理：left / right（die 边由 update 提前拦截并报告事件）
  const applyHorizontal = (e: T, maxX: number) => {
    const { left, right } = e.bounds;
    if (e.x < 0) {
      if (left === "bounce") {
        e.x = 0;
        e.vx = -e.vx;
      } else if (left === "clamp") {
        e.x = 0;
        e.vx = 0;
      }
    }
    if (e.x + e.w > maxX) {
      if (right === "bounce") {
        e.x = maxX - e.w;
        e.vx = -e.vx;
      } else if (right === "clamp") {
        e.x = maxX - e.w;
        e.vx = 0;
      }
    }
  };

  // 垂直边处理：top / bottom（die 边由 update 提前拦截并报告事件）
  const applyVertical = (e: T, maxY: number) => {
    const { top, bottom } = e.bounds;
    if (e.y < 0) {
      if (top === "bounce") {
        e.y = 0;
        e.vy = -e.vy;
      } else if (top === "clamp") {
        e.y = 0;
        e.vy = 0;
      }
    }
    if (e.y + e.h > maxY) {
      if (bottom === "bounce") {
        e.y = maxY - e.h;
        e.vy = -e.vy;
      } else if (bottom === "clamp") {
        e.y = maxY - e.h;
        e.vy = 0;
      }
    }
  };

  // 是否存在需要处理的越界（pass 边忽略）
  const isOutOfBounds = (e: T, maxX: number, maxY: number) => {
    const { bounds } = e;
    return (
      (e.x < 0 && bounds.left !== "pass") ||
      (e.x + e.w > maxX && bounds.right !== "pass") ||
      (e.y < 0 && bounds.top !== "pass") ||
      (e.y + e.h > maxY && bounds.bottom !== "pass")
    );
  };

  // 是否存在 die 边出界（出界事实由游戏规则处理）
  const hasDieEdge = (e: T, maxX: number, maxY: number) => {
    const { bounds } = e;
    return (
      (e.x < 0 && bounds.left === "die") ||
      (e.x + e.w > maxX && bounds.right === "die") ||
      (e.y < 0 && bounds.top === "die") ||
      (e.y + e.h > maxY && bounds.bottom === "die")
    );
  };

  const update = (frame: FrameManager<T>) => {
    const maxX = config?.width ?? window.innerWidth;
    const maxY = config?.height ?? window.innerHeight;

    for (const id of pool) {
      // 读模式判断越界：无越界不写（避免无谓的信号传播）
      const e = frame(id);
      if (!e || !isOutOfBounds(e, maxX, maxY)) continue;

      // die 边出界：通过路由报告事实（出界后果由消费者处理），不直接修改数据
      if (hasDieEdge(e, maxX, maxY)) {
        routes?.onOut?.({ id });
        continue;
      }

      frame(id, (v) => {
        applyHorizontal(v, maxX);
        applyVertical(v, maxY);
      });
    }
  };

  return { enter, update };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 碰撞系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 碰撞形状：矩形（默认）或圆形（半径 = w / 2，要求 w == h） */
export type Shape = "rect" | "circle";

/** 碰撞系统字段需求：实体具备尺寸、形状、碰撞开关、可击碎标记、表面速度传导系数与击碎奖励 */
export type Collidable = Bounded & {
  shape: Shape;
  /** 碰撞开关：false 的实体不参与碰撞判定（如被击碎的砖块） */
  enabled: boolean;
  /** 可击碎标记：被撞击时报告击碎事实 */
  breakable: boolean;
  /** 表面速度传导系数：静止实体的运动带动撞击者（如挡板带球） */
  drive: number;
  /** 击碎奖励：可击碎实体被击碎时的分值（由事件消费系统使用） */
  points: number;
};

/** 接触信息：法线 (nx, ny) 指向 a 被推离 b 的方向，depth 为推离量 */
type Contact = {
  hit: boolean;
  nx: number;
  ny: number;
  depth: number;
};

const noContact: Contact = { hit: false, nx: 0, ny: 0, depth: 0 };

/** 矩形 × 矩形：min-max 重叠，沿重叠较小的轴分离 */
function detectRectRect(a: Bounded, b: Bounded): Contact {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (overlapX <= 0 || overlapY <= 0) return noContact;

  if (overlapX < overlapY) {
    return { hit: true, nx: a.x < b.x ? -1 : 1, ny: 0, depth: overlapX };
  }
  return { hit: true, nx: 0, ny: a.y < b.y ? -1 : 1, depth: overlapY };
}

/** 圆 × 圆：中心距比较，法线 = 圆心连线 */
function detectCircleCircle(a: Bounded, b: Bounded): Contact {
  const ra = a.w / 2;
  const rb = b.w / 2;
  const dx = a.x + ra - (b.x + rb);
  const dy = a.y + ra - (b.y + rb);
  const dist = Math.hypot(dx, dy);
  const minDist = ra + rb;
  if (dist >= minDist) return noContact;

  // 同心退化：任意方向（取 +X）
  if (dist === 0) return { hit: true, nx: 1, ny: 0, depth: ra + rb };
  return { hit: true, nx: dx / dist, ny: dy / dist, depth: minDist - dist };
}

/** 圆 × 矩形：圆心到矩形最近点（Clamp），法线 = 圆心 − 最近点 */
function detectCircleRect(a: Bounded, b: Bounded): Contact {
  const r = a.w / 2;
  const cx = a.x + r;
  const cy = a.y + r;
  const px = Math.max(b.x, Math.min(cx, b.x + b.w));
  const py = Math.max(b.y, Math.min(cy, b.y + b.h));
  const dx = cx - px;
  const dy = cy - py;
  const distSq = dx * dx + dy * dy;
  if (distSq >= r * r) return noContact;

  // 圆心在矩形内（最近点 = 圆心）：选穿透最浅的边推离
  if (distSq === 0) {
    const edges = [
      { nx: -1, ny: 0, depth: cx - b.x },
      { nx: 1, ny: 0, depth: b.x + b.w - cx },
      { nx: 0, ny: -1, depth: cy - b.y },
      { nx: 0, ny: 1, depth: b.y + b.h - cy },
    ];
    edges.sort((m, n) => m.depth - n.depth);
    const { nx, ny, depth } = edges[0];
    return { hit: true, nx, ny, depth: depth + r };
  }

  const dist = Math.sqrt(distSq);
  return { hit: true, nx: dx / dist, ny: dy / dist, depth: r - dist };
}

/** 交换 a/b 后法线取反（detect 的法线约定是"a 远离 b"） */
function invert(c: Contact): Contact {
  return c.hit ? { hit: true, nx: -c.nx, ny: -c.ny, depth: c.depth } : c;
}

/** 碰撞系统事件路由：击碎 / 弹碰（由组装层绑定消费者） */
export type CollisionRoutes = {
  onBreak?: (payload: { id: EntityId; by: EntityId; points: number }) => void;
  onBounce?: (payload: { id: EntityId; by: EntityId }) => void;
};

export function createCollisionSystem<T extends Collidable = Collidable>(routes?: CollisionRoutes) {
  // 移动池 + 静止池：配对只发生在移动实体侧，静止×静止不检测
  const movePool = new Set<EntityId>();
  const staticPool = new Set<EntityId>();

  const enter = (props: {
    moving?: boolean;
    shape?: Shape;
    enabled?: boolean;
    breakable?: boolean;
    drive?: number;
    points?: number;
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

      // 返回数据切片：形状/开关/可击碎/传导系数/击碎奖励参与碰撞判定
      return {
        shape: props.shape ?? "rect",
        enabled: props.enabled ?? true,
        breakable: props.breakable ?? false,
        drive: props.drive ?? 0,
        points: props.points ?? 0,
      };
    };
  };

  // 单对碰撞处理：bStatic 表示 b 是静止实体（障碍物）
  const resolve = (frame: FrameManager<T>, idA: EntityId, idB: EntityId, bStatic: boolean) => {
    const a = frame(idA);
    const b = frame(idB);
    if (!a || !b) return;

    // 已禁用的实体不参与碰撞（如被击碎的砖块）
    if (!a.enabled || !b.enabled) return;

    // 按形状配对选择检测函数（法线统一指向"a 远离 b"）
    const contact =
      a.shape === "circle"
        ? b.shape === "circle"
          ? detectCircleCircle(a, b)
          : detectCircleRect(a, b)
        : b.shape === "circle"
          ? invert(detectCircleRect(b, a))
          : detectRectRect(a, b);
    if (!contact.hit) return;

    // 静止实体：报告事实 + 反射/推离（障碍物原地不动）
    if (bStatic) {
      // 可击碎实体：通过路由报告击碎事实（禁用/加分/加速由消费者落地）
      if (b.breakable) routes?.onBreak?.({ id: idB, by: idA, points: b.points });
      else routes?.onBounce?.({ id: idB, by: idA });

      frame(idA, (e) => {
        const dot = e.vx * contact.nx + e.vy * contact.ny;
        e.vx -= 2 * dot * contact.nx;
        e.vy -= 2 * dot * contact.ny;
        // 表面速度传导：静止实体的运动带动撞击者（如挡板带球）
        e.vx += b.drive * b.vx;
        e.vy += b.drive * b.vy;
        e.x += contact.nx * contact.depth;
        e.y += contact.ny * contact.depth;
      });
      return;
    }

    // 移动×移动：交换法线分量（切线保留）+ 双方沿法线分离
    const vaN = a.vx * contact.nx + a.vy * contact.ny;
    const vbN = b.vx * contact.nx + b.vy * contact.ny;

    frame(idA, (e) => {
      const curN = e.vx * contact.nx + e.vy * contact.ny;
      e.vx += (vbN - curN) * contact.nx;
      e.vy += (vbN - curN) * contact.ny;
      e.x += contact.nx * contact.depth;
      e.y += contact.ny * contact.depth;
    });
    frame(idB, (e) => {
      const curN = e.vx * contact.nx + e.vy * contact.ny;
      e.vx += (vaN - curN) * contact.nx;
      e.vy += (vaN - curN) * contact.ny;
      e.x -= contact.nx * contact.depth;
      e.y -= contact.ny * contact.depth;
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

  return { enter, update };
}
