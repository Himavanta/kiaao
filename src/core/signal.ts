// kiaao — Reactive signal system: use, isUse, toValue
// Platform-agnostic. No DOM dependencies.
// Signal<T> replaces [Getter<T>, Setter<T>] — signal() reads, signal(v) writes.

import {
  REACTIVE,
  type Signal,
  type DefinitionState,
  type DerivationState,
  type SignalState,
  getSignalState,
} from "./types.ts";
import { isFunction, isNotEmpty, isNotNil, isSingle, isEmpty } from "../utils/type-guards.ts";

// ── Render Mode ────────────────────────────────────────

export type RenderMode = "dom" | "ssr" | "hydrate";

let currentRenderMode: RenderMode = "dom";

export const setRenderMode = (mode: RenderMode): void => {
  currentRenderMode = mode;
};

export const getRenderMode = (): RenderMode => currentRenderMode;

// ── Signal Identity ────────────────────────────────────

export const isUse = (v: any): v is Signal<any> =>
  isNotNil(v) && (v as any)[REACTIVE] !== undefined;

// ── Value Normalization ────────────────────────────────

export const toValue = (v: any): any => (isUse(v) ? (v as any)() : v);

// ── Signal Lifecycle ─────────────────────────────────

export function registerSignalStop(args: any[], register: (stop: () => void) => void): any {
  const result = (use as (...a: any[]) => any)(...args);

  // 引用已有信号 → 直接返回，不注册清理
  if (isSingle(args) && isUse(args[0]) && result === args[0]) {
    return result;
  }

  const stop = getSignalState(result)?.stop;
  if (isFunction(stop)) {
    register(stop);
  }
  return result;
}

// ── use ────────────────────────────────────────────────

export type UseFunction = {
  <T>(signal: Signal<T>): Signal<T>;
  <T>(initialValue: T): Signal<T>;
  <T>(...deps: [...Signal<any>[], (v?: any) => T]): Signal<T>;
};

export const use: UseFunction = ((...args: any[]): any => {
  if (isSingle(args)) {
    const val = args[0];
    if (isUse(val)) {
      return val; // 直接返回信号本身
    }
    return definitionMode(val);
  }
  return derivationMode(...args);
}) as UseFunction;

// ── Signal Creator ─────────────────────────────────────

function createSignal<T>(fn: Signal<T>, state: any): Signal<T> {
  (fn as any)[REACTIVE] = state;
  return fn;
}

// ── Definition Mode ────────────────────────────────────

function definitionMode<T>(initialValue: T): Signal<T> {
  const state: DefinitionState<T> = {
    value: initialValue,
    subs: new Set(),
    stop: () => {},
  };

  const signal = function (...args: any[]): any {
    if (isEmpty(args)) return state.value;
    const [updater] = args;
    const oldValue = state.value;
    state.value = isFunction(updater) ? (updater as (prev: T) => T)(oldValue) : (updater as T);
    if (state.value !== oldValue) {
      triggerDerivations(state);
    }
    return;
  } as Signal<T>;

  return createSignal(signal, state);
}

// ── Derivation State Builder ──────────────────────────

function buildDerivationState<T>(
  func: (v?: any) => T,
  validDeps: Signal<any>[],
): DerivationState<T> {
  const state: DerivationState<T> = {
    deps: new Set(validDeps),
    cachedValue: undefined as any,
    subs: new Set(),
    computeFn: func,
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

function derivationMode<T>(...args: any[]): Signal<T> {
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

  const validDeps: Signal<any>[] = deps.filter((d: any) => isUse(d));

  if (currentRenderMode === "ssr") {
    const value = (func as (v?: any) => T)(undefined);
    return definitionMode(value);
  }

  const state = buildDerivationState<T>(func as (v?: any) => T, validDeps);
  computeInitialDerivedValue(state);

  const signal = function (...args: any[]): any {
    if (isEmpty(args)) return state.cachedValue;
    const [value] = args;
    recomputeDerivation(state, value);
    return;
  } as Signal<T>;

  return createSignal(signal, state);
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
