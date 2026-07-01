// kiaao — Motion module: shared types and helpers
// Shared across createMotion (when mode) and createGroupMotion (each mode).

import { animate } from "motion/mini";

import { isNil } from "../core/index.ts";

// ── Motion State ──────────────────────────────────────

export const MOTION_STATE = Symbol("kiaao.motion.state");

export type MotionState = "idle" | "entering" | "exiting" | "exited";

export function getMotionState(el: Element): MotionState {
  return (el as any)[MOTION_STATE] ?? "idle";
}

export function setMotionState(el: Element, state: MotionState): void {
  (el as any)[MOTION_STATE] = state;
}

// ── Types ──────────────────────────────────────────────

/** 每个元素持久化的动画配置 */
export interface ElementMotionConfig {
  /** 退出动画目标值，进入动画起始值 */
  from?: Record<string, string | number>;
  /** 进入动画目标值 */
  to?: Record<string, string | number>;
  /** 透传给 motion animate() 的选项（duration, easing, delay 等） */
  options: Record<string, any>;
}

/** 代际标记，用于中途反转判断 */
export interface Generation {
  tick: number;
}

// ── Exit Animation Collector ──────────────────────────

/**
 * 遍历所有已注册元素，启动退出动画并返回 Promise 数组。
 * 跳过无 from 配置或已在退出中的元素。
 */
export function collectExitAnimations(
  elements: Set<Element>,
  propsMap: Map<Element, ElementMotionConfig>,
): Promise<any>[] {
  const anims: Promise<any>[] = [];

  for (const el of elements) {
    const config = propsMap.get(el);
    if (isNil(config) || isNil(config.from) || getMotionState(el) === "exiting") continue;

    setMotionState(el, "exiting");
    try {
      anims.push(animate(el, config.from, config.options).finished);
    } catch {
      // animate 可能因环境不支持（如 SSR、happy-dom）或元素已断开而失败
      setMotionState(el, "idle");
    }
  }

  return anims;
}

// ── Enter Animation ───────────────────────────────────

/**
 * 元素挂载时的进入动画处理。
 * 注册元素到 elements 集合，若无 to 配置则跳过动画。
 * 使用原生 WAAPI 避免 motion 引擎在 keyframe 数组上的限制。
 */
export function playEnterAnimation(
  el: Element,
  config: ElementMotionConfig,
  elements: Set<Element>,
): void {
  elements.add(el);
  if (isNil(config.to)) return;

  setMotionState(el, "entering");
  void animate(el, config.to, config.options).finished.then(
    () => setMotionState(el, "idle"),
    () => {
      /* animate interrupted */
    },
  );
}

// ── Motion Prop Parser ────────────────────────────────

/**
 * 从指令 props 中提取动画配置。
 * - from → 退出/进入起始
 * - to → 进入目标
 * - 其余 props 全部作为 options 透传给 animate()（duration, easing, delay 等）
 */
export function parseMotionProps(props: Record<string, any>): ElementMotionConfig {
  const { from, to, children: _, key: __, ...options } = props;
  return { from, to, options };
}

// ── From Style Applicator ─────────────────────────────

/**
 * 在元素挂载前设置 from 初始样式。
 * motion 的 keyframe 数组不兼容某些引擎，
 * 故将 from 样式直接写到元素上，onMount 时 animate(el, to) 从中过渡。
 * 元素此时尚未插入 DOM，设样式无视觉闪烁。
 */
export function applyFromStyle(el: Element, from?: Record<string, string | number>): void {
  if (isNil(from)) return;
  for (const [key, value] of Object.entries(from)) {
    ((el as HTMLElement).style as any)[key] = value;
  }
}
