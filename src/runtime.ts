// kiaao — Core runtime: define, effect, derive

import {
  IS_REACTIVE,
  STOP_KEY,
  type Getter,
  type Setter,
  type ComponentInstance,
} from "./types.ts";

// ── Internal Types ─────────────────────────────────────

type SelectorFn<T> = (value: T) => any;

interface DepEntry {
  /** The effect's run function — used as identity for cleanup */
  run: () => void;
}

interface Signal<T> {
  id: number;
  value: T;
  /** deps: selectorFn → Set<{ run }> */
  deps: Map<SelectorFn<T>, Set<DepEntry>>;
}

// ── Global Context ─────────────────────────────────────

const effectStack: (() => void)[] = [];
const componentStack: ComponentInstance[] = [];
let nextSignalId = 0;
let nextComponentId = 0;

/** Peek current effect run function (undefined if none) */
function currentEffect(): (() => void) | undefined {
  return effectStack[effectStack.length - 1] ?? undefined;
}

/** Peek current component instance (undefined if none) */
export function currentComponent(): ComponentInstance | undefined {
  return componentStack[componentStack.length - 1] ?? undefined;
}

/** Push a component onto the stack (called by h component-mode) */
export function pushComponent(inst: ComponentInstance): void {
  componentStack.push(inst);
}

/** Pop a component from the stack */
export function popComponent(): void {
  componentStack.pop();
}

/** Allocate a new component instance */
export function createComponentInstance(): ComponentInstance {
  return {
    id: nextComponentId++,
    mountCallbacks: [],
    unmountCallbacks: [],
    effectStops: new Set(),
  };
}

// ── Dep Registration (called from getters) ─────────────

/** Register a dependency from selectorFn + current effect onto a signal. */
function registerDep<T>(signal: Signal<T>, selectorFn: SelectorFn<T>): void {
  const run = currentEffect();
  if (!run) return;

  // ── signal side ──
  let entries = signal.deps.get(selectorFn);
  if (!entries) {
    entries = new Set();
    signal.deps.set(selectorFn, entries);
  }

  // Deduplicate within the same effect run
  let exists = false;
  for (const entry of entries) {
    if (entry.run === run) {
      exists = true;
      break;
    }
  }
  if (!exists) {
    entries.add({ run });
  }

  // ── effect side (ownedDeps) ──
  const owned = (run as any)._ownedDeps as Map<Signal<any>, Set<SelectorFn<any>>> | undefined;
  if (owned) {
    let sels = owned.get(signal);
    if (!sels) {
      sels = new Set();
      owned.set(signal, sels);
    }
    sels.add(selectorFn);
  }
}

// ── Effect Cleanup Helper ──────────────────────────────

/**
 * Remove all dependency entries owned by `run` from each signal's deps map.
 * This is used both during effect re-run (re-collect) and on permanent stop.
 */
function cleanupOwnedDeps(
  ownedDeps: Map<Signal<any>, Set<SelectorFn<any>>>,
  run: () => void,
): void {
  for (const [signal, selectors] of ownedDeps) {
    for (const sel of selectors) {
      const entries = signal.deps.get(sel);
      if (!entries) continue;
      for (const entry of entries) {
        if (entry.run === run) {
          entries.delete(entry);
        }
      }
      if (entries.size === 0) {
        signal.deps.delete(sel);
      }
    }
  }
  ownedDeps.clear();
}

// – Signal update (values have already been swapped) –
function notifySignal<T>(signal: Signal<T>, oldValue: T): void {
  // Snapshot deps before iterating — effects may mutate signal.deps during re-run
  const snapshot = [...signal.deps.entries()];

  for (const [selectorFn, entries] of snapshot) {
    const oldResult = selectorFn(oldValue);
    const newResult = selectorFn(signal.value);

    if (oldResult !== newResult) {
      // Snapshot individual entries too (same reason)
      const entryList = [...entries];
      const triggered = new Set<() => void>();

      for (const entry of entryList) {
        if (!triggered.has(entry.run)) {
          triggered.add(entry.run);
          entry.run();
        }
      }
    }
  }
}

// ── define ─────────────────────────────────────────────

export function define<T>(initialValue: T): [Getter<T>, Setter<T>] {
  const signal: Signal<T> = {
    id: nextSignalId++,
    value: initialValue,
    deps: new Map(),
  };

  const getter = ((selector?: (value: T) => any): any => {
    if (selector === undefined) {
      // Raw read — tracks dependency with identity selector
      registerDep(signal, (v: T) => v);
      return signal.value;
    }

    // Selector mode — returns a reactive function
    const reactiveFn = (() => {
      registerDep(signal, selector);
      return selector(signal.value);
    }) as any;

    reactiveFn[IS_REACTIVE] = true;
    return reactiveFn;
  }) as Getter<T>;

  const setter = ((updater: any): any => {
    const oldValue = signal.value;

    // Convention: if argument is a function, treat as updater;
    // otherwise treat as a direct new value (same as React setState).
    if (typeof updater === "function") {
      signal.value = (updater as (prev: T) => T)(oldValue);
    } else {
      signal.value = updater as T;
    }

    if (signal.value !== oldValue) {
      notifySignal(signal, oldValue);
    }

    return signal.value;
  }) as Setter<T>;

  return [getter, setter];
}

// ── effect ─────────────────────────────────────────────

export function effect(fn: () => void): () => void {
  const ownedDeps = new Map<Signal<any>, Set<SelectorFn<any>>>();

  const run = () => {
    // 1. Clean up old dependency entries from all signals
    cleanupOwnedDeps(ownedDeps, run);

    // 2. Push self onto the effect stack
    effectStack.push(run);

    // 3. Execute the user function (dep collection happens inside)
    fn();

    // 4. Pop from stack
    effectStack.pop();
  };

  // Attach ownedDeps for the dep registration machinery
  (run as any)._ownedDeps = ownedDeps;

  // Initial run: collect initial dependencies
  run();

  // Return stop function
  return () => {
    cleanupOwnedDeps(ownedDeps, run);
  };
}

// ── derive ─────────────────────────────────────────────

export function derive<T>(computeFn: () => T): () => T {
  const [getVer, setVer] = define(0);
  let cached: T = undefined as any;
  let computed = false;

  const stop = effect(() => {
    // Re-run computeFn to re-collect upstream deps and get latest value.
    // This is eager — we compute whenever upstream changes.
    // The optimization: if the result is the same as cached, we skip the
    // version bump, avoiding unnecessary downstream re-runs.
    const newValue = computeFn();

    if (!computed || newValue !== cached) {
      cached = newValue;
      computed = true;
      setVer((v) => v + 1);
    }
  });

  const deriveFn = (() => {
    // Subscribe to the version signal so downstream effects are notified
    // when the internal effect recomputes us.
    getVer((v) => v)();
    return cached;
  }) as any;

  deriveFn[IS_REACTIVE] = true;
  deriveFn[STOP_KEY] = stop;

  return deriveFn;
}
