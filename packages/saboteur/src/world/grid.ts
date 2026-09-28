// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 瓦片网格：通行性与视线遮挡查询
//
// 两张位图而非一张（规划文档 4.1）：矮家具挡路但看得穿，
// 高家具两者都挡。合成一张会让「绕柱躲避」「趴下躲视线」
// 这类玩法无法表达。
//
// 查询均为 O(1) 下标访问，越界返回安全值（不可通行、阻挡视线）——
// 地图外一律视为墙，调用方无需自行判边界。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Tile } from "./levels/types";

export type Grid = {
  cols: number;
  rows: number;
  /** 瓦片类型矩阵（行主序） */
  tiles: Uint8Array;
};

/** 创建空网格（全地板） */
export function createGrid(cols: number, rows: number): Grid {
  return { cols, rows, tiles: new Uint8Array(cols * rows) };
}

/** 坐标是否在网格内 */
export function inBounds(grid: Grid, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < grid.cols && row < grid.rows;
}

/** 读取瓦片；越界返回 Wall（地图外视为实心） */
export function tileAt(grid: Grid, col: number, row: number): Tile {
  if (!inBounds(grid, col, row)) return Tile.Wall;
  return grid.tiles[row * grid.cols + col] as Tile;
}

/** 写入瓦片；越界静默忽略 */
export function setTile(grid: Grid, col: number, row: number, tile: Tile): void {
  if (!inBounds(grid, col, row)) return;
  grid.tiles[row * grid.cols + col] = tile;
}

/** 该格是否阻挡通行（墙、矮家具、高家具） */
export function isBlocked(grid: Grid, col: number, row: number): boolean {
  return tileAt(grid, col, row) !== Tile.Floor;
}

/** 该格是否阻挡视线（墙、高家具） */
export function isOpaque(grid: Grid, col: number, row: number): boolean {
  const tile = tileAt(grid, col, row);
  return tile === Tile.Wall || tile === Tile.HighFurniture;
}
