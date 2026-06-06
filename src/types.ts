// kiaao — Type definitions

// ── Symbols ────────────────────────────────────────────

/** 标识响应式函数，供 h() 识别 */
export const IS_REACTIVE = Symbol("is_reactive");

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

/** 挂载在 derive 返回的函数上，存储内部 effect 的 stop 函数 */
export const STOP_KEY = Symbol("stop");

/** 挂载在 DOM 节点上，存储动态绑定的 effect stop 函数集合 */
export const LOCAL_EFFECTS = Symbol("local_effects");

/** 挂载 SSR 变体的唯一键 */
export const SSR_COMPONENT = Symbol("kiaao.ssr");

// ── Public API Types ───────────────────────────────────

export interface Getter<T> {
  /** 无选择器：返回当前全量快照（立即求值，同时在 effect 内追踪依赖） */
  (): T;
  /** 传选择器：返回响应式派生函数，延迟求值，精准订阅 */
  <R>(selector: (value: T) => R): () => R;
}

export interface Setter<T> {
  (newValue: T): T;
  (updater: (prev: T) => T): T;
}

export interface ReactiveFunction {
  (): any;
  [IS_REACTIVE]?: true;
}

// ── Lifecycle ──────────────────────────────────────────

export interface ComponentInstance {
  id: number;
  mountCallbacks: (() => void)[];
  unmountCallbacks: (() => void)[];
  effectStops: Set<() => void>;
}
