// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 关卡解读：符号标记 → 角色出生点与道具（游戏层词汇表）
//
// `world/parseMap` 只解读几何，把其余符号原样交出（`SymbolMark`）。
// 本模块用**游戏自己的词汇表**解读它们：
//
// - 角色符号由各 NPC 的户口本声明（`npcs/*.ts` 的 `symbols`）
// - 道具符号在这里声明（酒瓶；道具没有户口本——它没有行为）
//
// 这样 `world/` 不认识任何具体角色，`game/` 也不必反向依赖它拿类型名。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { parseMap, type LevelDef, type SymbolMark } from "../world";
import type { Grid, Objective } from "../world";
import { actorDefs } from "./npcs";
import type { Facing, ItemKind, Role } from "./types";

/** 道具符号 → 类型。与角色符号同层——都是游戏词汇表 */
const PROP_SYMBOLS = new Map<string, ItemKind>([["o", "booze"]]);

/** 一个角色出生点：类型 + 朝向（朝向缺省为 undefined，由默认值补齐） */
export type ActorSpawn = {
  role: Role;
  col: number;
  row: number;
  facing?: Facing;
};

/** 一个道具出生点 */
export type PropSpawn = {
  kind: ItemKind;
  col: number;
  row: number;
};

/** 解读结果：网格 + 角色 / 道具出生点 + 认不出的符号 */
export type ParsedLevel = {
  name: string;
  /** 通关目标（游戏概念，从 `LevelDef` 带入，供规则系统用） */
  objective: Objective;
  grid: Grid;
  playerSpawn: ActorSpawn | undefined;
  npcSpawns: ActorSpawn[];
  propSpawns: PropSpawn[];
  /** 认不出的符号（去重），供开发期报错 */
  unknownSymbols: string[];
};

/** 角色符号表：由各 NPC 户口本汇总（`符号 → { role, facing }`） */
type ActorSymbol = { role: Role; facing?: Facing };

function collectActorSymbols(): Map<string, ActorSymbol> {
  const table = new Map<string, ActorSymbol>();
  for (const [role, def] of Object.entries(actorDefs)) {
    for (const [symbol, facing] of Object.entries(def.symbols)) {
      // 重复符号在此**直接报错**：静默覆盖会让一只 NPC 永远生不出来
      // （与引擎 name→id 映射同病，设计文档 §4.4）。其他测试能间接捕获
      // （某符号解析成错的角色），但不如在源头说清楚
      const existing = table.get(symbol);
      if (existing) {
        throw new Error(`地图符号 "${symbol}" 被 ${existing.role} 与 ${role} 重复声明`);
      }
      table.set(symbol, { role: role as Role, facing });
    }
  }
  return table;
}

/** 解读一个符号标记；认不出时返回 null（由调用方记入 unknownSymbols） */
function interpret(
  mark: SymbolMark,
  actorSymbols: Map<string, ActorSymbol>,
): { kind: "actor"; spawn: ActorSpawn } | { kind: "prop"; spawn: PropSpawn } | null {
  const actor = actorSymbols.get(mark.symbol);
  if (actor) {
    return {
      kind: "actor",
      spawn: { role: actor.role, col: mark.col, row: mark.row, facing: actor.facing },
    };
  }

  const prop = PROP_SYMBOLS.get(mark.symbol);
  if (prop) {
    return { kind: "prop", spawn: { kind: prop, col: mark.col, row: mark.row } };
  }

  return null;
}

/**
 * 把关卡解读为网格 + 出生点。
 *
 * **「玩家是否特殊」的判据是 `role === "player"`**，与装配层一致的
 * 单一事实。原先这个判断在 `world/parse.ts` 里——几何层不该知道
 * 玩家是个特殊角色。
 */
export function parseLevel(level: LevelDef): ParsedLevel {
  const { name, objective } = level;
  const { grid, marks } = parseMap(level);

  const actorSymbols = collectActorSymbols();
  const npcSpawns: ActorSpawn[] = [];
  const propSpawns: PropSpawn[] = [];
  const unknownSymbols = new Set<string>();
  let playerSpawn: ActorSpawn | undefined;

  for (const mark of marks) {
    const result = interpret(mark, actorSymbols);
    if (!result) {
      unknownSymbols.add(mark.symbol);
      continue;
    }

    if (result.kind === "prop") {
      propSpawns.push(result.spawn);
      continue;
    }

    // 玩家是唯一种类的特殊角色：它单独持有（相机跟随它）
    if (result.spawn.role === "player") playerSpawn = result.spawn;
    else npcSpawns.push(result.spawn);
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
