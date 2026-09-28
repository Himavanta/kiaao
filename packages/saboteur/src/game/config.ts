// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏配置：视口规则、采样间隔
//
// `TILE` 不在此声明——它是「格子 ↔ 像素」的换算尺度，
// 属于世界几何（`world/geometry.ts`）。世界尺寸同样由关卡推导
// （`grid.cols * TILE`），硬编码会与地图不一致。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { TILE } from "../world";

/**
 * 视口上限（px）。
 *
 * 地图不超过上限时，视口取地图尺寸——整张地图一屏看全，相机静止。
 * 超过上限时视口封顶，相机转为跟随卷轴。
 *
 * 上限存在的意义：地图放大后若仍一屏看全，实体在屏幕上会小到不可辨；
 * 封顶保证了角色的可读尺寸，代价是需要相机跟随。
 */
export const MAX_VIEW_W = 1280;
export const MAX_VIEW_H = 800;

/** 视口尺寸：容纳整张地图，但不超过上限 */
export type Viewport = {
  width: number;
  height: number;
};

/**
 * 由网格尺寸推导视口尺寸。
 *
 * 不要硬编码视口尺寸——视口与地图不匹配时，边界墙会落在视口之外，
 * 画面看起来像「地图没画完」，而实际只是取景范围不对。
 */
export function computeViewport(cols: number, rows: number): Viewport {
  return {
    width: Math.min(cols * TILE, MAX_VIEW_W),
    height: Math.min(rows * TILE, MAX_VIEW_H),
  };
}

/** 帧率采样的时间窗口（ms）——约 4Hz 足够人眼读数 */
export const FPS_SAMPLE_MS = 250;
