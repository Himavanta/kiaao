import { createPool, type EntityId, type Enter, type FrameManager } from "engine";
import { use, type Signal } from "kiaao";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 系统字段需求
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 移动系统字段需求：位置与速度。
 *
 * 「谁被推进」不由字段决定——**注册了 `movement.enter` 的实体就会每帧被推进**。
 *
 * 早期这里有个 `driven` / `moving` 字段用于分池，但它把两件正交的事
 * （「每帧推进位置」与「碰撞里是否为动体」）混成一个，导致挡板无法移动。
 * 现在改由 `define(...)` 里列了哪个 enter 表达，字段取消。
 */
export type Movable = { x: number; y: number; vx: number; vy: number };
/** 边界/碰撞系统字段需求：实体具备尺寸 */
export type Bounded = Movable & { w: number; h: number };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 移动系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createMovementSystem<T extends Movable = Movable>() {
  // 注册进本系统的实体每帧被推进（不注册的实体比如砖块，帧循环里根本不出现）
  const [pool, enter] = createPool<T>();

  // update: 帧逻辑，遍历本池
  const update = (frame: FrameManager<T>, delta: number) => {
    for (const id of pool) {
      // 池与数据池由同一套 onMount/onUnmount 维护，同步是结构保证的
      const e = frame(id)!;
      e.x += e.vx * delta;
      e.y += e.vy * delta;
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

/**
 * 边界系统字段需求：尺寸 + **扁平的**四边动作。
 *
 * 动作刻意不放在嵌套的 `bounds: {}` 里：`flush` 用浅拷贝提交状态，嵌套对象
 * 会与渲染信号共享引用（当前 `bounds` 只读所以安全，但那是靠约定活着）。
 * 拍平后顶层字段天然隔离。
 */
export type BoundedEntity = Bounded & Bounds;

/** 边界系统事件路由：die 边出界（由组装层绑定消费者） */
export type BoundaryRoutes = { onOut?: (payload: { id: EntityId }) => void };

export function createBoundarySystem<T extends BoundedEntity = BoundedEntity>(
  config?: {
    width?: number;
    height?: number;
  },
  routes?: BoundaryRoutes,
) {
  const [pool, enter] = createPool<T>();

  // 水平边处理：left / right（die 边由 update 提前拦截并报告事件）
  const applyHorizontal = (e: T, maxX: number) => {
    const { left, right } = e;
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
    const { top, bottom } = e;
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
    return (
      (e.x < 0 && e.left !== "pass") ||
      (e.x + e.w > maxX && e.right !== "pass") ||
      (e.y < 0 && e.top !== "pass") ||
      (e.y + e.h > maxY && e.bottom !== "pass")
    );
  };

  // 是否存在 die 边出界（出界事实由游戏规则处理）
  const hasDieEdge = (e: T, maxX: number, maxY: number) => {
    return (
      (e.x < 0 && e.left === "die") ||
      (e.x + e.w > maxX && e.right === "die") ||
      (e.y < 0 && e.top === "die") ||
      (e.y + e.h > maxY && e.bottom === "die")
    );
  };

  const update = (frame: FrameManager<T>) => {
    const maxX = config?.width ?? window.innerWidth;
    const maxY = config?.height ?? window.innerHeight;

    for (const id of pool) {
      // 池与数据池同步（结构保证），故用断言；不存在时应当报错而非静默跳过
      const e = frame(id)!;
      if (!isOutOfBounds(e, maxX, maxY)) continue;

      // die 边出界：通过路由报告事实（出界后果由消费者处理），不直接修改数据
      if (hasDieEdge(e, maxX, maxY)) {
        routes?.onOut?.({ id });
        continue;
      }

      applyHorizontal(e, maxX);
      applyVertical(e, maxY);
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

/**
 * 碰撞系统：命中检测与分离。
 *
 * 早期版本从 `e.bounds` 读尺寸，现在改读扁平字段（见 `BoundedEntity`）。
 */
export function createCollisionSystem<T extends Collidable = Collidable>(routes?: CollisionRoutes) {
  // 两个池：只有移动×移动、移动×静止会配对（静止×静止不检测）
  // 「谁是动体」由调用处选了哪个 enter 决定——挡板用 static（它是被撞的障碍），
  // 球用 mover。两者都注册 movement 推进位置，那是另一回事。
  const [movers, enterMover] = createPool<T>();
  const [statics, enterStatic] = createPool<T>();

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

      // `a` 就是活对象本身（不再需要重新取）——直接改
      const dot = a.vx * contact.nx + a.vy * contact.ny;
      a.vx -= 2 * dot * contact.nx;
      a.vy -= 2 * dot * contact.ny;
      // 表面速度传导：静止实体的运动带动撞击者（如挡板带球）
      a.vx += b.drive * b.vx;
      a.vy += b.drive * b.vy;
      a.x += contact.nx * contact.depth;
      a.y += contact.ny * contact.depth;
      return;
    }

    // 移动×移动：交换法线分量（切线保留）+ 双方沿法线分离。
    // 先算好双方各自当时的法线分量再写——写 a 不会影响 b（不同对象），
    // 与写时拷贝时代的语义一致。
    const vaN = a.vx * contact.nx + a.vy * contact.ny;
    const vbN = b.vx * contact.nx + b.vy * contact.ny;

    a.vx += (vbN - vaN) * contact.nx;
    a.vy += (vbN - vaN) * contact.ny;
    a.x += contact.nx * contact.depth;
    a.y += contact.ny * contact.depth;

    b.vx += (vaN - vbN) * contact.nx;
    b.vy += (vaN - vbN) * contact.ny;
    b.x -= contact.nx * contact.depth;
    b.y -= contact.ny * contact.depth;
  };

  // update: 移动×移动去重配对 + 移动×静止全配对
  const update = (frame: FrameManager<T>) => {
    const moveIds = Array.from(movers);
    const staticIds = Array.from(statics);

    for (const [i, idA] of moveIds.entries()) {
      for (const idB of moveIds.slice(i + 1)) {
        resolve(frame, idA, idB, false);
      }
    }

    for (const idA of moveIds) {
      for (const idB of staticIds) {
        resolve(frame, idA, idB, true);
      }
    }
  };

  return { enterMover, enterStatic, update };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 输入系统（源系统：无队列、无 update）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 输入路由表：键（KeyboardEvent.code）→ 动作回调 */
export type InputRoutes = {
  keydown?: Record<string, () => void>;
  keyup?: Record<string, () => void>;
};

/** 输入系统：源系统——DOM 事件到即转发（压入消费者队列），无自己的队列 */
export type InputSystem = {
  /** 只借用宿主实体的生命周期钩子挂监听，不参与池遍历（无字段需求） */
  enter: Enter<Record<string, unknown>>;
  /** 持续状态：方向信号（-1 左 / 0 停 / 1 右），帧逻辑每帧读取 */
  dir: Signal<number>;
};

/**
 * 输入系统：集中管理全局键盘监听 + 持续状态信号
 * - 瞬时动作：路由回调直接调消费者 emit（事件到即转发，无需队列）
 * - 持续状态：路由回调写 dir 信号（方向 -1/0/1），帧逻辑每帧读取
 * - 路由表命中即 preventDefault（游戏键不触发浏览器行为）
 * - 生命周期：enter 借用宿主实体的 ctx 钩子（挂载时挂监听 / 卸载时移除）
 */
export function createInputSystem(routes: InputRoutes): InputSystem {
  const dir = use(0);

  const onKeyDown = (e: KeyboardEvent) => {
    const action = routes.keydown?.[e.code];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const action = routes.keyup?.[e.code];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  // enter：与其他系统同形（不再接收参数、不再返回数据）——
  // 本系统无池、无 update，只借用宿主实体的 ctx 钩子挂监听。
  const enter: Enter<Record<string, unknown>> = (_id, ctx) => {
    ctx.onMount(() => {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
    });
    ctx.onUnmount(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    });
  };

  return { enter, dir };
}
