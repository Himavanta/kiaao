// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 帧统计系统：帧计数与帧率
//
// 帧率信号按采样间隔写入，而非每帧写——否则订阅它的派生每秒重算
// 60 次，而人眼约 4Hz 刷新即可读。写入频率由信号源头控制，
// 下游派生天然获得 memo 收益。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { FrameManager } from "engine";
import { use, type Signal } from "kiaao";

import { FPS_SAMPLE_MS } from "../config";

/** 帧统计系统的对外能力 */
export type FrameSystem = {
  /** 累计帧数（每帧写，供需要逐帧判断的调试逻辑使用） */
  frames: Signal<number>;
  /** 帧率（按采样间隔写，约 4Hz） */
  fps: Signal<number>;
  update: (frame: FrameManager<any>, delta: number) => void;
};

export function createFrameSystem(): FrameSystem {
  const frames = use(0);
  const fps = use(0);

  let windowFrames = 0;
  let windowStart = performance.now();

  const update = () => {
    frames(frames() + 1);
    windowFrames += 1;

    const elapsed = performance.now() - windowStart;
    if (elapsed < FPS_SAMPLE_MS) return;

    fps(Math.round((windowFrames * 1000) / elapsed));
    windowFrames = 0;
    windowStart = performance.now();
  };

  return { frames, fps, update };
}
