// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 舞台：视口裁剪 + 相机跟随 + 世界层平移
//
// 世界坐标静止，相机只更新一层容器的 translate——相机移动时
// 每帧 1 次 DOM 写入，而不是每个实体各算一次（规划文档 4.4）。
//
// 视口尺寸由关卡推导（`computeViewport`）。地图不超过上限时视口等于
// 地图，相机可移动范围为 0，整张地图（含四周边界墙）一屏可见。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { type Context, type Signal } from "kiaao";

import { StyleMemo } from "../../engine/directives";
import { TILE, type Grid } from "../../world";
import { computeViewport } from "../config";

import style from "./stage.module.scss";

/** 相机位置：世界坐标下视口左上角的位置 */
export type Camera = {
  x: number;
  y: number;
};

/** 关注点：相机跟随的目标（世界坐标，像素） */
export type CameraTarget = {
  x: number;
  y: number;
};

type StageProps = {
  /** 相机位置信号（世界坐标） */
  camera: Signal<Camera>;
  /** 关卡网格：决定世界层尺寸 */
  grid: Grid;
  children: unknown;
};

/**
 * 舞台：视口（裁剪容器）+ 世界层（被相机平移）。
 *
 * 平移用 `translate` 而非 `left / top`——在合成层内位移，不触发重排。
 */
export function Stage({ camera, grid, children }: StageProps, ctx: Context) {
  const { use } = ctx;

  const viewport = computeViewport(grid.cols, grid.rows);

  const translate = use(camera, () => {
    const { x, y } = camera();
    return `${-x}px ${-y}px`;
  });

  return (
    <div
      class={style.viewport}
      style={{ width: `${viewport.width}px`, height: `${viewport.height}px` }}
    >
      <StyleMemo
        value={{
          position: "absolute",
          left: "0",
          top: "0",
          width: `${grid.cols * TILE}px`,
          height: `${grid.rows * TILE}px`,
          translate,
        }}
      >
        <div class={style.world}>{children}</div>
      </StyleMemo>
    </div>
  );
}
