// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 关卡定义：ASCII 图例与关卡元信息
//
// 纯数据与纯函数——不导入 kiaao，不持有信号（规划文档 2.2）。
//
// **本层只认识「几何」**：瓦片符号（墙 / 地板 / 家具）。角色与道具的符号
// 词汇表属于 `game/`——`world/` 认识 `"guard"` 会让游戏概念漏进几何层，
// 并迫使 `game` 反向依赖它（`Role = SpawnKind`）。
//
// 于是 `parseMap` 把「非瓦片符号」原样交出去（`SymbolMark`），由游戏层
// 用自己的词汇表解读。谁是什么，不是几何问题。
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

/** 查静态几何符号；非瓦片符号返回 undefined（由游戏层解读） */
export function tileForSymbol(char: string): Tile | undefined {
  return TILE_SYMBOLS.get(char);
}

/**
 * 关卡定义：地图与元信息。
 *
 * 出生点不在此声明——它们内嵌在 ASCII 图中，由 `parseMap` 提取为
 * `SymbolMark`。单一数据源，避免地图与坐标声明不一致。
 *
 * `objective` 是**游戏概念**（击杀数、时限），与纯几何同处一份定义是
 * 「关卡 ≠ 地图」的现状（异质 NPC 设计文档 §7.2）。它是否继续留在这里，
 * 取决于 §7.4 的「关卡逻辑」取什么形态——**未定，故暂不动**。
 */
export type LevelDef = {
  name: string;
  /** ASCII 地图行（每行长度应相同，由游戏层的 `validateLevel` 检查） */
  rows: string[];
  /** 通关目标 */
  objective: Objective;
};

/** 通关目标：需达成的击杀数与时限 */
export type Objective = {
  /** 需要达成的击杀数 */
  killGoal: number;
  /** 时限（秒） */
  timeLimit: number;
};
