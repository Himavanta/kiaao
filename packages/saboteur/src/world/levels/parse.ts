// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 关卡解析：ASCII 地图 → Grid + 出生点
//
// 出生点符号（P / N / 朝向箭头）不落地为瓦片——它们是初始位置，
// 落在其下的格子一律为地板。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createGrid, setTile, type Grid } from "../grid";
import {
  propForSymbol,
  spawnForSymbol,
  tileForSymbol,
  type LevelDef,
  type Objective,
  type PropKind,
  type SpawnPoint,
} from "./types";

/** 关卡中的可交互物（实体，非瓦片；其所在格为地板） */
export type PropSpawn = {
  kind: PropKind;
  col: number;
  row: number;
};

/** 解析结果：网格 + 出生点 + 可交互物 + 解析期问题 */
export type ParsedLevel = {
  /** 关卡名（从 `LevelDef` 带入，供 HUD 等展示） */
  name: string;
  /** 通关目标（从 `LevelDef` 带入） */
  objective: Objective;
  grid: Grid;
  playerSpawn: SpawnPoint | undefined;
  npcSpawns: SpawnPoint[];
  propSpawns: PropSpawn[];
  /** 解析中遇到的未知符号（去重），供开发期报错 */
  unknownSymbols: string[];
};

/**
 * 把关卡定义解析为网格与出生点。
 *
 * 行长度不一致时按最长行右侧补地板——手写 ASCII 图容易漏字符，
 * 补位比直接抛错更实用（且是显式、可预期的行为，由 `validateLevel` 报告）。
 */
export function parseLevel(level: LevelDef): ParsedLevel {
  const { name, rows, objective } = level;
  const cols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const grid = createGrid(cols, rows.length);

  const npcSpawns: SpawnPoint[] = [];
  const propSpawns: PropSpawn[] = [];
  const unknownSymbols = new Set<string>();
  let playerSpawn: SpawnPoint | undefined;

  for (const [row, line] of rows.entries()) {
    // split("") 而非展开：地图为 ASCII，逐 UTF-16 码元即逐字符
    for (const [col, char] of line.split("").entries()) {
      const tile = tileForSymbol(char);
      if (tile !== undefined) {
        setTile(grid, col, row, tile);
        continue;
      }

      const spawn = spawnForSymbol(char);
      if (spawn) {
        if (char === "P") playerSpawn = { col, row, facing: spawn.facing };
        else npcSpawns.push({ col, row, facing: spawn.facing });
        // 出生点位于地板上——createGrid 已初始化为 Floor，无需写入
        continue;
      }

      const prop = propForSymbol(char);
      if (prop) {
        propSpawns.push({ kind: prop, col, row });
        continue;
      }

      unknownSymbols.add(char);
    }
  }

  return {
    name,
    objective,
    grid,
    playerSpawn,
    npcSpawns,
    propSpawns,
    unknownSymbols: [...unknownSymbols],
  };
}

/** 校验关卡定义，返回问题清单（空数组表示合法） */
export function validateLevel(level: LevelDef): string[] {
  const errors: string[] = [];

  const lengths = new Set(level.rows.map((r) => r.length));
  if (lengths.size > 1) {
    errors.push(`地图行长度不一致：${[...lengths].join(", ")}`);
  }

  const { playerSpawn, unknownSymbols } = parseLevel(level);
  if (!playerSpawn) errors.push("缺少玩家出生点（P）");
  if (unknownSymbols.length > 0) {
    errors.push(`未知符号：${unknownSymbols.join(" ")}`);
  }

  return errors;
}
