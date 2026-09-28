// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 输入系统（源系统）：键盘事件 → 意图信号
//
// 无事件队列、无 update——事件到即写信号，帧逻辑每帧读取最新意图
// （规划文档 4.7）。这与 example 的输入源系统同形态。
//
// 持续状态（移动 / 潜行）用信号而非队列：帧循环需要的是「此刻按着吗」，
// 队列会在按键重复与丢帧时堆积过期意图。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use, type Signal } from "kiaao";

/** 方向键 → 4 向位移的键码表 */
export const DIRECTION_KEYS: Record<string, { dx: number; dy: number }> = {
  ArrowUp: { dx: 0, dy: -1 },
  KeyW: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  KeyS: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  KeyA: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  KeyD: { dx: 1, dy: 0 },
};

/** 需要拦截默认行为的键：`Tab` 切焦点、方向键与空格滚动页面 */
const PREVENT_DEFAULT = new Set([
  ...Object.keys(DIRECTION_KEYS),
  "Space",
  "Tab",
  "ShiftLeft",
  "ShiftRight",
]);

/** 方向意图：单位向量（未按方向键时为 0,0） */
export type Direction = { dx: number; dy: number };

export type InputSystem = {
  /** 当前按下的方向键（有序集合：末位为最近按下） */
  pressed: Signal<ReadonlySet<string>>;
  /** 潜行中（Shift 按住） */
  sneaking: Signal<boolean>;
  /**
   * 挂载键盘监听。
   *
   * 输入是全局源系统，不属于任何实体——故只借用一个生命周期上下文
   * （组件的 `ctx` 即可），不采用 `enter(id, ctx)` 的实体注册形态。
   */
  attach: (ctx: LifecycleContext) => void;
  /** 注册 Tab 切换回调（视野提示的开关，由组装层接线） */
  onToggleVision: (fn: () => void) => void;
};

/** 只要求生命周期钩子的最简上下文 */
export type LifecycleContext = {
  onMount(fn: () => void): void;
  onUnmount(fn: () => void): void;
};

/**
 * 读取方向意图：多键同时按下时取**最近按下**的那个。
 *
 * `pressed` 是 Set，迭代顺序为插入顺序，末位即最近按下。这样
 * 「按着左不放再按下」会立即向右，符合直觉；若固定取第一个，
 * 旧键会一直压制新键，手感发滞。
 */
export function readDirection(pressed: ReadonlySet<string>): Direction {
  const last = [...pressed].pop();
  return (last && DIRECTION_KEYS[last]) || { dx: 0, dy: 0 };
}

export function createInputSystem(): InputSystem {
  const pressed = use<ReadonlySet<string>>(new Set<string>());
  const sneaking = use(false);

  // Tab 回调由组装层注入（输入系统不关心「视野提示」是什么）
  let onToggleVision: (() => void) | undefined;

  const onKeyDown = (e: KeyboardEvent) => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    // 忽略长按重复：目标状态已由首次按下建立
    if (e.repeat) return;

    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      sneaking(true);
      return;
    }
    if (e.code === "Tab") {
      onToggleVision?.();
      return;
    }
    if (DIRECTION_KEYS[e.code]) {
      pressed(new Set([...pressed(), e.code]));
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      sneaking(false);
      return;
    }
    if (!DIRECTION_KEYS[e.code]) return;

    const next = new Set(pressed());
    next.delete(e.code);
    pressed(next);
  };

  // 失焦时清空按键状态：否则切窗口回来会「一直往一个方向走」
  const onBlur = () => {
    pressed(new Set());
    sneaking(false);
  };

  const attach = (ctx: LifecycleContext) => {
    ctx.onMount(() => {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
    });
    ctx.onUnmount(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    });
  };

  return {
    pressed,
    sneaking,
    attach,
    onToggleVision: (fn) => {
      onToggleVision = fn;
    },
  };
}
