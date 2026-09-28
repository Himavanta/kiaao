// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 地图绘制：把网格画到 2D 上下文
//
// 与指令分离，因为 canvas 上下文在测试环境（happy-dom）取不到——
// 分离后绘制指令本身是薄壳，而「画了什么」由可注入的收集器验证。
//
// 切片阶段用程序化占位（规划文档 6.5）：图集接口定下后，
// 把 drawTile 换成 drawImage 即可，其余逻辑不变。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Tile, type Grid } from "../../world";
import { TILE } from "../config";

/**
 * 绘制目标：只声明我们实际使用的 canvas 成员。
 *
 * 属性类型用 canvas 的完整联合类型（而非 `string`）——否则
 * `HTMLCanvasElement` 无法结构化满足本类型，调用方就得强转。
 */
export type PaintTarget = {
  width: number;
  height: number;
  getContext(contextId: "2d"): PaintContext | null;
};

/** 绘制上下文中我们实际使用的子集 */
export type PaintContext = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
};

/** 各瓦片类型的填充色，下标与 `Tile` 值对应 */
export const TILE_COLORS: readonly string[] = [
  "#2a2622", // Floor
  "#4a4038", // Wall
  "#6b5a48", // LowFurniture
  "#53463a", // HighFurniture
];

/** 家具加描边以与地板拉开层次——纯色差在暗场景里不够分辨 */
const OUTLINED = new Set<Tile>([Tile.LowFurniture, Tile.HighFurniture]);

/** 单个瓦片的绘制位置与样式 */
export type TilePaint = {
  tile: Tile;
  x: number;
  y: number;
  color: string;
  outlined: boolean;
};

/**
 * 计算需要绘制的瓦片（跳过地板——它由底色一次铺满）。
 *
 * 纯函数：给定网格产出绘制清单，不触碰 canvas，可直接单测。
 */
export function planTiles(grid: Grid): TilePaint[] {
  const plan: TilePaint[] = [];

  for (const [index, raw] of grid.tiles.entries()) {
    // Uint8Array 迭代产出 number；存储侧保证值域与 Tile 一致
    const tile = raw as Tile;
    if (tile === Tile.Floor) continue;

    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    plan.push({
      tile,
      x: col * TILE,
      y: row * TILE,
      color: TILE_COLORS[tile],
      outlined: OUTLINED.has(tile),
    });
  }

  return plan;
}

/** 把网格画到 canvas：先铺地板底色，再逐格绘制非地板瓦片 */
export function paintGrid(canvas: PaintTarget, grid: Grid): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = grid.cols * TILE;
  canvas.height = grid.rows * TILE;

  ctx.fillStyle = TILE_COLORS[Tile.Floor];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const { x, y, color, outlined } of planTiles(grid)) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, TILE, TILE);

    if (outlined) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    }
  }
}
