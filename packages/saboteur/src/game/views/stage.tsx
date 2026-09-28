// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 舞台：视口裁剪 + 相机跟随 + 世界层平移
//
// 世界坐标静止，相机只更新一层容器的 translate——相机移动时
// 每帧 1 次 DOM 写入，而不是每个实体各算一次。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { type Context, type Signal } from "kiaao";

import { StyleMemo } from "../../engine/directives";
import { VIEW_H, VIEW_W, WORLD_H, WORLD_W } from "../config";

import style from "./stage.module.scss";

/** 相机位置：世界坐标下视口左上角的位置 */
export type Camera = {
  x: number;
  y: number;
};

/** 关注点：相机跟随的目标（世界坐标） */
export type CameraTarget = {
  x: number;
  y: number;
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * 相机跟随：把关注点置于视口中心，并夹在世界边界内。
 *
 * 关注点不变时 memo 生效，不写 DOM；接近世界边缘时相机停住，画面不再跟着走。
 * 派生绑定到 `ctx`，随组件卸载自动清理。
 */
export function followCamera(ctx: Context, target: Signal<CameraTarget>): Signal<Camera> {
  return ctx.use(target, () => {
    const { x, y } = target();
    return {
      x: clamp(x - VIEW_W / 2, 0, Math.max(0, WORLD_W - VIEW_W)),
      y: clamp(y - VIEW_H / 2, 0, Math.max(0, WORLD_H - VIEW_H)),
    };
  });
}

type StageProps = {
  /** 相机位置信号（世界坐标） */
  camera: Signal<Camera>;
  children: unknown;
};

/**
 * 舞台：视口（裁剪容器）+ 世界层（被相机平移）。
 *
 * 平移用 `translate` 而非 `left / top`——在合成层内位移，不触发重排。
 */
export function Stage({ camera, children }: StageProps, ctx: Context) {
  const { use: useContext } = ctx;

  const translate = useContext(camera, () => {
    const { x, y } = camera();
    return `${-x}px ${-y}px`;
  });

  return (
    <div class={style.viewport}>
      <StyleMemo
        value={{
          position: "absolute",
          left: "0",
          top: "0",
          width: `${WORLD_W}px`,
          height: `${WORLD_H}px`,
          translate,
        }}
      >
        <div class={style.world}>{children}</div>
      </StyleMemo>
    </div>
  );
}
