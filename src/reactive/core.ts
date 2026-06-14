// kiaao — Reactive core: use, isUse, toValue
// Platform-agnostic. No DOM dependencies.

import {
  REACTIVE,
  type Getter,
  type Setter,
  type DefinitionState,
  type DerivationState,
  type SignalState,
} from "./types.ts";
import { isFunction, isNotEmpty, isNotNil, isSingle } from "../utils/type-guards.ts";

// ── Render Mode ────────────────────────────────────────
// 控制派生信号的运行模式。
// 虽然偏平台概念，但 SSR 模式下派生行为不同（一次性计算），故放在 reactive 层。

export type RenderMode = "dom" | "ssr" | "hydrate";

let currentRenderMode: RenderMode = "dom";

export const setRenderMode = (mode: RenderMode): void => {
  currentRenderMode = mode;
};

export const getRenderMode = (): RenderMode => currentRenderMode;

// ── Signal Identity ────────────────────────────────────

/**
 * 判断一个值是否是 use() 创建的信号（getter 函数）。
 * 原理：检查函数上是否挂载了 REACTIVE 标记。
 */
export const isUse = (v: any): v is Getter<any> =>
  isNotNil(v) && (v as any)[REACTIVE] !== undefined;

// ── Value Normalization ────────────────────────────────

/**
 * 将任意值解包为原始 JavaScript 值。
 * - 若 v 是信号：调用 v() 返回当前值
 * - 否则：原样返回 v
 *
 * 只做一层解包，不递归，不处理返回值是函数的情况。
 */
export const toValue = (v: any): any => (isUse(v) ? (v as any)() : v);

// ── Signal Lifecycle ─────────────────────────────────

/**
 * 调用 use 创建信号，若创建了新资源则将 stop 注册到指定的清理容器。
 * 若引用已有信号则不重复注册。
 *
 * @param args use 的参数列表
 * @param register 新信号 stop 函数的注册回调
 * @returns use 的返回结果 [getter, setter]
 */
export function registerSignalStop(args: any[], register: (stop: () => void) => void): any {
  const result = (use as (...a: any[]) => any)(...args);
  const getter = result[0];

  // 引用已有信号，不注册清理
  if (isSingle(args) && isUse(args[0]) && result[0] === args[0]) {
    return result;
  }

  // 创建了新资源，注册 stop
  const stop = (getter as any)[REACTIVE]?.stop;
  if (isFunction(stop)) {
    register(stop);
  }
  return result;
}

// ── use ────────────────────────────────────────────────

/**
 * 响应式信号创建函数。根据参数个数自动进入两种模式之一。
 *
 * **定义模式**（单参数）：
 *   const [count, setCount] = use(0)
 *   创建可读写的信号。
 *
 * **派生模式**（多个参数，最后一个为函数）：
 *   const [double] = use(count, () => count() * 2)
 *   创建派生信号，自动追踪依赖变化并缓存结果。
 *
 * 两种模式返回值始终为 [getter, setter] 元组，解构永远安全。
 */

// ── 类型重载 ──

export type UseFunction = {
  <T>(signal: Getter<T>): [Getter<T>, Setter<T>];
  <T>(initialValue: T): [Getter<T>, Setter<T>];
  <T>(...deps: [...Getter<any>[], (v?: any) => T]): [Getter<T>, Setter<T>];
};

export const use: UseFunction = (...args: any[]): any => {
  if (isSingle(args)) {
    const val = args[0];
    if (isUse(val)) {
      const state = (val as any)[REACTIVE] as { set: Setter<any> };
      return [val, state.set];
    }
    return definitionMode(val);
  }
  return derivationMode(...args);
};

// ── Signal Creator ─────────────────────────────────────
// 创建 getter/setter 元组，挂载 REACTIVE 标记
// 返回 [getter, setter] 并保持 state.set = setter

function createSignal<T>(getter: Getter<T>, setter: Setter<T>, state: any): [Getter<T>, Setter<T>] {
  (getter as any)[REACTIVE] = state;
  state.set = setter;
  return [getter, setter];
}

// ── Definition Mode ────────────────────────────────────

function definitionMode<T>(initialValue: T): [Getter<T>, Setter<T>] {
  const state: DefinitionState<T> = {
    value: initialValue,
    subs: new Set(),
    set: null as any,
    stop: () => {},
  };

  const getter = (() => state.value) as Getter<T>;

  const setter = ((updater: any): T => {
    const oldValue = state.value;
    state.value = isFunction(updater) ? (updater as (prev: T) => T)(oldValue) : (updater as T);
    if (state.value !== oldValue) {
      triggerDerivations(state);
    }
    return state.value;
  }) as Setter<T>;

  return createSignal(getter, setter, state);
}

// ── Derivation State Builder ──────────────────────────

/**
 * 构造派生节点的内部状态，注册到各依赖的 subs，创建统一清理函数。
 */
function buildDerivationState<T>(
  func: (v?: any) => T,
  validDeps: Getter<any>[],
): DerivationState<T> {
  const state: DerivationState<T> = {
    deps: new Set(validDeps),
    cachedValue: undefined as any,
    subs: new Set(),
    computeFn: func,
    set: null as any,
    stops: new Set(),
    stop: null as any,
  };

  // 注册到各依赖的 subs
  for (const dep of validDeps) {
    const depState = (dep as any)[REACTIVE] as SignalState<any>;
    depState.subs.add(state);

    const cancel = () => {
      depState.subs.delete(state);
    };
    state.stops.add(cancel);
  }

  // 统一清理函数
  state.stop = () => {
    for (const cancel of state.stops) {
      cancel();
    }
    state.stops.clear();
  };

  return state;
}

// ── Initial Computation ───────────────────────────────

/**
 * 执行派生信号的初始计算，异常时缓存 undefined。
 */
function computeInitialDerivedValue<T>(state: DerivationState<T>): void {
  try {
    state.cachedValue = state.computeFn(undefined);
  } catch (err) {
    console.error("[kiaao] derive error during initial computation:", err);
    state.cachedValue = undefined as any;
  }
}

// ── Derivation Mode ────────────────────────────────────

function derivationMode<T>(...args: any[]): [Getter<T>, Setter<T>] {
  // ── 解析参数 ──
  // 使用 args.reverse() 解构：最后一个参数是计算函数，其余为依赖
  // 参考 doc.md 第二节：此为最终决定，后续实现遵循此写法
  const ars = [...args];
  const [func, ...deps] = ars.reverse();

  // ── 开发模式校验 ──
  if (process.env.NODE_ENV !== "production") {
    if (!isFunction(func)) {
      console.warn("[kiaao] use(...): last argument must be a function");
      return definitionMode(undefined) as any;
    }
    if (isUse(func)) {
      console.warn("[kiaao] use(...): last argument is a signal, not a plain function");
      return definitionMode(undefined) as any;
    }
    const nonSignals = deps.filter((d: any) => !isUse(d));
    if (isNotEmpty(nonSignals)) {
      console.warn(
        "[kiaao] use(...): dependencies must be signals. Non-signal values will be filtered out.",
      );
    }
  }

  // 过滤有效依赖
  const validDeps: Getter<any>[] = deps.filter((d: any) => isUse(d));

  // ── SSR 模式：一次性计算 ──
  if (currentRenderMode === "ssr") {
    const value = (func as (v?: any) => T)(undefined);
    return definitionMode(value);
  }

  // ── 构造派生节点 ──
  const state = buildDerivationState<T>(func as (v?: any) => T, validDeps);

  // ── 初始计算 ──
  computeInitialDerivedValue(state);

  const getter = (() => state.cachedValue) as Getter<T>;

  const setter = ((value: any): T => {
    recomputeDerivation(state, value);
    return state.cachedValue;
  }) as Setter<T>;

  return createSignal(getter, setter, state);
}

// ── Internal: Update Propagation ───────────────────────

/**
 * 触发一个定义节点的所有下游派生节点重新计算。
 * 由定义节点的 setter 在值变化后调用。
 */
function triggerDerivations<T>(state: DefinitionState<T>): void {
  // 快照：重算过程中 subs 可能被修改（节点清理）
  const subs = [...state.subs];
  for (const sub of subs) {
    recomputeDerivation(sub, undefined);
  }
}

/**
 * 重新计算一个派生节点。
 *
 * @param state 派生节点状态
 * @param setterValue 由 setter 传入的值（上游变化触发时为 undefined）
 */
function recomputeDerivation<T>(state: DerivationState<T>, setterValue?: any): void {
  let newResult: T;
  try {
    newResult = state.computeFn(setterValue);
  } catch (err) {
    console.error("[kiaao] derive error during recomputation:", err);
    return;
  }

  if (newResult !== state.cachedValue) {
    state.cachedValue = newResult;

    const subs = [...state.subs];
    for (const sub of subs) {
      recomputeDerivation(sub, undefined);
    }
  }
}
