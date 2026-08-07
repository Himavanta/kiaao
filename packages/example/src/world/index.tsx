import { use } from "kiaao";
import type { Context, Signal } from "kiaao";

import stylex from "./style.module.scss";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 游戏时钟（模块级）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createGame({ time }: { time?: number } = { time: 10 }) {
  const timer = use(0);
  setInterval(() => timer(timer() + 1), time);
  return timer;
}

const timer = createGame();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. defineSystem —— 使用 Map + 显式 ID
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PhysicsEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
}

/**
 * defineSystem 返回一个注册函数。
 * 注册时生成唯一 ID，返回 { id, signal }。
 * 内部使用 Map 存储，删除通过 ID，O(1)。
 */
function defineSystem<T extends PhysicsEntity>(
  systemFn: (pool: Map<string, Signal<T>>, delta: number) => void,
) {
  const pool = new Map<string, Signal<T>>();
  let isActive = false;
  let prevTime = performance.now();
  let idCounter = 0;

  return (context: Context, state: T): { id: string; signal: Signal<T> } => {
    const { use, onUnmount } = context;

    const id = String(++idCounter);
    const signal = use(state) as Signal<T>;

    pool.set(id, signal);

    onUnmount(() => {
      pool.delete(id);
    });

    if (!isActive) {
      isActive = true;
      use(timer, () => {
        const now = performance.now();
        const delta = (now - prevTime) / 1000;
        prevTime = now;
        systemFn(pool, delta);
      });
    }

    return { id, signal };
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 物理系统（移动 + 边界反弹 + 碰撞）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const physicsSystem = defineSystem((pool, delta) => {
  const maxX = window.innerWidth;
  const maxY = window.innerHeight;

  // ─── 1. 移动 + 边界反弹（直接遍历 pool.values()） ──
  for (const sig of pool.values()) {
    const data = sig();
    let { x, y, vx, vy, width, height } = data;
    let bounced = false;

    x += vx * delta;
    y += vy * delta;

    if (x < 0) {
      x = 0;
      vx = -vx;
      bounced = true;
    }
    if (x + width > maxX) {
      x = maxX - width;
      vx = -vx;
      bounced = true;
    }
    if (y < 0) {
      y = 0;
      vy = -vy;
      bounced = true;
    }
    if (y + height > maxY) {
      y = maxY - height;
      vy = -vy;
      bounced = true;
    }

    if (bounced || x !== data.x || y !== data.y) {
      sig({ ...data, x, y, vx, vy });
    }
  }

  // ─── 2. 碰撞检测（转数组快照，仅此处） ──────────────
  const entities = Array.from(pool.values());
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i]();
      const b = entities[j]();

      const hit =
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

      if (hit) {
        const newA = { ...a, vx: -a.vx, vy: -a.vy };
        const newB = { ...b, vx: -b.vx, vy: -b.vy };
        entities[i](newA);
        entities[j](newB);
      }
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. App & Count
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function App() {
  return (
    <>
      <Count x={100} y={100} vx={80} vy={0} color="green" />
      <Count x={300} y={200} vx={-60} vy={30} color="orange" />
      <Count x={500} y={300} vx={40} vy={-50} color="purple" />
    </>
  );
}

function Count(
  { x, y, vx, vy, color }: { x: number; y: number; vx: number; vy: number; color: string },
  context: Context,
) {
  const { use } = context;

  const { signal } = physicsSystem(context, {
    x,
    y,
    vx,
    vy,
    width: 80,
    height: 80,
  });

  // ─── 关键修改：用 transform 替代 left/top ──────────
  const style = use(signal, () => ({
    background: color,
    width: `${signal().width}px`,
    height: `${signal().height}px`,
    // 用 transform 移动，避免触发重排
    transform: `translate(${signal().x}px, ${signal().y}px)`,
  }));

  return <div class={stylex.box} style={style} />;
}
