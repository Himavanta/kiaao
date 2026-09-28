// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 碰撞解算单测：扫掠、贴边、滑动、不穿透
//
// 这类错误不会崩溃，只会表现为「撞墙后位置有点偏」「高速时穿墙」——
// 靠肉眼极难定位，必须在纯逻辑层锁死。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, expect, test } from "vite-plus/test";

import { moveRect, rectBlocked } from "../collision";
import { TILE } from "../geometry";
import { createGrid, setTile } from "../grid";
import { Tile } from "../levels/types";

/** 10×6 的空房间，四周为墙 */
function room() {
  const grid = createGrid(10, 6);
  for (const col of Array.from({ length: 10 }, (_, i) => i)) {
    setTile(grid, col, 0, Tile.Wall);
    setTile(grid, col, 5, Tile.Wall);
  }
  for (const row of Array.from({ length: 6 }, (_, i) => i)) {
    setTile(grid, 0, row, Tile.Wall);
    setTile(grid, 9, row, Tile.Wall);
  }
  return grid;
}

/** 位于格 (col,row) 中央的 20×20 矩形 */
function atTile(col: number, row: number) {
  const offset = (TILE - 20) / 2;
  return { x: col * TILE + offset, y: row * TILE + offset, w: 20, h: 20 };
}

describe("moveRect / 自由移动", () => {
  test("无障碍时位移精确生效", () => {
    const grid = room();
    const moved = moveRect(grid, atTile(3, 3), 10, -8);

    const start = atTile(3, 3);
    expect(moved.x).toBeCloseTo(start.x + 10, 6);
    expect(moved.y).toBeCloseTo(start.y - 8, 6);
  });

  test("零位移不改变位置", () => {
    const grid = room();
    const start = atTile(3, 3);
    expect(moveRect(grid, start, 0, 0)).toEqual({ x: start.x, y: start.y });
  });
});

describe("moveRect / 贴边", () => {
  test("向右撞墙：贴住墙的左沿，不重叠", () => {
    const grid = room();
    const start = atTile(7, 3); // 右墙在 col 9

    const moved = moveRect(grid, start, 100, 0);

    // 右边缘应恰好贴住 col 9 的左沿（9 * TILE）
    expect(moved.x + start.w).toBeCloseTo(9 * TILE, 6);
    expect(rectBlocked(grid, { ...start, x: moved.x })).toBe(false);
  });

  test("向左撞墙：贴住墙的右沿", () => {
    const grid = room();
    const start = atTile(2, 3); // 左墙在 col 0

    const moved = moveRect(grid, start, -100, 0);

    expect(moved.x).toBeCloseTo(1 * TILE, 6);
    expect(rectBlocked(grid, { ...start, x: moved.x })).toBe(false);
  });

  test("向下撞墙：贴住墙的上沿", () => {
    const grid = room();
    const start = atTile(4, 3); // 下墙在 row 5

    const moved = moveRect(grid, start, 0, 100);

    expect(moved.y + start.h).toBeCloseTo(5 * TILE, 6);
  });

  test("向上撞墙：贴住墙的下沿", () => {
    const grid = room();
    const start = atTile(4, 2); // 上墙在 row 0

    const moved = moveRect(grid, start, 0, -100);

    expect(moved.y).toBeCloseTo(1 * TILE, 6);
  });
});

describe("moveRect / 分轴滑动", () => {
  test("斜向撞墙：受阻轴停下，另一轴照常移动", () => {
    const grid = room();
    const start = atTile(7, 3);

    // 同时向右（撞墙）与向下（无阻挡）
    const moved = moveRect(grid, start, 100, 20);

    expect(moved.x + start.w).toBeCloseTo(9 * TILE, 6); // 右向被夹住
    expect(moved.y).toBeCloseTo(start.y + 20, 6); // 下向通过
  });

  test("沿墙滑行：墙在右侧时向左移动不受影响", () => {
    const grid = room();
    const start = atTile(7, 3);

    const moved = moveRect(grid, start, -30, 0);
    expect(moved.x).toBeCloseTo(start.x - 30, 6);
  });
});

describe("moveRect / 不穿透", () => {
  test("极大位移不会穿透一格厚的墙", () => {
    const grid = room();
    const start = atTile(1, 3);

    // 单帧位移远超地图宽度——步进试探会穿透，扫掠不会
    const moved = moveRect(grid, start, 10000, 0);

    expect(moved.x + start.w).toBeCloseTo(9 * TILE, 6);
  });

  test("起点重叠时不会被推出（不修正既有重叠）", () => {
    const grid = room();
    // 直接放在墙里
    const inside = { x: 9 * TILE, y: 3 * TILE + 6, w: 20, h: 20 };

    // 向左移动应能离开墙（扫掠从当前格左侧开始找阻挡）
    const moved = moveRect(grid, inside, -40, 0);
    expect(moved.x).toBeLessThan(inside.x);
  });
});

describe("moveRect / 地图边界", () => {
  test("地图外视为墙：实体不会越出地图", () => {
    // 无边界墙的房间：地图外由 isBlocked 兜底
    const grid = createGrid(5, 5);
    const start = { x: TILE, y: TILE, w: 20, h: 20 };

    const right = moveRect(grid, start, 10000, 0);
    expect(right.x + start.w).toBeLessThanOrEqual(5 * TILE);

    const top = moveRect(grid, start, 0, -10000);
    expect(top.y).toBeGreaterThanOrEqual(0);
  });
});

describe("rectBlocked", () => {
  test("空地上不阻挡", () => {
    expect(rectBlocked(room(), atTile(3, 3))).toBe(false);
  });

  test("与墙重叠时阻挡", () => {
    const grid = room();
    expect(rectBlocked(grid, { x: 9 * TILE - 10, y: 3 * TILE + 6, w: 20, h: 20 })).toBe(true);
  });

  test("刚好贴边不算阻挡（边界容差）", () => {
    const grid = room();
    // 右边缘恰好等于 col 9 左沿
    const flush = { x: 9 * TILE - 20, y: 3 * TILE + 6, w: 20, h: 20 };
    expect(rectBlocked(grid, flush)).toBe(false);
  });

  test("矮家具阻挡通行", () => {
    const grid = room();
    setTile(grid, 3, 3, Tile.LowFurniture);

    expect(rectBlocked(grid, atTile(3, 3))).toBe(true);
    // 撞上家具也会被夹住
    const start = atTile(2, 3);
    const moved = moveRect(grid, start, 100, 0);
    expect(moved.x + start.w).toBeCloseTo(3 * TILE, 6);
  });
});
