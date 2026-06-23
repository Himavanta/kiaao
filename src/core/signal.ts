// kiaao — Reactive signal system: use, isUse, toValue
// Platform-agnostic. No DOM dependencies.
// Migrated from src/reactive/core.ts without functional changes.

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
// SSR 模式下派生退化为一次性计算。

export type RenderMode = "dom" | "ssr" | "hydrate";

let currentRenderMode: RenderMode = "dom";

export const setRenderMode = (mode: RenderMode): void => {
  currentRenderMode = mode;
};

export const getRenderMode = (): RenderMode => currentRenderMode;

// ── Signal Identity ────────────────────────────────────

export const isUse = (v: any): v is Getter<any> =>
  isNotNil(v) && (v as any)[REACTIVE] !== undefined;

// ── Value Normalization ────────────────────────────────

export const toValue = (v: any): any => (isUse(v) ? (v as any)() : v);

// ── Signal Lifecycle ─────────────────────────────────

export function registerSignalStop(args: any[], register: (stop: () => void) => void): any {
  const result = (use as (...a: any[]) => any)(...args);
  const getter = result[0];

  if (isSingle(args) && isUse(args[0]) && result[0] === args[0]) {
    return result;
  }

  const stop = (getter as any)[REACTIVE]?.stop;
  if (isFunction(stop)) {
    register(stop);
  }
  return result;
}

// ── use ────────────────────────────────────────────────

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

  for (const dep of validDeps) {
    const depState = (dep as any)[REACTIVE] as SignalState<any>;
    depState.subs.add(state);

    const cancel = () => {
      depState.subs.delete(state);
    };
    state.stops.add(cancel);
  }

  state.stop = () => {
    for (const cancel of state.stops) {
      cancel();
    }
    state.stops.clear();
  };

  return state;
}

// ── Initial Computation ───────────────────────────────

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
  const ars = [...args];
  const [func, ...deps] = ars.reverse();

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

  const validDeps: Getter<any>[] = deps.filter((d: any) => isUse(d));

  if (currentRenderMode === "ssr") {
    const value = (func as (v?: any) => T)(undefined);
    return definitionMode(value);
  }

  const state = buildDerivationState<T>(func as (v?: any) => T, validDeps);
  computeInitialDerivedValue(state);

  const getter = (() => state.cachedValue) as Getter<T>;

  const setter = ((value: any): T => {
    recomputeDerivation(state, value);
    return state.cachedValue;
  }) as Setter<T>;

  return createSignal(getter, setter, state);
}

// ── Update Propagation ─────────────────────────────────

function triggerDerivations<T>(state: DefinitionState<T>): void {
  const subs = [...state.subs];
  for (const sub of subs) {
    recomputeDerivation(sub, undefined);
  }
}

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
