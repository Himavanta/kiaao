// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A* 寻路单测
//
// 寻路的错误是静默的：路径仍会返回，只是不是最短、或穿过墙角、
// 或绕远。这类问题表现为「NPC 走路有点怪」，靠肉眼无法定位。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, expect, test } from "vite-plus/test";

import { TILE } from "../geometry";
import { createGrid, isBlocked, setTile } from "../grid";
import { Tile } from "../levels/types";
import { cellAt, cellCenter, collectWalkable, findPath, toWaypoints, type Cell } from "../path";

/** 空场地（四周无墙，靠越界兜底） */
const open = () => createGrid(10, 10);

/** 用 ASCII 构造网格：`#` 为墙，其余为地板 */
function fromAscii(rows: string[]) {
  const grid = createGrid(rows[0].length, rows.length);
  rows.forEach((line, row) =>
    // split("") 而非展开：地图为 ASCII，逐 UTF-16 码元即逐字符
    line.split("").forEach((ch, col) => {
      if (ch === "#") setTile(grid, col, row, Tile.Wall);
    }),
  );
  return grid;
}

/** 验证路径的连续性与可通行性 */
function isValidPath(
  grid: ReturnType<typeof open>,
  path: Cell[],
  start: Cell,
  goal: Cell,
): boolean {
  if (path.length === 0) return start.col === goal.col && start.row === goal.row;

  let prev = start;
  for (const cell of path) {
    const step = Math.abs(cell.col - prev.col) + Math.abs(cell.row - prev.row);
    if (step !== 1) return false; // 必须逐格相邻（4 邻域）
    if (isBlocked(grid, cell.col, cell.row)) return false;
    prev = cell;
  }

  const last = path[path.length - 1];
  return last.col === goal.col && last.row === goal.row;
}

describe("findPath / 基本情形", () => {
  test("直线可达：路径长度为曼哈顿距离", () => {
    const grid = open();
    const path = findPath(grid, { col: 0, row: 0 }, { col: 5, row: 0 });

    expect(path).not.toBeNull();
    expect(path!.length).toBe(5);
    expect(isValidPath(grid, path!, { col: 0, row: 0 }, { col: 5, row: 0 })).toBe(true);
  });

  test("路径不含起点、含终点", () => {
    const grid = open();
    const path = findPath(grid, { col: 2, row: 2 }, { col: 4, row: 2 })!;

    expect(path.some((c) => c.col === 2 && c.row === 2)).toBe(false);
    expect(path[path.length - 1]).toEqual({ col: 4, row: 2 });
  });

  test("起点即终点：返回空数组（区别于不可达的 null）", () => {
    const grid = open();
    expect(findPath(grid, { col: 3, row: 3 }, { col: 3, row: 3 })).toEqual([]);
  });

  test("需绕行：绕开中间一堵竖墙", () => {
    // 第 2 列上段为墙（row 0~2），下方留缺口绕行
    const grid = fromAscii(["..#..", "..#..", "..#..", ".....", "....."]);
    const start = { col: 0, row: 0 };
    const goal = { col: 4, row: 0 };

    const path = findPath(grid, start, goal);
    expect(path).not.toBeNull();
    expect(isValidPath(grid, path!, start, goal)).toBe(true);

    // 直线距离 4，但需先下绕、再上行
    expect(path!.length).toBeGreaterThan(4);
  });
});

describe("findPath / 不可达", () => {
  test("完全封闭：返回 null（而非空数组或无限循环）", () => {
    // 第 1 列整列为墙，把左右两侧完全隔开
    const grid = fromAscii([".#...", ".#...", ".#...", ".#...", ".#..."]);
    expect(findPath(grid, { col: 0, row: 0 }, { col: 4, row: 0 })).toBeNull();
  });

  test("目标在墙里：返回 null", () => {
    const grid = open();
    setTile(grid, 5, 5, Tile.Wall);
    expect(findPath(grid, { col: 0, row: 0 }, { col: 5, row: 5 })).toBeNull();
  });

  test("起点在墙里：返回 null", () => {
    const grid = open();
    setTile(grid, 0, 0, Tile.Wall);
    expect(findPath(grid, { col: 0, row: 0 }, { col: 5, row: 5 })).toBeNull();
  });

  test("地图外：返回 null（越界视为墙）", () => {
    const grid = open();
    expect(findPath(grid, { col: 0, row: 0 }, { col: 99, row: 99 })).toBeNull();
  });
});

describe("findPath / 最优性", () => {
  test("找到的是最短路径长度", () => {
    // 10×10 空场：最短距离就是曼哈顿距离
    const grid = open();
    const path = findPath(grid, { col: 0, row: 0 }, { col: 9, row: 9 })!;
    expect(path.length).toBe(18);
  });

  test("绕墙时仍为最优：与备用通道的较短者一致", () => {
    // 两个通道：上方（row 1）与下方（row 1 下方被墙堵住）
    // 第 0 行右侧被墙占据，第 2 行左侧被墙占据，唯一通路是 row 1
    const grid = fromAscii(["....#####.", "..........", "#####....."]);
    const start = { col: 0, row: 0 };
    const goal = { col: 9, row: 0 };

    const path = findPath(grid, start, goal);
    expect(path).not.toBeNull();
    expect(isValidPath(grid, path!, start, goal)).toBe(true);

    // 必须下行、横穿、再上行：0,0 → 0,1 → …→ 9,1 → 9,0
    // 共 1 + 9 + 1 = 11 步
    expect(path!.length).toBe(11);
  });
});

describe("findPath / 边界情形", () => {
  test("1×1 地图：起点即终点", () => {
    const grid = createGrid(1, 1);
    expect(findPath(grid, { col: 0, row: 0 }, { col: 0, row: 0 })).toEqual([]);
  });

  test("单行地图", () => {
    const grid = createGrid(5, 1);
    const path = findPath(grid, { col: 0, row: 0 }, { col: 4, row: 0 })!;
    expect(path.length).toBe(4);
  });

  test("矮家具阻挡通行：寻路绕开", () => {
    const grid = open();
    setTile(grid, 1, 0, Tile.LowFurniture);
    const path = findPath(grid, { col: 0, row: 0 }, { col: 2, row: 0 })!;
    expect(path.length).toBeGreaterThan(2);
    expect(isValidPath(grid, path, { col: 0, row: 0 }, { col: 2, row: 0 })).toBe(true);
  });
});

describe("坐标换算", () => {
  test("cellCenter 取格中心", () => {
    expect(cellCenter({ col: 0, row: 0 })).toEqual({ x: TILE / 2, y: TILE / 2 });
    expect(cellCenter({ col: 2, row: 3 })).toEqual({
      x: 2 * TILE + TILE / 2,
      y: 3 * TILE + TILE / 2,
    });
  });

  test("cellAt 与 cellCenter 互逆", () => {
    for (const cell of [
      { col: 0, row: 0 },
      { col: 5, row: 7 },
      { col: 31, row: 23 },
    ]) {
      const center = cellCenter(cell);
      expect(cellAt(center.x, center.y)).toEqual(cell);
    }
  });

  test("toWaypoints 转出格中心的像素点", () => {
    const waypoints = toWaypoints([
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ]);
    expect(waypoints).toEqual([
      { x: TILE + TILE / 2, y: TILE + TILE / 2 },
      { x: 2 * TILE + TILE / 2, y: TILE + TILE / 2 },
    ]);
  });

  test("collectWalkable 只收集可通行格", () => {
    // 共 6 格，其中 2 格为墙 → 可通行 4 格
    const grid = fromAscii(["#..", ".#."]);
    const cells = collectWalkable(grid);

    expect(cells.length).toBe(4);
    for (const { col, row } of cells) {
      expect(isBlocked(grid, col, row)).toBe(false);
    }
  });
});
