// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 网格碰撞：矩形与瓦片网格的碰撞解算
//
// 分轴扫掠（先 X 后 Y）：撞墙时贴边并沿墙滑动，而不是整体停下——
// 斜向撞墙时仍能顺着墙面走，这是操作手感的关键。
//
// 扫掠是按格边界精确解算的，不是「按步长试探」：试探会在墙前留下
// 最多一个步长的缝隙，且高速下可能穿透。此处直接算出第一个阻挡格
// 并贴边，任意速度都不会穿透。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { TILE, type Rect } from "./geometry";
import { isBlocked, type Grid } from "./grid";

/** 浮点误差容差：判断边界时避免把「刚好贴边」算成重叠 */
const EPS = 1e-6;

/** 矩形占据的列区间（含两端） */
function columnSpan(rect: Rect): [number, number] {
  return [Math.floor(rect.x / TILE), Math.floor((rect.x + rect.w - EPS) / TILE)];
}

/** 矩形占据的行区间（含两端） */
function rowSpan(rect: Rect): [number, number] {
  return [Math.floor(rect.y / TILE), Math.floor((rect.y + rect.h - EPS) / TILE)];
}

/** 列区间 [top, bottom] 内是否存在阻挡格 */
function columnBlocked(grid: Grid, col: number, top: number, bottom: number): boolean {
  for (let row = top; row <= bottom; row += 1) {
    if (isBlocked(grid, col, row)) return true;
  }
  return false;
}

/** 行区间 [left, right] 内是否存在阻挡格 */
function rowBlocked(grid: Grid, row: number, left: number, right: number): boolean {
  for (let col = left; col <= right; col += 1) {
    if (isBlocked(grid, col, row)) return true;
  }
  return false;
}

/** 矩形是否与任何阻挡格重叠（刚好贴边不算） */
export function rectBlocked(grid: Grid, rect: Rect): boolean {
  const [left, right] = columnSpan(rect);
  const [top, bottom] = rowSpan(rect);

  for (let row = top; row <= bottom; row += 1) {
    if (rowBlocked(grid, row, left, right)) return true;
  }
  return false;
}

/** 水平扫掠：向右移动时，返回第一个阻挡格左沿可到达的最大 x */
function sweepRight(grid: Grid, rect: Rect, target: number): number {
  const [top, bottom] = rowSpan(rect);
  const from = Math.floor((rect.x + rect.w - EPS) / TILE) + 1;
  const to = Math.floor((target + rect.w - EPS) / TILE);

  for (let col = from; col <= to; col += 1) {
    if (columnBlocked(grid, col, top, bottom)) return col * TILE - rect.w;
  }
  return target;
}

/** 水平扫掠：向左移动时，返回第一个阻挡格右沿可到达的最小 x */
function sweepLeft(grid: Grid, rect: Rect, target: number): number {
  const [top, bottom] = rowSpan(rect);
  const from = Math.floor(rect.x / TILE) - 1;
  const to = Math.floor(target / TILE);

  for (let col = from; col >= to; col -= 1) {
    if (columnBlocked(grid, col, top, bottom)) return (col + 1) * TILE;
  }
  return target;
}

/** 垂直扫掠：向下移动时，返回第一个阻挡格上沿可到达的最大 y */
function sweepDown(grid: Grid, rect: Rect, target: number): number {
  const [left, right] = columnSpan(rect);
  const from = Math.floor((rect.y + rect.h - EPS) / TILE) + 1;
  const to = Math.floor((target + rect.h - EPS) / TILE);

  for (let row = from; row <= to; row += 1) {
    if (rowBlocked(grid, row, left, right)) return row * TILE - rect.h;
  }
  return target;
}

/** 垂直扫掠：向上移动时，返回第一个阻挡格下沿可到达的最小 y */
function sweepUp(grid: Grid, rect: Rect, target: number): number {
  const [left, right] = columnSpan(rect);
  const from = Math.floor(rect.y / TILE) - 1;
  const to = Math.floor(target / TILE);

  for (let row = from; row >= to; row -= 1) {
    if (rowBlocked(grid, row, left, right)) return (row + 1) * TILE;
  }
  return target;
}

/**
 * 按位移移动矩形，返回移动后的位置。
 *
 * 分轴解算：先 X 后 Y，Y 轴使用 X 后的位置，保证列区间判定与实际
 * 所处格子一致。地图外视为墙（`isBlocked` 越界返回 true），实体不会
 * 越出地图。
 */
export function moveRect(grid: Grid, rect: Rect, dx: number, dy: number): { x: number; y: number } {
  const x =
    dx === 0
      ? rect.x
      : dx > 0
        ? sweepRight(grid, rect, rect.x + dx)
        : sweepLeft(grid, rect, rect.x + dx);

  const moved = { ...rect, x };
  const y =
    dy === 0
      ? rect.y
      : dy > 0
        ? sweepDown(grid, moved, moved.y + dy)
        : sweepUp(grid, moved, moved.y + dy);

  return { x, y };
}
