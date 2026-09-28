// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 视锥可视化（调试层）
//
// 用 canvas 而非 DOM 扇形：视锥每帧都随朝向变化，6 个 NPC × 多边形
// 用 DOM 意味着每帧数十次样式写入与重排。canvas 是一层透明画布，
// 每帧重绘一次，与实体层解钩。
//
// 绘制被拆为两层（与 tilemap 同理）：`computeCones` 是纯计算（可单测
// 「画出哪些多边形」），`paintCones` 是上下文薄壳——canvas 上下文在
// happy-dom 中取不到（`getContext("2d")` 返回 null）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { computeCone, TILE, type Grid, type Vec2 } from "../../world";
import { actorCenter, sightAngle } from "../systems/perception";
import type { ActorEntity } from "../types";

/** 视锥填充色（半透明，不遮住地图） */
export const CONE_FILL = "rgba(240, 198, 116, 0.12)";
export const CONE_STROKE = "rgba(240, 198, 116, 0.35)";

/** 视锥的可视参数 */
const CONE_RAYS = 20;

/** 一个待绘制的视锥 */
export type ConeShape = {
  points: Vec2[];
};

/**
 * 计算所有观察者的视锥多边形。
 *
 * 纯计算：给定网格与实体列表，产出多边形顶点。角度取朝向对应的
 * `FACING_ANGLES`，与感知判定同源——可视化的形状与判定逻辑一致，
 * 看到的就是判定的依据。
 */
export function computeCones(options: {
  grid: Grid;
  actors: ReadonlyArray<{ entity: Readonly<ActorEntity> }>;
  /** 只画这些朝向之外的观察者？留空则全部绘制 */
  filter?: (entity: Readonly<ActorEntity>) => boolean;
}): ConeShape[] {
  const { grid, actors, filter } = options;

  return actors
    .filter(({ entity }) => (filter ? filter(entity) : true))
    .map(({ entity }) => ({
      points: computeCone({
        grid,
        origin: actorCenter(entity),
        angle: sightAngle(entity),
        range: entity.sightRange ?? 0,
        halfArc: entity.sightArc ?? 0,
        rays: CONE_RAYS,
      }),
    }))
    .filter((shape) => shape.points.length > 2);
}

/** 绘制目标：只声明实际用到的 canvas 成员 */
export type ConeCanvas = {
  width: number;
  height: number;
  getContext(contextId: "2d"): ConeContext | null;
};

/** 绘制上下文中我们实际使用的子集 */
export type ConeContext = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
};

/** 把视锥画到 canvas：先清空整层，再逐个填色描边 */
export function paintCones(canvas: ConeCanvas, grid: Grid, shapes: ConeShape[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = grid.cols * TILE;
  canvas.height = grid.rows * TILE;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = CONE_FILL;
  ctx.strokeStyle = CONE_STROKE;
  ctx.lineWidth = 1;

  for (const { points } of shapes) {
    const [first, ...rest] = points;
    if (!first) continue;

    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
