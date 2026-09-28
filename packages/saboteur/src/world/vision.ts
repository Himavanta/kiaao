// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 视线：射线遮挡、精确可见判定、视锥多边形
//
// 三件事分开，因为它们对精确度的要求不同：
// - `traverseRay` / `hasLineOfSight`：游戏判定，必须精确
// - `computeCone`：可视化，扇形采样，允许近似
//
// **为什么判定不能靠采样射线**：采样是离散的，目标恰好在两条射线之间
// 时会被判定为看不见（或反之，从墙缝漏过）。玩法判定用「观察者中心 →
// 目标中心」的精确直线，可视化才用扇形采样。
//
// 遮挡读 `isOpaque`（墙 + 高家具）而非 `isBlocked`——矮桌挡路但看得穿，
// 这是「趴下躲视线」这类玩法的前提（规划文档 4.1）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { normalizeAngle, TILE, type Vec2 } from "./geometry";
import { isOpaque, type Grid } from "./grid";

/** 光线起止的遍历状态（Amanatides & Woo 体素遍历） */
type RayWalk = {
  col: number;
  row: number;
  tMaxX: number;
  tMaxY: number;
  tDeltaX: number;
  tDeltaY: number;
  stepCol: number;
  stepRow: number;
  dx: number;
  dy: number;
};

function createWalk(from: Vec2, to: Vec2): RayWalk | null {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist === 0) return null;

  const dx = (to.x - from.x) / dist;
  const dy = (to.y - from.y) / dist;

  const stepCol = Math.sign(dx);
  const stepRow = Math.sign(dy);

  const col = Math.floor(from.x / TILE);
  const row = Math.floor(from.y / TILE);

  return {
    col,
    row,
    stepCol,
    stepRow,
    dx,
    dy,
    tDeltaX: dx === 0 ? Infinity : Math.abs(TILE / dx),
    tDeltaY: dy === 0 ? Infinity : Math.abs(TILE / dy),
    tMaxX: dx === 0 ? Infinity : ((stepCol > 0 ? col + 1 : col) * TILE - from.x) / dx,
    tMaxY: dy === 0 ? Infinity : ((stepRow > 0 ? row + 1 : row) * TILE - from.y) / dy,
  };
}

/**
 * 逐格遍历 from → to，返回首个阻挡点；全程无遮挡则返回 `null`。
 *
 * **起点所在格不参与判定**：观察者自己的格不应挡住自己的视线。
 * **恰好穿过格点时要求两侧都可通行**：否则视线会从对角的墙缝漏过去，
 * 这在棋盘式地图上很常见（两面墙对角相接处）。
 */
export function traverseRay(grid: Grid, from: Vec2, to: Vec2, maxDist = Infinity): Vec2 | null {
  const walk = createWalk(from, to);
  if (!walk) return null;

  const totalDist = Math.min(Math.hypot(to.x - from.x, to.y - from.y), maxDist);
  const { dx, dy } = walk;

  for (;;) {
    const tNext = Math.min(walk.tMaxX, walk.tMaxY);
    if (tNext > totalDist) return null;

    const at = { x: from.x + dx * tNext, y: from.y + dy * tNext };

    if (walk.tMaxX === walk.tMaxY) {
      // 对角穿越：任一相邻格不透明即视为被挡
      const blockedSide =
        isOpaque(grid, walk.col + walk.stepCol, walk.row) ||
        isOpaque(grid, walk.col, walk.row + walk.stepRow);
      if (blockedSide) return at;

      walk.tMaxX += walk.tDeltaX;
      walk.tMaxY += walk.tDeltaY;
      walk.col += walk.stepCol;
      walk.row += walk.stepRow;
    } else if (walk.tMaxX < walk.tMaxY) {
      walk.tMaxX += walk.tDeltaX;
      walk.col += walk.stepCol;
    } else {
      walk.tMaxY += walk.tDeltaY;
      walk.row += walk.stepRow;
    }

    // 越界由 isOpaque 兜底（地图外视为墙），因此遍历必然终止
    if (isOpaque(grid, walk.col, walk.row)) return at;
  }
}

/** 两点之间是否无遮挡（精确判定，用于「能否看见」） */
export function hasLineOfSight(grid: Grid, from: Vec2, to: Vec2): boolean {
  return traverseRay(grid, from, to) === null;
}

/** 单条射线的落点：撞到遮挡物取命中点，否则取最远点 */
export function castRay(grid: Grid, origin: Vec2, angle: number, maxDist: number): Vec2 {
  const target = {
    x: origin.x + Math.cos(angle) * maxDist,
    y: origin.y + Math.sin(angle) * maxDist,
  };
  return traverseRay(grid, origin, target, maxDist) ?? target;
}

/** 视锥多边形参数 */
export type ConeOptions = {
  grid: Grid;
  /** 观察点（角色中心） */
  origin: Vec2;
  /** 视线中心方向（弧度；0 为正东，顺时针为正，屏幕坐标 y 向下） */
  angle: number;
  /** 视距（px） */
  range: number;
  /** 半角（弧度） */
  halfArc: number;
  /** 扇形采样射线数：越大边缘越平滑，但计算量线性增长 */
  rays: number;
};

/**
 * 视锥多边形（用于可视化）。
 *
 * 首点为观察点，后续为各采样射线的落点——构成「从眼睛射出的扇形」。
 * 落点已被墙裁剪，因此画出来能直接看出「哪些区域真的被挡住」。
 */
export function computeCone(options: ConeOptions): Vec2[] {
  const { grid, origin, angle, range, halfArc, rays } = options;

  // 无射程 / 无张角：不是一个视锥（首点加零长度射线会产出退化多边形，
  // 填色时显示为一个小黑点，反而误导调试）
  if (!(range > 0) || !(halfArc > 0)) return [];

  const segments = Math.max(1, Math.floor(rays));
  const points: Vec2[] = [{ ...origin }];
  for (let i = 0; i <= segments; i += 1) {
    const a = angle - halfArc + (2 * halfArc * i) / segments;
    points.push(castRay(grid, origin, a, range));
  }

  return points;
}

/** 可见判定参数 */
export type SightOptions = {
  grid: Grid;
  /** 观察点（角色中心） */
  origin: Vec2;
  /** 视线中心方向（弧度） */
  angle: number;
  /** 目标点（角色中心） */
  target: Vec2;
  range: number;
  halfArc: number;
};

/**
 * 观察者能否看见目标：距离 → 视锥角度 → 射线遮挡 三级判定（规划文档 4.3）。
 *
 * 由近及远地排除，最便宜的距离判定放在最前——大部分目标在第一级就被排除。
 */
export function canSee(options: SightOptions): boolean {
  const { grid, origin, angle, target, range, halfArc } = options;

  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dist = Math.hypot(dx, dy);

  // 1. 距离
  if (dist > range) return false;
  // 与观察者重合：视为可见（零向量没有角度，不参与视锥判定）
  if (dist === 0) return true;
  // 2. 视锥角度
  if (Math.abs(normalizeAngle(Math.atan2(dy, dx) - angle)) > halfArc) return false;
  // 3. 射线遮挡
  return hasLineOfSight(grid, origin, target);
}
