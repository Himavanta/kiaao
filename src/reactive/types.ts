// kiaao v4 — Reactive system types (platform-agnostic)
// Symbols are shared constants used across reactive core and platform layers.

/** REACTIVE Symbol — 标记信号函数，指向内部状态对象 */
export const REACTIVE = Symbol("reactive");

// ── DOM / Component Symbols ────────────────────────────
// 虽然由 DOM 层消费，但作为跨层共享常量放在此处，避免循环依赖。

/** 挂载在根 DOM 节点上，存储组件销毁函数 */
export const DISPOSE_KEY = Symbol("dispose");

/** 挂载在根 DOM 节点上，存储组件实例引用 */
export const INSTANCE_KEY = Symbol("instance");

/** 挂载在组件实例上，存储 effect stop 函数集合 */
export const EFFECTS_KEY = Symbol("effects");

/** 标记组件已初始化 */
export const INITIALIZED_KEY = Symbol("initialized");

/** 标记组件已销毁 */
export const DISPOSED_KEY = Symbol("disposed");

/** 挂载在 DOM 节点上，存储动态绑定的 effect stop 函数集合 */
export const LOCAL_EFFECTS = Symbol("local_effects");

/** 挂载 SSR 变体的唯一键 */
export const SSR_COMPONENT = Symbol("kiaao.ssr");

// ── Public API Types ───────────────────────────────────

/** 信号读取函数 */
export interface Getter<T> {
  (): T;
}

/** 信号写入函数 */
export interface Setter<T> {
  (newValue: T): T;
  (updater: (prev: T) => T): T;
}

// ── Internal Node Types ────────────────────────────────

/**
 * 定义节点（use(init)）的内部状态。
 * 挂载在 getter[REACTIVE] 上。
 */
export interface DefinitionState<T> {
  value: T;
  subs: Set<DerivationState<any>>;
  set: Setter<T>;
}

/**
 * 派生节点（use(...deps, fn)）的内部状态。
 * 挂载在 getter[REACTIVE] 上。
 */
export interface DerivationState<T> {
  deps: Set<Getter<any>>;
  cachedValue: T;
  subs: Set<DerivationState<any>>;
  computeFn: (v?: any) => T;
  set: Setter<T>;
  stops: Set<() => void>;
  /** 统一清理入口：遍历 stops 从各依赖的 subs 中移除自身 */
  stop: () => void;
}

/** 信号内部状态的联合类型（运行时通过结构区分） */
export type SignalState<T> = DefinitionState<T> | DerivationState<T>;

// ── Lifecycle ──────────────────────────────────────────

export interface ComponentInstance {
  id: number;
  mountCallbacks: (() => void)[];
  unmountCallbacks: (() => void)[];
  effectStops: Set<() => void>;
}
