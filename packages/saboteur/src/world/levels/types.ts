// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 关卡定义：ASCII 地图 + 图例
//
// 纯数据与纯函数——不导入 kiaao，不持有信号（规划文档 2.2）。
// 图例符号集中在此，其余模块通过 `Tile` 值与之交互，不直接比对字符。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 瓦片类型：关卡数据的最小单元。
 *
 * 用 const 对象 + 联合类型而非 `enum`——tsconfig 开了 `erasableSyntaxOnly`，
 * 且 const 对象更贴近「值就是数字」的实际语义。
 */
export const Tile = {
  /** 地板：可通行、可透视 */
  Floor: 0,
  /** 墙：阻挡通行与视线 */
  Wall: 1,
  /** 矮家具（酒桌、沙发）：阻挡通行，不挡视线 */
  LowFurniture: 2,
  /** 高家具（屏风、柜子）：阻挡通行与视线 */
  HighFurniture: 3,
} as const;

export type Tile = (typeof Tile)[keyof typeof Tile];

/** 静态几何符号 → 瓦片类型 */
const TILE_SYMBOLS = new Map<string, Tile>([
  [".", Tile.Floor],
  ["#", Tile.Wall],
  ["t", Tile.LowFurniture],
  ["T", Tile.HighFurniture],
]);

/**
 * 可交互物符号 → 类型。
 *
 * 这些**不落地为瓦片**——它们是实体（有状态：还在不在），参与帧循环；
 * 其所在格为地板，可通行。
 */
const PROP_SYMBOLS = new Map<string, PropKind>([["o", "booze"]]);

export type PropKind = "booze";

/** 出生点符号 → 朝向；`P` / `N` 无朝向，箭头表示初始朝向 */
const SPAWN_SYMBOLS = new Map<string, SpawnFacing | undefined>([
  ["P", undefined],
  ["N", undefined],
  ["^", "north"],
  ["v", "south"],
  ["<", "west"],
  [">", "east"],
]);

/** 查静态几何符号；非瓦片符号返回 undefined */
export function tileForSymbol(char: string): Tile | undefined {
  return TILE_SYMBOLS.get(char);
}

/** 查可交互物符号；非道具符号返回 undefined */
export function propForSymbol(char: string): PropKind | undefined {
  return PROP_SYMBOLS.get(char);
}

/** 查出生点符号；非出生点符号返回 null（区分「无朝向的出生点」与「不是出生点」） */
export function spawnForSymbol(char: string): { facing?: SpawnFacing } | null {
  return SPAWN_SYMBOLS.has(char) ? { facing: SPAWN_SYMBOLS.get(char) } : null;
}

/**
 * 朝向：与 `game/types.ts` 的 `Facing` 同为 4 向字符串。
 * 此处用宽松的 `string`——`world/` 不依赖 `game/`（分层单向），
 * 实际取值由 `SPAWN_SYMBOLS` 限定。
 */
export type SpawnFacing = "north" | "east" | "south" | "west";

/** 出生点：玩家与 NPC 在关卡中的初始位置 */
export type SpawnPoint = {
  /** 格子坐标 */
  col: number;
  row: number;
  /** 朝向；未在图中指定时为 undefined（由游戏层决定默认值） */
  facing?: SpawnFacing;
};

/**
 * 关卡定义：只有地图与元信息。
 *
 * 出生点不在此声明——它们内嵌在 ASCII 图中（`P` / `N` / 朝向箭头），
 * 由 `parseLevel` 提取。单一数据源，避免地图与坐标声明不一致。
 */
export type LevelDef = {
  name: string;
  /** ASCII 地图行（每行长度应相同，由 `validateLevel` 检查） */
  rows: string[];
};
