// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 世界层单测：网格查询 + 关卡解析
//
// 纯逻辑可在 DOM 环境外直接测（规划文档 9.1）——这是分层边界的
// 直接收益。覆盖的是最容易静默出错的部分：越界、视线与通行性的
// 区分、出生点提取。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, expect, test } from "vite-plus/test";

import { createGrid, inBounds, isBlocked, isOpaque, setTile, tileAt } from "../grid";
import { parseMap } from "../levels/parse";
import { Tile, type LevelDef } from "../levels/types";

/** 测试用关卡：补上 objective（大多数用例不关心它） */
const lv = (def: Omit<LevelDef, "objective">): LevelDef => ({
  ...def,
  objective: { killGoal: 1, timeLimit: 60 },
});

describe("网格 / 越界安全", () => {
  test("越界读取视为墙：不可通行且阻挡视线", () => {
    const grid = createGrid(4, 3);

    expect(tileAt(grid, -1, 0)).toBe(Tile.Wall);
    expect(tileAt(grid, 0, -1)).toBe(Tile.Wall);
    expect(tileAt(grid, 4, 0)).toBe(Tile.Wall);
    expect(tileAt(grid, 0, 3)).toBe(Tile.Wall);

    expect(isBlocked(grid, -1, 0)).toBe(true);
    expect(isOpaque(grid, 99, 99)).toBe(true);
  });

  test("越界写入静默忽略，不抛异常也不扩展网格", () => {
    const grid = createGrid(4, 3);
    expect(() => setTile(grid, -1, 0, Tile.Wall)).not.toThrow();
    expect(() => setTile(grid, 99, 99, Tile.Wall)).not.toThrow();
    expect(grid.tiles.length).toBe(12);
  });

  test("inBounds 判定四边", () => {
    const grid = createGrid(4, 3);
    expect(inBounds(grid, 0, 0)).toBe(true);
    expect(inBounds(grid, 3, 2)).toBe(true);
    expect(inBounds(grid, 4, 2)).toBe(false);
    expect(inBounds(grid, 3, 3)).toBe(false);
  });
});

describe("网格 / 通行性与视线分离", () => {
  test("矮家具挡路但不挡视线", () => {
    const grid = createGrid(3, 1);
    setTile(grid, 1, 0, Tile.LowFurniture);

    expect(isBlocked(grid, 1, 0)).toBe(true);
    expect(isOpaque(grid, 1, 0)).toBe(false);
  });

  test("高家具两者都挡", () => {
    const grid = createGrid(3, 1);
    setTile(grid, 1, 0, Tile.HighFurniture);

    expect(isBlocked(grid, 1, 0)).toBe(true);
    expect(isOpaque(grid, 1, 0)).toBe(true);
  });

  test("墙两者都挡；地板两者都不挡", () => {
    const grid = createGrid(3, 1);
    setTile(grid, 1, 0, Tile.Wall);

    expect(isBlocked(grid, 1, 0)).toBe(true);
    expect(isOpaque(grid, 1, 0)).toBe(true);
    expect(isBlocked(grid, 0, 0)).toBe(false);
    expect(isOpaque(grid, 0, 0)).toBe(false);
  });
});

describe("地图解析 / 只解读几何", () => {
  test("静态符号解析为对应瓦片", () => {
    const { grid } = parseMap(lv({ name: "t", rows: ["#tT.", "#..."] }));

    expect(tileAt(grid, 0, 0)).toBe(Tile.Wall);
    expect(tileAt(grid, 1, 0)).toBe(Tile.LowFurniture);
    expect(tileAt(grid, 2, 0)).toBe(Tile.HighFurniture);
    expect(tileAt(grid, 3, 0)).toBe(Tile.Floor);
  });

  test("非瓦片符号原样交出，不解读它是谁", () => {
    const { marks } = parseMap(lv({ name: "t", rows: ["#PG?."] }));

    // 本层不认识角色与道具——只知道「这里有个非瓦片符号」
    expect(marks).toEqual([
      { symbol: "P", col: 1, row: 0 },
      { symbol: "G", col: 2, row: 0 },
      { symbol: "?", col: 3, row: 0 },
    ]);
  });

  test("出生点符号不落地为实心格（否则实体会卡在墙里）", () => {
    const { grid } = parseMap(lv({ name: "t", rows: ["#####", "#.P.#", "#...#"] }));
    expect(isBlocked(grid, 2, 1)).toBe(false);
  });

  test("行长度不一致时按最长行补地板，不抛错", () => {
    const { grid } = parseMap(lv({ name: "t", rows: ["####", "#.", "####"] }));
    expect(grid.cols).toBe(4);
    expect(tileAt(grid, 3, 1)).toBe(Tile.Floor);
  });

  test("空格与未知符号都不落地为墙", () => {
    const { grid } = parseMap(lv({ name: "t", rows: ["#?."] }));
    expect(isBlocked(grid, 1, 0)).toBe(false);
  });
});
