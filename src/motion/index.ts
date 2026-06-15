// kiaao — Motion directive: createMotion (when mode)
// Animation coordination via business/animation signal separation.
// The Motion directive handles enter animations via ctx.onMount,
// exit animations are triggered by an internal derivation that
// awaits all running exit animations before updating the animation signal.

import { animate } from "motion/mini";
import { use } from "../reactive/core.ts";
import { type Getter } from "../reactive/types.ts";
import { direct } from "../dom/directive.ts";
import type { DirectiveContext } from "../dom/directive.ts";
import { isNil, isEmpty } from "../utils/type-guards.ts";

// ── Motion State ──────────────────────────────────────

const MOTION_STATE = Symbol("kiaao.motion.state");

type MotionState = "idle" | "entering" | "exiting" | "exited";

function getMotionState(el: Element): MotionState {
  return (el as any)[MOTION_STATE] ?? "idle";
}

function setMotionState(el: Element, state: MotionState): void {
  (el as any)[MOTION_STATE] = state;
}

// ── Types ──────────────────────────────────────────────

/** Motion 指令的动画属性 */
interface MotionProps {
  from?: Record<string, string | number>;
  to?: Record<string, string | number>;
  duration?: number;
}

/** 每个元素持久化的动画配置 */
interface ElementMotionConfig {
  from?: Record<string, string | number>;
  to?: Record<string, string | number>;
  duration: number;
}

/** 代际标记，用于中途反转判断 */
interface Generation {
  tick: number;
}

// ── Exit Animation Collector ──────────────────────────

/**
 * 遍历所有已注册元素，启动退出动画并返回 Promise 数组。
 * 跳过无 from 配置或已在退出中的元素。
 */
function collectExitAnimations(
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
function playEnterAnimation(
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

// ── Signal Change Handler ─────────────────────────────

/**
 * 响应业务信号变化的异步处理函数。
 *
 * - signal → true：无需退出动画，立即更新 visible。
 * - signal → false：收集退出动画 Promise 并等待完成，再更新 visible。
 *
 * 代际标记（generation.tick）确保快速连续切换时只有最后一次调用生效。
 */
async function handleSignalChange(
  newValue: any,
  generation: Generation,
  elements: Set<Element>,
  propsMap: Map<Element, ElementMotionConfig>,
  setVisible: (v: any) => void,
): Promise<void> {
  const myTick = ++generation.tick;

  if (newValue === true) {
    setVisible(true);
    return;
  }

  const anims = collectExitAnimations(elements, propsMap);

  if (isEmpty(anims) && process.env.NODE_ENV !== "production") {
    console.warn(
      "[kiaao] createMotion: no exit animations to await. " +
        "Did you forget to pass `from` prop to <Motion>?",
    );
  }

  await Promise.allSettled(anims);

  if (myTick !== generation.tick) return; // 中途反转，跳过

  setVisible(false);
}

// ── Motion Prop Parser ────────────────────────────────

/** 从指令 props 中提取动画配置，duration 默认 0.3s */
function parseMotionProps(props: Record<string, any>): ElementMotionConfig {
  const { from, to, duration = 0.3 } = props as MotionProps;
  return { from, to, duration };
}

// ── createMotion ───────────────────────────────────────

/**
 * 创建一个 Motion 指令和对应的动画信号。
 *
 * 返回 `[visible, Motion]`：
 * - `visible`：动画信号。退出动画完成前保持 true，完成后变为 false。
 * - `Motion`：指令组件，包裹动画元素，管理进入/退出动画。
 *
 * 业务信号（signal）由用户直接操作，状态文案即时响应。
 * 动画信号（visible）延迟更新，确保退出动画完整播放。
 *
 * @param signal  业务信号（布尔值 getter）
 * @param context 组件 context（可选）。传入时信号清理绑定到组件生命周期。
 * @returns [visible, Motion]
 */
export function createMotion(
  signal: Getter<any>,
  context?: { use: typeof use },
): [visible: () => any, Motion: ReturnType<typeof direct>] {
  const elements = new Set<Element>();
  const propsMap = new Map<Element, ElementMotionConfig>();
  const generation: Generation = { tick: 0 };

  const useFn: typeof use = context?.use ?? use;

  const [visible, setVisible] = useFn(signal());

  useFn(signal, () => {
    void handleSignalChange(signal(), generation, elements, propsMap, setVisible);
  });

  const Motion = direct((el: Element, props: Record<string, any>, ctx: DirectiveContext) => {
    const config = parseMotionProps(props);

    // propsMap 在指令函数体设置（只执行一次），跨挂载周期持久化
    // 不在 onUnmount 中清理——参见 docs/开发跟踪/createMotion退出动画Bug调试记录.md
    propsMap.set(el, config);

    ctx.onMount(() => playEnterAnimation(el, config, elements));

    ctx.onUnmount(() => elements.delete(el));
  });

  return [visible, Motion];
}
