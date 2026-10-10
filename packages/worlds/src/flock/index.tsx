// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// flock：两种范式并排的一个世界
//
// 目的不是「做一个鸟群」，是**让两种范式的分工一眼可见**：
//
//   共享机制（createPool）     个体行为（createActorSystem）
//   ─────────────────────      ──────────────────────────
//   movement  积分成位置        bird.onFrame  决定想往哪飞
//   boundary  越界反弹          bird.home     它的地盘
//                               bird.trail    它自己的痕迹
//
// 判据（实测得来，见 docs/game/Kiaao 游戏引擎：范式定位与 Actor 系统.md）：
// **一份代码服务所有实体 → 系统；只有这只个体有 → 方法。**
//
// 屏幕上：方块往自己的出生点附近游荡，身后拖着一条**只属于它自己**的
// 痕迹（别的鸟不读它、也不该读）。痕迹就是「私有记忆」的可见证据。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Each, use, type Context } from "kiaao";

import { WORLD } from "./bird";
import { birdEnters, createBird, define, start, stop } from "./game";

const COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#22d3ee"];

/** 初始分布：排成整齐的网格，便于看清「各自的地盘」 */
const COLS = 5;
const ROWS = 3;

type Spawn = { id: number; x: number; y: number; color: string };

function spawnAll(): Spawn[] {
  const gapX = WORLD.w / COLS;
  const gapY = WORLD.h / ROWS;
  return Array.from({ length: COLS * ROWS }, (_, i) => {
    const [col, row] = [i % COLS, Math.floor(i / COLS)];
    return {
      id: i,
      x: col * gapX + gapX / 2,
      y: row * gapY + gapY / 2,
      color: COLORS[i % COLORS.length],
    };
  });
}

/**
 * 一只鸟的视图。
 *
 * **注册了两个机制的 enter + 个体的 enter**——这一行 `define` 就是
 * 「折中点」的具体形态：
 *   movement.enter / boundary.enter  机制：谁参与
 *   actor.enter                      个体：谁有每帧方法
 */
function Bird({ x, y, color }: Spawn, ctx: Context) {
  const { use: useContext } = ctx;

  // 状态创建时就地绑定私有数据（home / trail / phase）与 onFrame
  const state = createBird({ x, y, color });
  const entity = define(ctx, ...birdEnters)(state);

  // ── 渲染：订阅活对象的快照 ──

  // 位置（每帧变）
  const translate = useContext(entity, () => {
    const s = entity();
    return `${s.x}px ${s.y}px`;
  });

  // **私有记忆的可视化**：把它自己的 trail 画成一条 SVG 折线。
  // 这条线只由它自己的记忆决定——观察它就能确认「私有数据真的各记各的」。
  const trailPoints = useContext(entity, () => {
    const { trail } = entity();
    return trail.map((p) => `${p.x},${p.y}`).join(" ");
  });

  return (
    <>
      <svg class="pointer-events-none absolute inset-0" width={WORLD.w} height={WORLD.h}>
        <polyline
          points={trailPoints}
          fill="none"
          stroke={color}
          stroke-width="1.5"
          opacity="0.45"
        />
      </svg>
      <div
        class="absolute rounded-full"
        style={{
          width: "12px",
          height: "12px",
          marginLeft: "-6px",
          marginTop: "-6px",
          background: color,
          translate,
        }}
      />
    </>
  );
}

export default function Flock(_: Record<string, never>, ctx: Context) {
  const { onMount, onUnmount } = ctx;

  // 运行窗口：挂载开始帧循环，卸载停止（实例常驻模块级）
  onMount(start);
  onUnmount(stop);

  const spawns = use<Spawn[]>(spawnAll());

  return (
    <div class="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-900 p-8">
      <header class="text-center text-slate-200">
        <h1 class="text-xl font-semibold">两种范式并排 · flock</h1>
        <p class="mt-1 max-w-2xl text-sm text-slate-400">
          每个方块往自己的出生点附近游荡，身后拖着一条只属于它自己的痕迹。 ·
          <span class="text-slate-300">移动与反弹</span> 是一份代码服务所有实体（createPool）；
          <span class="text-slate-300">想往哪飞与自己的痕迹</span> 只有它自己有（createActorSystem）
        </p>
      </header>

      <div
        class="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-800"
        style={{ width: `${WORLD.w}px`, height: `${WORLD.h}px` }}
      >
        <Each value={spawns} keyed={(v: Spawn) => v.id}>
          {({ item }) => <Bird {...item()} />}
        </Each>
      </div>
    </div>
  );
}
