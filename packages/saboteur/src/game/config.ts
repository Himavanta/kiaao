// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏配置：世界尺寸、瓦片、相机、调色
// 尺寸真值以 CSS 变量暴露（global.scss），此处为 JS 侧镜像
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 瓦片边长（px）——与 global.scss 的 --tile 保持一致 */
export const TILE = 32;

/** 世界网格尺寸（瓦片数） */
export const GRID_COLS = 32;
export const GRID_ROWS = 20;

/** 世界像素尺寸 */
export const WORLD_W = GRID_COLS * TILE;
export const WORLD_H = GRID_ROWS * TILE;

/** 视口尺寸（px）——与 global.scss 的 --view-w / --view-h 保持一致 */
export const VIEW_W = 960;
export const VIEW_H = 640;

/** 相机跟随的临界区比例：玩家位于视口中央该比例内时相机不动 */
export const CAMERA_DEADZONE = 0.18;

/** 帧循环调试面板的刷新间隔（ms） */
export const FPS_SAMPLE_MS = 250;
