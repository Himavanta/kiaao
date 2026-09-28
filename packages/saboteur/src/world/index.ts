// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 世界层入口：网格、关卡数据、几何查询
//
// 纯逻辑，零响应式——不导入 kiaao，可以在 DOM 环境外直接单测
// （规划文档 2.2）。这条边界由 lint 规则固化。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export { createGrid, inBounds, isBlocked, isOpaque, setTile, tileAt, type Grid } from "./grid";
export { parseLevel, validateLevel, type ParsedLevel } from "./levels/parse";
export { Tile, type LevelDef, type SpawnPoint } from "./levels/types";
export { manor } from "./levels/manor";
