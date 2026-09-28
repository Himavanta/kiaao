// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A* 寻路：网格上的最短路径
//
// 4 邻域 + 曼哈顿启发式。4 邻域（而非 8）与移动系统的 4 向位移一致——
// 若寻路给出斜向路径，移动系统走不出来，NPC 会在拐角处卡住或抖动。
//
// 启发式在 4 向移动下是可采纳的（永不高估），故 A* 找到的是最优解。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { TILE } from "./geometry";
import { isBlocked, type Grid } from "./grid";

/** 格子坐标 */
export type Cell = { col: number; row: number };

/** 像素坐标（世界坐标） */
export type Vec2 = { x: number; y: number };

/** 4 邻域偏移 */
const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** 曼哈顿距离：4 向移动下的可采纳启发式 */
function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/** 开放集节点：`f = g + h` */
type OpenNode = { key: number; f: number };

// ── 二叉最小堆 ────────────────────────────────────────
// 用数组直接操作而非包一层类：堆是局部实现细节，包装没有收益。

function heapPush(heap: OpenNode[], node: OpenNode): void {
  heap.push(node);
  let i = heap.length - 1;

  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].f <= heap[i].f) return;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function heapPop(heap: OpenNode[]): OpenNode | undefined {
  const [top] = heap;
  if (!top) return undefined;

  const last = heap.pop() as OpenNode;
  if (heap.length === 0) return top;

  heap[0] = last;
  let i = 0;

  while (true) {
    const left = 2 * i + 1;
    const right = left + 1;
    let smallest = i;

    if (left < heap.length && heap[left].f < heap[smallest].f) smallest = left;
    if (right < heap.length && heap[right].f < heap[smallest].f) smallest = right;
    if (smallest === i) return top;

    [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
    i = smallest;
  }
}

/** 从终点回溯到起点，返回「起点之后到终点」的格子序列 */
function reconstruct(from: Int32Array, goalKey: number, cols: number, startKey: number): Cell[] {
  const reversed: Cell[] = [];
  let key = goalKey;

  while (key !== startKey && key !== -1) {
    const col = key % cols;
    reversed.push({ col, row: (key - col) / cols });
    key = from[key];
  }

  return reversed.reverse();
}

/**
 * 求 start → goal 的最短路径。
 *
 * 返回的序列**不含起点、含终点**；起点即终点时返回空数组。
 * 无路径（被墙完全隔开）或起点 / 终点不可通行时返回 `null` ——
 * 与空数组区分开，调用方才能分辨「已在目标点」与「到不了」。
 */
export function findPath(grid: Grid, start: Cell, goal: Cell): Cell[] | null {
  if (isBlocked(grid, start.col, start.row)) return null;
  if (isBlocked(grid, goal.col, goal.row)) return null;
  if (start.col === goal.col && start.row === goal.row) return [];

  const { cols } = grid;
  const size = grid.cols * grid.rows;

  // 定长数组而非 Map：网格规模固定，下标即节点键，避免哈希开销
  const gScore = new Float64Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);

  const startKey = start.row * cols + start.col;
  const goalKey = goal.row * cols + goal.col;
  const heap: OpenNode[] = [];

  gScore[startKey] = 0;
  heapPush(heap, { key: startKey, f: manhattan(start, goal) });

  while (heap.length > 0) {
    const node = heapPop(heap) as OpenNode;
    if (closed[node.key]) continue;
    closed[node.key] = 1;

    if (node.key === goalKey) return reconstruct(cameFrom, goalKey, cols, startKey);

    const col = node.key % cols;
    const row = (node.key - col) / cols;

    for (const [dc, dr] of NEIGHBORS) {
      const nc = col + dc;
      const nr = row + dr;
      if (isBlocked(grid, nc, nr)) continue;

      const nk = nr * cols + nc;
      if (closed[nk]) continue;

      const tentative = gScore[node.key] + 1;
      if (tentative >= gScore[nk]) continue;

      gScore[nk] = tentative;
      cameFrom[nk] = node.key;
      heapPush(heap, { key: nk, f: tentative + manhattan({ col: nc, row: nr }, goal) });
    }
  }

  return null;
}

/** 格子坐标 → 该格中心的像素坐标 */
export function cellCenter(cell: Cell): Vec2 {
  return { x: cell.col * TILE + TILE / 2, y: cell.row * TILE + TILE / 2 };
}

/** 像素坐标 → 所在格。非有限坐标返回 `null`——调用方需显式处理无位置的情形 */
export function cellAt(x: number, y: number): Cell | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

/** 路径 → 像素路径点（格中心） */
export function toWaypoints(path: Cell[]): Vec2[] {
  return path.map(cellCenter);
}

/** 收集所有可通行格：随机目的地的候选集 */
export function collectWalkable(grid: Grid): Cell[] {
  const cells: Cell[] = [];

  for (const [key, tile] of grid.tiles.entries()) {
    if (tile !== 0) continue;
    const col = key % grid.cols;
    cells.push({ col, row: (key - col) / grid.cols });
  }

  return cells;
}
