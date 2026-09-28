// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 世界几何：格子与像素的换算尺度、矩形
//
// `TILE` 定义在此而非 game 层——它是「格子 ↔ 像素」的换算尺度，
// 属于世界几何。碰撞解算（world/collision.ts）与渲染（game/views）
// 共用同一真值，避免两处硬编码同一致。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 瓦片边长（px） */
export const TILE = 32;

/** 二维点 / 向量（世界像素坐标） */
export type Vec2 = { x: number; y: number };

/** 轴对齐矩形：位置为左上角 */
export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** 矩形中心（渲染与相机跟随用） */
export function rectCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** 两点的欧氏距离 */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 把角度归一化到 [-PI, PI] */
export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
