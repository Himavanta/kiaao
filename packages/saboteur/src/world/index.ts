// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 世界层入口：几何、网格、碰撞、寻路、视线、关卡地图
//
// 纯逻辑，零响应式——不导入 kiaao，不触碰 DOM，可在任意环境单测
// （规划文档 2.2）。
//
// **只认识几何**：本层不知道任何角色或道具的名字。地图解析把非瓦片
// 符号原样交出（`SymbolMark`），由 `game/` 用自己的词汇表解读。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export { moveRect, rectBlocked } from "./collision";
export { distance, normalizeAngle, rectCenter, TILE, type Rect, type Vec2 } from "./geometry";
export { createGrid, inBounds, isBlocked, isOpaque, setTile, tileAt, type Grid } from "./grid";
export {
  cellAt,
  cellCenter,
  collectWalkable,
  findPath,
  furthestCells,
  toWaypoints,
  type Cell,
} from "./path";
export {
  cellInFront,
  facingVector,
  isBehind,
  isInFront,
  normalize,
  withinReach,
} from "./interaction";
export { createRandom, type Random } from "./random";
export {
  canSee,
  castRay,
  computeCone,
  hasLineOfSight,
  traverseRay,
  type ConeOptions,
  type SightOptions,
} from "./vision";
export { parseMap, type ParsedMap, type SymbolMark } from "./levels/parse";
export { Tile, tileForSymbol, type LevelDef, type Objective } from "./levels/types";
export { manor } from "./levels/manor";
