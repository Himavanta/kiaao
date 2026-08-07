import type { Context, Signal } from "kiaao";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 类型定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SystemWithPool {
  update: (pool: Set<string>, frame: Map<string, any>, delta: number) => void;
  init?: (props?: any) => Record<string, any>;
  pool: Set<string>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. defineSystem —— 只有两个位置参数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function defineSystem(
  update: (pool: Set<string>, frame: Map<string, any>, delta: number) => void,
  init?: (props?: any) => Record<string, any>,
): SystemWithPool {
  const pool = new Set<string>();
  return { update, init, pool };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 具体系统（每个系统只关心自己的字段）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 3.1 移动系统
const movementSystem = defineSystem(
  (pool, frame, delta) => {
    for (const id of pool) {
      const e = frame.get(id);
      if (!e) continue;
      e.x += e.vx * delta;
      e.y += e.vy * delta;
    }
  },
  (props) => ({
    x: props?.x ?? 0,
    y: props?.y ?? 0,
    vx: props?.vx ?? 0,
    vy: props?.vy ?? 0,
  }),
);

// 3.2 边界反弹系统
const boundarySystem = defineSystem(
  (pool, frame) => {
    const maxX = window.innerWidth;
    const maxY = window.innerHeight;
    for (const id of pool) {
      const e = frame.get(id);
      if (!e) continue;
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
    }
  },
  (props) => ({
    w: props?.w ?? 80,
    h: props?.h ?? 80,
  }),
);

// 3.3 碰撞系统
const collisionSystem = defineSystem(
  (pool, frame) => {
    const entities = Array.from(pool);
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = frame.get(entities[i]);
        const b = frame.get(entities[j]);
        if (!a || !b) continue;

        const hit = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

        if (hit) {
          // 交换速度（弹性碰撞）
          const tempVx = a.vx;
          const tempVy = a.vy;
          a.vx = b.vx;
          a.vy = b.vy;
          b.vx = tempVx;
          b.vy = tempVy;

          // 分开防止重叠
          const overlapX = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
          const overlapY = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
          if (overlapX > overlapY) {
            if (a.y > b.y) {
              a.y += overlapY;
            } else {
              b.y += overlapY;
            }
          } else {
            if (a.x > b.x) {
              a.x += overlapX;
            } else {
              b.x += overlapX;
            }
          }
        }
      }
    }
  },
  // 碰撞系统不需要额外的 init，因为它复用了 boundarySystem 的 w/h
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 游戏引擎
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createGame(...systems: SystemWithPool[]) {
  const gamePool = new Map<string, Signal<any>>();

  let prevTime = performance.now();

  function loop() {
    const now = performance.now();
    const delta = Math.min((now - prevTime) / 1000, 0.05); // 限制最大步长
    prevTime = now;

    // ─── 1. 创建帧快照（浅拷贝） ────────────────────
    const frame = new Map<string, any>();
    for (const [id, signal] of gamePool) {
      frame.set(id, { ...signal() });
    }

    // ─── 2. 按顺序执行所有系统 ──────────────────────
    for (const sys of systems) {
      sys.update(sys.pool, frame, delta);
    }

    // ─── 3. 只更新有变化的信号 ──────────────────────
    for (const [id, newData] of frame) {
      const signal = gamePool.get(id);
      if (!signal) continue;
      const oldData = signal();
      // 简单比较所有字段
      let changed = false;
      for (const key in newData) {
        if (oldData[key] !== newData[key]) {
          changed = true;
          break;
        }
      }
      if (changed) signal(newData);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // ─── useGame: 组件注册实体 ──────────────────────────
  const useGame = (ctx: Context, initData: Record<string, any>, ...sysDeps: SystemWithPool[]) => {
    const { use, onMount, onUnmount } = ctx;
    const id = crypto.randomUUID();

    // 1. 收集所有系统的 init 函数，合并初始数据
    let mergedData: Record<string, any> = {};
    for (const sys of sysDeps) {
      if (sys.init) {
        const part = sys.init(initData);
        Object.assign(mergedData, part);
      }
    }
    // 用户传入的 initData 优先级最高（覆盖系统默认）
    mergedData = { ...mergedData, ...initData };

    // 2. 创建信号（数据结构由系统动态决定）
    const signal = use<any>({ id, ...mergedData });

    // 3. 注册到各系统的 pool
    onMount(() => {
      gamePool.set(id, signal);
      for (const sys of sysDeps) {
        sys.pool.add(id);
      }
    });

    onUnmount(() => {
      gamePool.delete(id);
      for (const sys of sysDeps) {
        sys.pool.delete(id);
      }
    });

    return signal;
  };

  return { useGame };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 创建游戏实例（系统顺序 = 执行顺序）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const { useGame } = createGame(
  movementSystem, // 1. 移动
  boundarySystem, // 2. 边界
  collisionSystem, // 3. 碰撞
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Box 组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Box({ x, y, vx, vy, color }: any, ctx: Context) {
  const { use } = ctx;

  // 注册实体，只传入位置和速度（w/h 由系统 init 提供默认值）
  const entity = useGame(ctx, { x, y, vx, vy }, movementSystem, boundarySystem, collisionSystem);

  // 视图派生
  const style = use(entity, () => ({
    position: "fixed" as const,
    width: `${entity().w}px`,
    height: `${entity().h}px`,
    background: color,
    borderRadius: "8px",
    transform: `translate(${entity().x}px, ${entity().y}px)`,
    willChange: "transform",
  }));

  return <div style={style} />;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. App
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
