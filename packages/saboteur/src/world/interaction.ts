// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 交互几何：面朝格、背后判定、距离判定
//
// 交互对象是**离散的**——面朝方向的相邻格（规划文档 4.7）。这是
// 全键盘方案消掉「屏幕坐标 → 世界坐标换算」与「点击拾取」之后的
// 直接结果：判定变成格与朝向的比较，无需像素级瞄准。
//
// 背后判定用点积而非角度：`dot(目标朝向, 目标→观察者) < 0` 即夹角
// 大于 90°，观察者位于目标的背后半球。点积足够且免去反三角函数。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { TILE, type Vec2 } from "./geometry";

/** 朝向 → 单位向量（世界层不依赖 game 层的 Facing 类型，用字符串键） */
const FACING_DIRS: Record<string, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

/** 朝向对应的单位向量；未知朝向返回 `{0, 0}` */
export function facingVector(facing: string): { dx: number; dy: number } {
  return FACING_DIRS[facing] ?? { dx: 0, dy: 0 };
}

/** 面朝方向的相邻格中心（交互目标的落点） */
export function cellInFront(origin: Vec2, facing: string): Vec2 {
  const { dx, dy } = facingVector(facing);
  return { x: origin.x + dx * TILE, y: origin.y + dy * TILE };
}

/** 两个点是否在给定距离内 */
export function withinReach(a: Vec2, b: Vec2, reach: number): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) <= reach;
}

/**
 * 观察者是否位于目标的背后半球。
 *
 * `targetFacing` 是目标自己的朝向；`fromTargetToObserver` 是「目标指向
 * 观察者」的向量。两者点积为负即夹角大于 90°——观察者不在目标的视野
 * 覆盖范围内。
 */
export function isBehind(
  targetFacing: string,
  fromTargetToObserver: { dx: number; dy: number },
): boolean {
  const forward = facingVector(targetFacing);
  const dot = forward.dx * fromTargetToObserver.dx + forward.dy * fromTargetToObserver.dy;
  // 点积恰为 0（正侧方）不算背后：擦身而过不该等同于背刺
  return dot < 0;
}

/** 观察点是否位于目标的正面视锥内（M6 的目击判定复用同一几何） */
export function isInFront(
  targetFacing: string,
  fromTargetToObserver: { dx: number; dy: number },
): boolean {
  const forward = facingVector(targetFacing);
  const dot = forward.dx * fromTargetToObserver.dx + forward.dy * fromTargetToObserver.dy;
  return dot > 0;
}

/** 归一化向量（零向量返回零向量） */
export function normalize(v: { dx: number; dy: number }): { dx: number; dy: number } {
  const len = Math.hypot(v.dx, v.dy);
  if (len === 0) return { dx: 0, dy: 0 };
  return { dx: v.dx / len, dy: v.dy / len };
}
