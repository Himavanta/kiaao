// kiaao — Motion module: shared types and helpers
// Shared across createMotion (when mode) and createGroupMotion (each mode).

import { animate } from "motion/mini";
import { isNil } from "../utils/type-guards.ts";

// ── Motion State ──────────────────────────────────────

export const MOTION_STATE = Symbol("kiaao.motion.state");

export type MotionState = "idle" | "entering" | "exiting" | "exited";

/**
 * 读取元素的动画状态。未初始化时默认为 "idle"。
 */
export function getMotionState(el: Element): MotionState {
  return (el as any)[MOTION_STATE] ?? "idle";
}

/**
 * 设置元素的动画状态。
 */
export function setMotionState(el: Element, state: MotionState): void {
  (el as any)[MOTION_STATE] = state;
}

// ── Types ──────────────────────────────────────────────

/** Motion 指令的动画属性 */
export interface MotionProps {
  from?: Record<string, string | number>;
  to?: Record<string, string | number>;
  duration?: number;
}

/** 每个元素持久化的动画配置 */
export interface ElementMotionConfig {
  from?: Record<string, string | number>;
  to?: Record<string, string | number>;
  duration: number;
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
    anims.push(animate(el, config.from, { duration: config.duration }).finished);
  }

  return anims;
}

// ── Enter Animation ───────────────────────────────────

/**
 * 元素挂载时的进入动画处理。
 * 注册元素到 elements 集合，若无 to 配置则跳过动画。
 */
export function playEnterAnimation(
  el: Element,
  config: ElementMotionConfig,
  elements: Set<Element>,
): void {
  elements.add(el);
  if (isNil(config.to)) return;

  setMotionState(el, "entering");
  void animate(el, config.to, { duration: config.duration }).finished.then(
    () => setMotionState(el, "idle"),
    () => {
      /* animate interrupted */
    },
  );
}

// ── Motion Prop Parser ────────────────────────────────

/**
 * 从指令 props 中提取动画配置，duration 默认 0.3s。
 */
export function parseMotionProps(props: Record<string, any>): ElementMotionConfig {
  const { from, to, duration = 0.3 } = props as MotionProps;
  return { from, to, duration };
}
