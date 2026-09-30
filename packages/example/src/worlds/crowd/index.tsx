// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// crowd 实验入口：一屏 NPC，点谁谁变尸体
//
// 这个 demo 只做一件事：让「一个 NPC 的全部状态与行为能否写在一个组件里」
// 变得可观察。点一个 NPC → 它变尸体 → 视野内的 NPC 恐慌逃离（红），
// 恐慌者又会让更远的人恐慌（链式传播）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Each, use } from "kiaao";

import { WORLD_H, WORLD_W } from "./behaviour";
import { Npc } from "./npc";

/** 出生数据：只在挂载时用一次，之后状态归组件自己管 */
type Spawn = {
  id: number;
  x: number;
  y: number;
  color: string;
};

const PALETTE = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#22d3ee"];

/** 初始分布的列数与行数 */
const COLS = 5;
const ROWS = 4;

/**
 * 初始分布：**排成整齐的网格，不留空随机**。
 *
 * 随机会让「视野内有没有人」每次不同，实验就不可复现了——同一个操作有时
 * 引发恐慌链、有时什么也不发生，等于测不出东西。
 */
function spawnAll(): Spawn[] {
  const gapX = WORLD_W / COLS;
  const gapY = WORLD_H / ROWS;

  return Array.from({ length: COLS * ROWS }, (_, i) => {
    const [col, row] = [i % COLS, Math.floor(i / COLS)];
    return {
      id: i,
      x: col * gapX + gapX / 2,
      y: row * gapY + gapY / 2,
      color: PALETTE[i % PALETTE.length],
    };
  });
}

export default function Crowd() {
  // 出生表在会话内不变——`use` 只是拿一个稳定信号给 Each
  const spawns = use<Spawn[]>(spawnAll());

  return (
    <div class="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-900 p-8">
      <header class="text-center text-slate-200">
        <h1 class="text-xl font-semibold">actor 模型实验 · crowd</h1>
        <p class="mt-1 text-sm text-slate-400">
          点击任意方块使它变成尸体 → 视野内（约 170px）的 NPC 变红恐慌逃离，恐慌者继续传播给更远的人
        </p>
      </header>

      <div
        class="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-800"
        style={{ width: `${WORLD_W}px`, height: `${WORLD_H}px` }}
      >
        <Each value={spawns} keyed={(v: Spawn) => v.id}>
          {({ item }) => <Npc {...item()} />}
        </Each>
      </div>
    </div>
  );
}
