// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 视锥图层（调试）：每帧重绘透明的视锥
//
// 挂在帧计数信号上而非每个实体的位置信号上：重绘是「全量重画一层」，
// 一次订阅即可；若订阅每个实体，N 个实体就有 N 次重绘请求。
//
// 层级置于实体之下（zIndex 为 0）——视锥是地面上的光斑，不该盖住角色。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { direct, type Context, type Signal } from "kiaao";

import { level } from "../instance";
import { listActors } from "../state";
import { computeCones, paintCones, type ConeCanvas } from "./vision";

import style from "./vision-layer.module.scss";

type VisionLayerProps = {
  /** 帧计数信号：每帧自增，驱动重绘 */
  frames: Signal<number>;
};

/**
 * 视锥绘制指令：订阅帧计数，每帧重算并重绘。
 *
 * 重算而非缓存：视锥随朝向与位置每帧变化，缓存没有意义。20 条射线
 * × 6 个 NPC = 每帧 120 次射线遍历，相对渲染开销可忽略。
 */
const VisionCanvas = direct((el, props, { use: useContext }) => {
  const { frames } = props as unknown as VisionLayerProps;
  const canvas = el as HTMLCanvasElement;

  useContext(frames, () => {
    // 读取帧计数以建立依赖（值本身不使用，重绘由变化驱动）
    frames();

    const actors = listActors().map((entity) => ({ entity: entity() }));
    const shapes = computeCones({ grid: level.grid, actors });
    paintCones(canvas as ConeCanvas, level.grid, shapes);
  });
});

export function VisionLayer({ frames }: VisionLayerProps, _ctx: Context) {
  return (
    <VisionCanvas frames={frames}>
      <canvas class={style.layer} />
    </VisionCanvas>
  );
}
