// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 世界层单测：网格查询 + 关卡解析
//
// 纯逻辑可在 DOM 环境外直接测（规划文档 9.1）——这是分层边界的
// 直接收益。覆盖的是最容易静默出错的部分：越界、视线与通行性的
// 区分、出生点提取。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, expect, test } from "vite-plus/test";

import { createGrid, inBounds, isBlocked, isOpaque, setTile, tileAt } from "../grid";
import { parseLevel, validateLevel } from "../levels/parse";
import { Tile, type LevelDef } from "../levels/types";

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

describe("关卡解析", () => {
  const simple: LevelDef = {
    name: "测试关卡",
    rows: ["#####", "#.P.#", "#...#", "#####"],
  };

  test("静态符号解析为对应瓦片", () => {
    const { grid } = parseLevel({
      name: "t",
      rows: ["#tT.", "#..."],
    });

    expect(tileAt(grid, 0, 0)).toBe(Tile.Wall);
    expect(tileAt(grid, 1, 0)).toBe(Tile.LowFurniture);
    expect(tileAt(grid, 2, 0)).toBe(Tile.HighFurniture);
    expect(tileAt(grid, 3, 0)).toBe(Tile.Floor);
  });

  test("提取玩家出生点，且该格为地板", () => {
    const { grid, playerSpawn } = parseLevel(simple);

    expect(playerSpawn).toEqual({ col: 2, row: 1, facing: undefined });
    // 出生点符号不落地为实心格——否则玩家会卡在墙里
    expect(isBlocked(grid, 2, 1)).toBe(false);
  });

  test("提取 NPC 出生点与朝向", () => {
    const { npcSpawns } = parseLevel({
      name: "t",
      rows: ["#####", "#^v<>#", "#....#", "#####"],
    });

    expect(npcSpawns).toEqual([
      { col: 1, row: 1, facing: "north" },
      { col: 2, row: 1, facing: "south" },
      { col: 3, row: 1, facing: "west" },
      { col: 4, row: 1, facing: "east" },
    ]);
  });

  test("行长度不一致时按最长行补地板，不抛错", () => {
    const { grid } = parseLevel({ name: "t", rows: ["####", "#.", "####"] });
    expect(grid.cols).toBe(4);
    expect(tileAt(grid, 3, 1)).toBe(Tile.Floor);
  });

  test("未知符号被报告，且不落地为墙", () => {
    const { grid, unknownSymbols } = parseLevel({ name: "t", rows: ["#?."] });

    expect(unknownSymbols).toEqual(["?"]);
    expect(isBlocked(grid, 1, 0)).toBe(false);
  });
});

describe("关卡校验", () => {
  test("合法关卡无问题", () => {
    expect(validateLevel({ name: "t", rows: ["###", "#P#", "###"] })).toEqual([]);
  });

  test("缺少玩家出生点被报告", () => {
    const errors = validateLevel({ name: "t", rows: ["###", "#.#", "###"] });
    expect(errors.some((e) => e.includes("P"))).toBe(true);
  });

  test("行长度不一致被报告", () => {
    const errors = validateLevel({ name: "t", rows: ["####", "#P#"] });
    expect(errors.some((e) => e.includes("长度"))).toBe(true);
  });
});
