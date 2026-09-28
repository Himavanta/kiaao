// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏配置：渲染尺寸、采样间隔
//
// 世界尺寸不在此声明——它由关卡数据决定（`grid.cols * TILE`），
// 硬编码会导致地图与配置不一致。此处只放与关卡无关的渲染常量。
//
// 尺寸真值以 CSS 变量暴露（global.scss），VIEW_W / VIEW_H 为 JS 侧镜像。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 瓦片边长（px）——与 global.scss 的 --tile 保持一致 */
export const TILE = 32;

/** 视口尺寸（px）——与 global.scss 的 --view-w / --view-h 保持一致 */
export const VIEW_W = 960;
export const VIEW_H = 640;

/** 帧率采样的时间窗口（ms）——约 4Hz 足够人眼读数 */
export const FPS_SAMPLE_MS = 250;
