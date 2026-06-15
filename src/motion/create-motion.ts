// kiaao — createMotion: when mode animation directive
// Business/animation signal separation. Users operate business signal directly,
// the animation signal lags behind to allow exit animations to complete.

import { use } from "../reactive/core.ts";
import { type Getter } from "../reactive/types.ts";
import { direct } from "../dom/directive.ts";
import type { DirectiveContext } from "../dom/directive.ts";
import { isEmpty } from "../utils/type-guards.ts";
import {
  type ElementMotionConfig,
  type Generation,
  collectExitAnimations,
  parseMotionProps,
  playEnterAnimation,
} from "./shared.ts";

// ── Signal Change Handler ─────────────────────────────

/**
 * 响应业务信号变化的异步处理函数。
 *
 * - signal → true：无需退出动画，立即更新 visible。
 * - signal → false：收集退出动画 Promise 并等待完成，再更新 visible。
 *
 * 代际标记确保快速连续切换时只有最后一次调用生效。
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

  if (myTick !== generation.tick) return;

  setVisible(false);
}

// ── createMotion ───────────────────────────────────────

/**
 * 创建一个 Motion 指令和对应的动画信号（when 模式）。
 *
 * 返回 `[visible, Motion]`：
 * - `visible`：动画信号。退出动画完成前保持 true，完成后变为 false。
 * - `Motion`：指令组件，包裹动画元素，管理进入/退出动画。
 *
 * @param signal  业务信号（布尔值 getter）
 * @param context 组件 context（可选）。传入时信号清理绑定到组件生命周期。
 * @returns [visible, Motion]
 */
export function createMotion(
  signal: Getter<any>,
  context?: { use: typeof use },
): [visible: Getter<any>, Motion: ReturnType<typeof direct>] {
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

    // propsMap/elements 在 onMount 注册（每次重挂载重新建立），
    // 解决 when 模式复用元素引用导致的跨周期失效问题。
    // onUnmount 清理两者——onMount 会在下次挂载时重新注册。
    ctx.onMount(() => {
      propsMap.set(el, config);
      playEnterAnimation(el, config, elements);
    });

    ctx.onUnmount(() => {
      elements.delete(el);
      propsMap.delete(el);
    });
  });

  return [visible, Motion];
}
