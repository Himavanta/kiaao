// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 调试面板：帧率与实体计数
// 帧率信号本身已按采样间隔写入，此处直接订阅即可
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { type Signal } from "kiaao";

import style from "./debug.module.scss";

type DebugPanelProps = {
  /** 帧率信号 */
  fps: Signal<number>;
  /** 实体数量信号 */
  entities: Signal<number>;
};

export function DebugPanel({ fps, entities }: DebugPanelProps) {
  return (
    <div class={style.panel}>
      <span class={style.metric}>
        <span class={style.label}>FPS</span>
        <span class={style.value}>{fps}</span>
      </span>
      <span class={style.metric}>
        <span class={style.label}>ENT</span>
        <span class={style.value}>{entities}</span>
      </span>
    </div>
  );
}
