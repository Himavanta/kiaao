// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 地图绘制单测：验证「哪些格被画成什么」
//
// canvas 上下文在 happy-dom 中取不到（`getContext("2d")` 返回 null），
// 因此绘制逻辑拆为两层：`planTiles` 是可单测的纯计算，
// `paintGrid` 是依赖上下文的薄壳。此处覆盖前者，以及薄壳的
// 边界行为（无上下文时不抛异常）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, expect, test, vi } from "vite-plus/test";

import { createGrid, setTile } from "../../../world";
import { Tile } from "../../../world/levels/types";
import { TILE } from "../../config";
import { paintGrid, planTiles, TILE_COLORS, type PaintContext, type PaintTarget } from "../paint";

describe("planTiles / 绘制清单", () => {
  test("跳过地板：地板由底色一次铺满，不逐格绘制", () => {
    const grid = createGrid(2, 2);
    expect(planTiles(grid)).toEqual([]);
  });

  test("非地板格的位置与颜色正确", () => {
    const grid = createGrid(3, 2);
    setTile(grid, 1, 0, Tile.Wall);
    setTile(grid, 2, 1, Tile.LowFurniture);

    const plan = planTiles(grid);

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      tile: Tile.Wall,
      x: 1 * TILE,
      y: 0,
      color: TILE_COLORS[Tile.Wall],
      outlined: false,
    });
    expect(plan[1]).toMatchObject({
      tile: Tile.LowFurniture,
      x: 2 * TILE,
      y: 1 * TILE,
      color: TILE_COLORS[Tile.LowFurniture],
      outlined: true,
    });
  });

  test("家具带描边，墙与地板不带", () => {
    const grid = createGrid(4, 1);
    setTile(grid, 0, 0, Tile.Wall);
    setTile(grid, 1, 0, Tile.LowFurniture);
    setTile(grid, 2, 0, Tile.HighFurniture);

    const outlined = planTiles(grid).map((p) => p.outlined);
    expect(outlined).toEqual([false, true, true]);
  });

  test("行主序：索引 → (col, row) 换算正确", () => {
    const grid = createGrid(4, 3);
    setTile(grid, 3, 2, Tile.Wall);

    const [paint] = planTiles(grid);
    expect(paint.x).toBe(3 * TILE);
    expect(paint.y).toBe(2 * TILE);
  });
});

describe("paintGrid / 绘制薄壳", () => {
  /** 记录所有绘制调用的测试替身 */
  function createSpyTarget(): { target: PaintTarget; ctx: PaintContext; calls: string[] } {
    const calls: string[] = [];
    const ctx: PaintContext = {
      fillStyle: "",
      strokeStyle: "",
      fillRect: vi.fn((x, y, w, h) => calls.push(`fill ${x},${y},${w},${h}`)),
      strokeRect: vi.fn((x, y, w, h) => calls.push(`stroke ${x},${y},${w},${h}`)),
    };
    const target: PaintTarget = {
      width: 0,
      height: 0,
      getContext: () => ctx,
    };
    return { target, ctx, calls };
  }

  test("画布尺寸设为网格像素尺寸", () => {
    const { target } = createSpyTarget();
    paintGrid(target, createGrid(10, 5));

    expect(target.width).toBe(10 * TILE);
    expect(target.height).toBe(5 * TILE);
  });

  test("先铺一次地板底色，再逐格画非地板", () => {
    const grid = createGrid(3, 3);
    setTile(grid, 0, 0, Tile.Wall);
    setTile(grid, 1, 1, Tile.HighFurniture);

    const { target, calls } = createSpyTarget();
    paintGrid(target, grid);

    // 第 1 次是全幅底色，之后 2 次填充 + 1 次描边（高家具带描边）
    expect(calls[0]).toBe(`fill 0,0,${3 * TILE},${3 * TILE}`);
    expect(calls.filter((c) => c.startsWith("fill"))).toHaveLength(3);
    expect(calls.filter((c) => c.startsWith("stroke"))).toHaveLength(1);
  });

  test("无 2d 上下文时静默返回，不抛异常", () => {
    const target: PaintTarget = { width: 0, height: 0, getContext: () => null };
    expect(() => paintGrid(target, createGrid(4, 4))).not.toThrow();
  });
});
