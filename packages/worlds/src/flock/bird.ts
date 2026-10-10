// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 个体行为：每只鸟自己的（createActorSystem）
//
// 与 `systems.ts` 的对照——同样是「每帧做点什么」，但：
//
//   systems.ts（createPool）      这份代码**服务所有实体**，一份
//   本文件（createActorSystem）   这段逻辑**只有这只鸟有**，一鸟一份
//
// 具体地，这里的「私有」指：
//   - `home`    —— 出生点，每只鸟不同，是它自己的地盘
//   - `trail`   —— 它走过的路（只属于它，别人看不到也不需要知道）
//   - `phase`   —— 它的游荡节拍（错开相位，鸟群才不会齐步走）
//
// **方法不需要任何 context 参数**（虽然引擎会传）：它闭包捕获了 `state`
// 与 `random`——创建时就能拿到的东西，不必每帧再问引擎要。
// 这是「上下文按需取用」的意思：引擎给了 `ctx`，但你可以不要。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { ActorContext } from "engine";

/** 世界尺寸（与 index.tsx 共用一个来源，避免两处不一致） */
export const WORLD = { w: 720, h: 420 };

/** 轨迹最多留多少个点（超出的从头部丢） */
const TRAIL_MAX = 24;

/**
 * 一只鸟的完整状态。
 *
 * 读这一个类型就知道「一只鸟有什么」——这是两种范式里 OOP 侧的价值：
 * 字段齐全、定义在一处。
 */
export type BirdState = {
  // ── 共享机制用的（movement / boundary 读它）──
  x: number;
  y: number;
  vx: number;
  vy: number;

  // ── 只有它自己的 ──
  /** 出生点（它的地盘中心） */
  home: { x: number; y: number };
  /** 走过的路：最近若干位置，用于画出它自己的痕迹 */
  trail: Array<{ x: number; y: number }>;
  /** 游荡节拍（弧度），每只鸟不同相位 */
  phase: number;
  /** 它自己的颜色 */
  color: string;

  /** 每帧：个体行为（下面的 `step` 会挂上来） */
  onFrame: (ctx: ActorContext<BirdState>) => void;
};

/**
 * 造一只鸟。
 *
 * **创建时就把 `random` 闭包进来**——所以 `onFrame` 不必向引擎要随机源。
 * 引擎的 `ActorContext` 只提供方法**拿不到**的东西（帧管理器、本帧时长）。
 */
export function createBird(props: { x: number; y: number; color: string }): BirdState {
  const { x, y, color } = props;
  const random = Math.random;

  const state: BirdState = {
    x,
    y,
    vx: (random() - 0.5) * 60,
    vy: (random() - 0.5) * 60,
    home: { x, y },
    trail: [],
    phase: random() * Math.PI * 2,
    color,
    onFrame: () => {},
  };

  /**
   * 个体行为：游荡 + 记下自己的痕迹。
   *
   * 分两段，对应两件不同的事：
   * 1. **转向**（游荡）：朝家的方向有微弱拉力 + 随机扰动。这是「鸟的意图」，
   *    写 `vx/vy`——但**积分成位置**是 movement 系统的活（共享机制）。
   * 2. **记忆**：把当前位置压入 `trail`。纯私有，无人认领。
   *
   * 这个分工正是折中点：**意图在个体，运动学在机制**。
   */
  state.onFrame = (ctx) => {
    const { delta } = ctx;

    // 1. 游荡：回家拉力 + 相位驱动的转向 + 一点点噪声
    state.phase += delta * 1.6;
    const homePullX = (state.home.x - state.x) * 0.35;
    const homePullY = (state.home.y - state.y) * 0.35;
    const wanderX = Math.cos(state.phase) * 55;
    const wanderY = Math.sin(state.phase * 1.3) * 55;

    state.vx += (homePullX + wanderX) * delta;
    state.vy += (homePullY + wanderY) * delta;

    // 限速：避免回家拉力把速度越推越大
    const speed = Math.hypot(state.vx, state.vy);
    const max = 90;
    if (speed > max) {
      state.vx = (state.vx / speed) * max;
      state.vy = (state.vy / speed) * max;
    }

    // 2. 记下自己的路（私有记忆，别的鸟不读它）
    state.trail.push({ x: state.x, y: state.y });
    if (state.trail.length > TRAIL_MAX) state.trail.shift();
  };

  return state;
}
