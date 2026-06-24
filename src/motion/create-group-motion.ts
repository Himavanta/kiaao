// kiaao — createGroupMotion: each mode animation directive
// Business/animation signal separation for array signals.
// Supports keyFn-based precise diff or full-exit path without keyFn.

import { animate } from "motion/mini";

import { direct, type DirectiveContext } from "../core/direct.ts";
import { use } from "../core/signal.ts";
import { type Signal, type Props } from "../core/types.ts";
import { isEmpty, isDefined } from "../utils/type-guards.ts";
import {
  type ElementMotionConfig,
  type Generation,
  getMotionState,
  setMotionState,
  collectExitAnimations,
  parseMotionProps,
  playEnterAnimation,
  applyFromStyle,
} from "./shared.ts";

// ── Diff Helpers ──────────────────────────────────────

/**
 * 通过 keyFn 比对新旧数组，返回被移除的 key 数组。
 * 使用 Set 差集计算，避免索引位移误判。
 */
function findRemovedKeys<T, K>(
  oldArray: T[],
  newArray: T[],
  keyFn: (item: T, index: number) => K,
): K[] {
  const newKeys = new Set(newArray.map((item, i) => keyFn(item, i)));
  const removed: K[] = [];

  for (const [i, item] of oldArray.entries()) {
    const key = keyFn(item, i);
    if (!newKeys.has(key) && !removed.includes(key)) {
      removed.push(key);
    }
  }

  return removed;
}

/**
 * 启动指定 key 对应的退出动画，收集动画 Promise。
 */
function collectRemovedKeyAnimations<K>(
  removedKeys: K[],
  keyToElMap: Map<K, Element>,
  propsMap: Map<Element, ElementMotionConfig>,
): Promise<any>[] {
  const anims: Promise<any>[] = [];

  for (const key of removedKeys) {
    const el = keyToElMap.get(key);
    if (!el) continue;

    const config = propsMap.get(el);
    if (!config || !config.from || getMotionState(el) === "exiting") continue;

    setMotionState(el, "exiting");
    try {
      anims.push(animate(el, config.from, config.options).finished);
    } catch {
      /* animate not available */
    }
  }

  return anims;
}

// ── Signal Change Handler ─────────────────────────────

interface HandleGroupSignalChangeOptions<T, K> {
  oldArray: T[];
  newArray: T[];
  generation: Generation;
  elements: Set<Element>;
  propsMap: Map<Element, ElementMotionConfig>;
  keyToElMap: Map<K, Element>;
  keyFn: ((item: T, index: number) => K) | undefined;
  visibleItems: (v: T[]) => void;
}

/**
 * 响应业务数组信号变化的异步处理函数。
 *
 * - 有 keyFn：通过 diff 定位被移除元素，启动退出动画。
 * - 无 keyFn：全量退出，所有已注册元素播放退出动画。
 *
 * 代际标记确保快速连续切换时只有最后一次调用生效。
 */
async function handleGroupSignalChange<T, K>(
  options: HandleGroupSignalChangeOptions<T, K>,
): Promise<void> {
  const { oldArray, newArray, generation, elements, propsMap, keyToElMap, keyFn, visibleItems } =
    options;
  const myTick = ++generation.tick;

  const anims: Promise<any>[] = [];

  if (keyFn) {
    const removedKeys = findRemovedKeys(oldArray, newArray, keyFn);
    anims.push(...collectRemovedKeyAnimations(removedKeys, keyToElMap, propsMap));
  } else {
    anims.push(...collectExitAnimations(elements, propsMap));
  }

  if (isEmpty(anims)) {
    visibleItems(newArray);
    return;
  }

  await Promise.allSettled(anims);

  if (myTick !== generation.tick) return;

  visibleItems(newArray);
}

// ── createGroupMotion ─────────────────────────────────

/**
 * 创建一个 GroupMotion 指令和对应的动画信号（each 模式）。
 *
 * 返回 `[visibleItems, GroupMotion]`：
 * - `visibleItems`：动画信号，绑定到 `each`。退出动画完成后才更新。
 * - `GroupMotion`：指令组件，包裹列表项元素，管理进入/退出动画。
 *
 * @param signal  业务数组信号 getter
 * @param keyFn   身份标识函数（可选），与 each 的 key 保持一致
 * @param context 组件 context（可选）。传入时信号清理绑定到组件生命周期。
 * @returns [visibleItems, GroupMotion]
 */
export function createGroupMotion<T, K = any>(
  signal: Signal<T[]>,
  keyFn?: (item: T, index: number) => K,
  context?: { use: typeof use },
): [visibleItems: Signal<T[]>, GroupMotion: ReturnType<typeof direct>] {
  const elements = new Set<Element>();
  const propsMap = new Map<Element, ElementMotionConfig>();
  const keyToElMap = new Map<K, Element>();
  const generation: Generation = { tick: 0 };

  const useFn: typeof use = context?.use ?? use;

  const visibleItems = useFn(signal());

  useFn(signal, () => {
    void handleGroupSignalChange({
      oldArray: visibleItems(),
      newArray: signal(),
      generation,
      elements,
      propsMap,
      keyToElMap,
      keyFn,
      visibleItems,
    });
  });

  const GroupMotion = direct((el: Element, props: Props, ctx: DirectiveContext) => {
    const config = parseMotionProps(props);

    // 在元素挂载前设 from 初始样式，onMount 时 animate(el, to) 过渡
    applyFromStyle(el, config.from);

    ctx.onMount(() => {
      propsMap.set(el, config);
      elements.add(el);

      if (keyFn && isDefined(props.key)) {
        keyToElMap.set(props.key, el);
      }

      playEnterAnimation(el, config, elements);
    });

    ctx.onUnmount(() => {
      elements.delete(el);
      propsMap.delete(el);

      if (keyFn && isDefined(props.key)) {
        keyToElMap.delete(props.key);
      }
    });
  });

  return [visibleItems, GroupMotion];
}
