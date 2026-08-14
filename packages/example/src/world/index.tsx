import type { Context, Signal } from "kiaao";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 帧管理器（延迟快照）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 实体标识：Symbol 天然唯一，全链路统一使用 */
type EntityId = symbol;

/**
 * 帧管理器：单函数双签名，实体结构 T 开放，由注册系统的字段切片合并决定。
 * - frame(id)     读：缓存优先，无缓存取信号当前值，不拷贝
 * - frame(id, fn) 写：首次写时拷贝信号值入缓存，fn 原地修改副本（写时拷贝）
 */
type FrameManager<T extends Record<string, any> = Record<string, any>> = {
  (id: EntityId): Readonly<T> | undefined;
  (id: EntityId, mutate: (value: T) => void): void;
};

/** 帧缓冲：frame 供系统读写，flush 由帧循环持有，帧末提交 */
type FrameBuffer<T extends Record<string, any>> = {
  frame: FrameManager<T>;
  flush: () => void;
};

function createFrameManager<T extends Record<string, any>>(
  gamePool: Map<EntityId, Signal<T>>,
): FrameBuffer<T> {
  const cache = new Map<EntityId, T>();

  function frame(id: EntityId, mutate?: (value: T) => void) {
    const signal = gamePool.get(id);
    if (!signal) return;

    if (mutate) {
      // 写：首次拷贝底值入缓存，同帧复用可变副本
      let base = cache.get(id);
      if (!base) {
        base = { ...signal() };
        cache.set(id, base);
      }
      mutate(base);
    } else {
      // 读：缓存优先，无则取信号当前值，不拷贝
      return cache.get(id) ?? signal();
    }
  }

  // 帧末：提交所有脏数据并清空缓存
  function flush() {
    for (const [id, data] of cache) {
      const signal = gamePool.get(id);
      if (signal) signal(data);
    }
    cache.clear();
  }

  return { frame, flush };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 系统工厂：移动系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 系统字段需求：移动系统要求实体具备位置与速度 */
type Movable = { x: number; y: number; vx: number; vy: number };
/** 系统字段需求：边界/碰撞系统要求实体具备尺寸 */
type Bounded = Movable & { w: number; h: number };

function createMovementSystem<T extends Movable = Movable>() {
  // 系统私有池：存储哪些实体受此系统影响
  const pool = new Set<EntityId>();

  // register: 接收配置，返回初始化函数
  const register = (props: { x?: number; y?: number; vx?: number; vy?: number }) => {
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
        x: props.x ?? 0,
        y: props.y ?? 0,
        vx: props.vx ?? 0,
        vy: props.vy ?? 0,
      };
    };
  };

  // update: 帧逻辑，写时拷贝原地修改
  const update = (frame: FrameManager<T>, delta: number) => {
    for (const id of pool) {
      frame(id, (e) => {
        e.x += e.vx * delta;
        e.y += e.vy * delta;
      });
    }
  };

  return [register, update] as const;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 系统工厂：边界反弹系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createBoundarySystem<T extends Bounded = Bounded>() {
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
// 4. 系统工厂：碰撞系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createCollisionSystem<T extends Bounded = Bounded>() {
  const pool = new Set<EntityId>();

  const register = () => {
    return (id: EntityId, ctx: Context) => {
      const { onMount, onUnmount } = ctx;
      onMount(() => {
        pool.add(id);
      });
      onUnmount(() => {
        pool.delete(id);
      });
      // 碰撞系统不产生新数据
      return {};
    };
  };

  const update = (frame: FrameManager<T>) => {
    const entities = Array.from(pool);

    for (const [i, idA] of entities.entries()) {
      for (const idB of entities.slice(i + 1)) {
        const a = frame(idA);
        const b = frame(idB);
        if (!a || !b) continue;

        // 矩形相交判定
        const hit = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        if (!hit) continue;

        // 交换速度
        const tempVx = a.vx;
        const tempVy = a.vy;

        // 分开防止重叠
        const overlapX = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
        const overlapY = (a.h + b.h) / 2 - Math.abs(a.y - b.y);

        if (overlapX > overlapY) {
          frame(idA, (e) => {
            e.vx = b.vx;
            e.vy = b.vy;
            if (a.y > b.y) e.y += overlapY;
          });
          frame(idB, (e) => {
            e.vx = tempVx;
            e.vy = tempVy;
            if (a.y <= b.y) e.y += overlapY;
          });
        } else {
          frame(idA, (e) => {
            e.vx = b.vx;
            e.vy = b.vy;
            if (a.x > b.x) e.x += overlapX;
          });
          frame(idB, (e) => {
            e.vx = tempVx;
            e.vy = tempVy;
            if (a.x <= b.x) e.x += overlapX;
          });
        }
      }
    }
  };

  return [register, update] as const;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 游戏引擎
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 系统更新函数：帧逻辑入口，统一签名 (frame, delta) */
type Update<T extends Record<string, any> = Record<string, any>> = (
  frame: FrameManager<T>,
  delta: number,
) => void;

function createGame<T extends Record<string, any> = Record<string, any>>(
  ...updates: Array<Update<T>>
) {
  // 主数据池：id → Signal
  const gamePool = new Map<EntityId, Signal<T>>();

  let prevTime = performance.now();
  let rafId = 0;

  function loop() {
    const now = performance.now();
    const delta = Math.min((now - prevTime) / 1000, 0.05);
    prevTime = now;

    // 创建帧管理器（延迟快照）
    const { frame, flush } = createFrameManager(gamePool);

    // 按顺序执行所有系统
    for (const update of updates) {
      update(frame, delta);
    }

    // 帧末提交所有脏数据
    flush();

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

  // ─── useGame: 组件注册实体 ──────────────────────────
  const useGame = (
    ctx: Context,
    ...registers: Array<(id: EntityId, ctx: Context) => Partial<T>>
  ): Signal<T> => {
    const { use, onMount, onUnmount } = ctx;
    const id = Symbol();

    // 1. 合并各系统数据切片
    // 框架契约：注册的系统切片合并后构成完整实体；
    // 系统 update 消费的字段（如碰撞的 w/h）必须由注册的某系统切片提供
    const merged = {} as T;
    for (const register of registers) {
      Object.assign(merged, register(id, ctx));
    }

    // 2. 创建信号
    const signal = use<T>(merged);

    // 3. 将信号存入 gamePool
    onMount(() => {
      gamePool.set(id, signal);
    });

    onUnmount(() => {
      gamePool.delete(id);
    });

    return signal;
  };

  return {
    useGame,
    // 销毁：停止帧循环（组件卸载、游戏结束等场景）
    dispose: () => cancelAnimationFrame(rafId),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 创建游戏实例
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 示例实体：结构由使用者自定义，取决于注册了哪些系统 */
type BoxEntity = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
};

const [regMove, updMove] = createMovementSystem<BoxEntity>();
const [regBound, updBound] = createBoundarySystem<BoxEntity>();
const [regColl, updColl] = createCollisionSystem<BoxEntity>();

const { useGame } = createGame(updMove, updBound, updColl);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Box 组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type BoxProps = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
};

function Box({ x, y, vx, vy, color }: BoxProps, ctx: Context) {
  const { use } = ctx;

  const entity = useGame(ctx, regMove({ x, y, vx, vy }), regBound({ w: 80, h: 80 }), regColl());

  const style = use(entity, () => {
    const e = entity();
    return {
      position: "fixed" as const,
      width: `${e.w}px`,
      height: `${e.h}px`,
      background: color,
      borderRadius: "8px",
      transform: `translate(${e.x}px, ${e.y}px)`,
      willChange: "transform",
    };
  });

  return <div style={style} />;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. App
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function App() {
  return (
    <>
      <Box x={100} y={100} vx={150} vy={50} color="#e74c3c" />
      <Box x={400} y={300} vx={-100} vy={-80} color="#3498db" />
      <Box x={700} y={200} vx={60} vy={120} color="#2ecc71" />
      <Box x={200} y={500} vx={-200} vy={-30} color="#f39c12" />
    </>
  );
}
