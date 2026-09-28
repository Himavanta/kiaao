// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 世界层入口：几何、网格、碰撞、关卡数据
//
// 纯逻辑，零响应式——不导入 kiaao，不触碰 DOM，可在任意环境单测
// （规划文档 2.2）。这条边界由 lint 规则固化。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export { moveRect, rectBlocked } from "./collision";
export { rectCenter, TILE, type Rect } from "./geometry";
export { createGrid, inBounds, isBlocked, isOpaque, setTile, tileAt, type Grid } from "./grid";
export { parseLevel, validateLevel, type ParsedLevel } from "./levels/parse";
export { Tile, type LevelDef, type SpawnFacing, type SpawnPoint } from "./levels/types";
export { manor } from "./levels/manor";
