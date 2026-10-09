// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 关卡解读：符号 → 角色 / 道具（游戏层词汇表）
//
// `world/parseMap` 只解读几何，把其余符号原样交出。本层用自己的词汇表
// 解读它们——角色符号来自各 NPC 的户口本（`npcs/*.ts` 的 `symbols`），
// 道具符号来自 `level.ts`。
//
// 这两半合起来才是「地图上的 N 是客人」这件事的完整来源。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, expect, test } from "vite-plus/test";

import { isBlocked, Tile, type LevelDef } from "../../world";
import { parseLevel, validateLevel } from "../level";
import { actorDefs } from "../npcs";

/** 测试用关卡：补上 objective（大多数用例不关心它） */
const lv = (def: Omit<LevelDef, "objective">): LevelDef => ({
  ...def,
  objective: { killGoal: 1, timeLimit: 60 },
});

describe("关卡解读 / 角色与道具", () => {
  test("玩家符号解析为 playerSpawn，且该格为地板", () => {
    const { grid, playerSpawn } = parseLevel(lv({ name: "t", rows: ["#####", "#.P.#", "#####"] }));

    expect(playerSpawn).toEqual({ role: "player", col: 2, row: 1, facing: undefined });
    // 出生点符号不落地为实心格——否则实体会卡在墙里
    expect(isBlocked(grid, 2, 1)).toBe(false);
  });

  test("朝向箭头解析为「客人 + 朝向」", () => {
    const { npcSpawns } = parseLevel(lv({ name: "t", rows: ["#######", "#^v<>N#", "#######"] }));

    expect(npcSpawns).toEqual([
      { role: "guest", col: 1, row: 1, facing: "north" },
      { role: "guest", col: 2, row: 1, facing: "south" },
      { role: "guest", col: 3, row: 1, facing: "west" },
      { role: "guest", col: 4, row: 1, facing: "east" },
      { role: "guest", col: 5, row: 1, facing: undefined },
    ]);
  });

  test("不同符号解析出不同角色（`G` = 保镖）", () => {
    const { playerSpawn, npcSpawns } = parseLevel(
      lv({ name: "t", rows: ["#####", "#PGN#", "#####"] }),
    );

    expect(playerSpawn?.role).toBe("player");
    expect(npcSpawns).toEqual([
      { role: "guard", col: 2, row: 1, facing: undefined },
      { role: "guest", col: 3, row: 1, facing: undefined },
    ]);
  });

  test("道具符号解析为 propSpawns，且不属于角色", () => {
    const { npcSpawns, propSpawns } = parseLevel(lv({ name: "t", rows: ["#####", "#oNo#"] }));

    expect(propSpawns).toEqual([
      { kind: "booze", col: 1, row: 1 },
      { kind: "booze", col: 3, row: 1 },
    ]);
    expect(npcSpawns).toEqual([{ role: "guest", col: 2, row: 1, facing: undefined }]);
  });

  test("认不出的符号被报告，且不落地为墙", () => {
    const { grid, unknownSymbols } = parseLevel(lv({ name: "t", rows: ["#?."] }));

    expect(unknownSymbols).toEqual(["?"]);
    expect(isBlocked(grid, 1, 0)).toBe(false);
  });

  test("符号表来自户口本：每个角色声明的符号都能被解读", () => {
    // 这条锁住「符号表归户口本」这件事——若哪只 NPC 的 symbols 写错，
    // 它的符号就会落到 unknownSymbols 里，装配层便拿不到出生点
    for (const [role, def] of Object.entries(actorDefs)) {
      for (const symbol of Object.keys(def.symbols)) {
        const { playerSpawn, npcSpawns, unknownSymbols } = parseLevel(
          lv({ name: "t", rows: ["###", `#${symbol}#`, "###"] }),
        );

        expect(unknownSymbols).toEqual([]);
        const spawns = role === "player" ? [playerSpawn] : npcSpawns;
        expect(spawns.map((s) => s?.role)).toEqual([role]);
      }
    }
  });
});

describe("关卡解读 / 校验", () => {
  test("合法关卡无问题", () => {
    expect(validateLevel(lv({ name: "t", rows: ["###", "#P#", "###"] }))).toEqual([]);
  });

  test("缺少玩家出生点被报告", () => {
    const errors = validateLevel(lv({ name: "t", rows: ["###", "#.#", "###"] }));
    expect(errors.some((e) => e.includes("P"))).toBe(true);
  });

  test("行长度不一致被报告", () => {
    const errors = validateLevel(lv({ name: "t", rows: ["####", "#P#"] }));
    expect(errors.some((e) => e.includes("长度"))).toBe(true);
  });
});

describe("关卡解读 / 网格仍为几何", () => {
  test("静态符号落地为瓦片", () => {
    const { grid } = parseLevel(lv({ name: "t", rows: ["#tT.", "#..."] }));

    expect(grid.tiles[0]).toBe(Tile.Wall);
    expect(grid.tiles[1]).toBe(Tile.LowFurniture);
    expect(grid.tiles[2]).toBe(Tile.HighFurniture);
    expect(grid.tiles[3]).toBe(Tile.Floor);
  });

  test("行长度不一致时按最长行补地板，不抛错", () => {
    const { grid } = parseLevel(lv({ name: "t", rows: ["####", "#.", "####"] }));
    expect(grid.cols).toBe(4);
  });
});
