// kiaao — Core types: Owner, RenderAdapter, signal internals, symbols
// Platform-agnostic. No DOM dependencies.

import { isObject, isNotNil, isNotEmpty } from "./type-guards.ts";

// ── Symbols ─────────────────────────────────────────────

/** REACTIVE Symbol — 标记信号函数，指向内部状态对象 */
export const REACTIVE = Symbol("reactive");

/** DIRECT_KEY Symbol — 标记指令函数 */
export const DIRECT_KEY = Symbol("direct");

/** SSR_COMPONENT Symbol — 标记 SSR 变体组件 */
export const SSR_COMPONENT = Symbol("kiaao.ssr");

// ── Host Node Type ─────────────────────────────────────

/** 宿主节点类型——由各平台 adapter 定义具体是什么（DOM 平台是 Node，SSR 是 SSRNode） */
export type HostNode = unknown;

// ── HResult Types ───────────────────────────────────────

/** HResult Symbol — 标记 h() 返回的 HResult 对象 */
export const HRESULT_SYMBOL = Symbol("kiaao.hresult");

/** h() 返回值：携带所有权信息和节点 */
export interface HResult {
  [HRESULT_SYMBOL]: true;
  owner: Owner | null;
  nodes: HostNode[];
  cleanups?: CleanupFn[];
  childResults?: any[];
}

/** 创建 HResult 对象 */
export function createHResult(
  owner: Owner | null,
  nodes: HostNode[],
  cleanups?: CleanupFn[],
  childResults?: any[],
): HResult {
  const result: HResult = {
    [HRESULT_SYMBOL]: true as const,
    owner,
    nodes,
  };
  if (isNotNil(cleanups) && isNotEmpty(cleanups)) {
    result.cleanups = cleanups;
  }
  if (isNotNil(childResults) && isNotEmpty(childResults)) {
    result.childResults = childResults;
  }
  return result;
}

/** 判断一个值是否为 HResult */
export function isHResult(value: unknown): value is HResult {
  return isObject(value) && HRESULT_SYMBOL in value;
}

/** 信号接口：无参调用为读取，有参调用为写入 */
export interface Signal<T> {
  (): T;
  (value: T | ((prev: T) => T)): void;
}

/** 组件/元素的属性对象类型——不可空 */
export type Props = Record<string, any>;

/** 组件/元素的属性对象类型——可空，配合 `= {}` 默认参数使用 */
export type NullableProps = Props | null | undefined;

/** 组件函数返回值的类型：同步结果为 HResult 或 HResult 数组，异步结果为 Promise */
export type ComponentResult =
  | HResult
  | HResult[]
  | HostNode[]
  | Promise<HResult | HResult[]>
  | string
  | number
  | boolean
  | null
  | undefined;

/** 可合并到 Owner 树的渲染结果 */
export type MergeableResult = HostNode;

/** 清理函数 */
export type CleanupFn = () => void;

/**
 * 控制流组件 children 类型：单值或 [primary, fallback?] 元组。
 * handleComponent 会通过 normalizeChildren 将单值解包，
 * 故组件内需用 normalizeChildList 重新包装。
 */
export type ControlFlowChildren<T, F> = T | [T, F?];

/**
 * 值为 T 或 Signal<T>，用于 props 类型声明。
 * 类似 Vue 的 MaybeRef<T>，但对应 Kiaao 的 Signal 体系。
 */
export type MaybeSignal<T> = T | Signal<T>;

// ── Signal Internal Types ──────────────────────────────

/** 定义节点（use(init)）的内部状态 */
export interface DefinitionState<T> {
  value: T;
  subs: Set<DerivationState<any>>;
  stop: () => void;
}

/** 派生节点（use(...deps, fn)）的内部状态 */
export interface DerivationState<T> {
  deps: Set<Signal<any>>;
  cachedValue: T;
  subs: Set<DerivationState<any>>;
  computeFn: (v?: T) => T;
  stops: Set<() => void>;
  stop: () => void;
}

/** 信号内部状态的联合类型 */
export type SignalState<T> = DefinitionState<T> | DerivationState<T>;

/**
 * 安全获取信号的内部状态。
 * 封装了 `(signal as any)[REACTIVE]` 模式，提供类型安全访问。
 */
export function getSignalState<T>(signal: Signal<T>): SignalState<T> | undefined {
  return (signal as any)[REACTIVE];
}

// ── Owner Types ────────────────────────────────────────

/** 生命周期作用域节点 */
export interface Owner {
  parent: Owner | null;
  children: Owner[];
  cleanups: CleanupFn[];
  mountCallbacks: CleanupFn[];
  unmountCallbacks: CleanupFn[];
  elements: Set<unknown>;
  disposed: boolean;
  /** 轻量 Owner：DOM 元素临时 Owner，nestBind 遍历后 children 被转移即弃用 */
  isLightweight?: boolean;
}

// ── RenderAdapter Interface ────────────────────────────

/** 渲染适配器：所有平台渲染操作通过此接口 */
export interface RenderAdapter {
  el(tag: string): HostNode;
  text(text: string): HostNode;
  comment(text: string): HostNode;
  before(ref: HostNode, child: HostNode): void;
  append(parent: HostNode, child: HostNode): void;
  remove(node: HostNode): void;
  clear(parent: HostNode): void;
  setText(node: HostNode, value: string): void;
  replace(oldNode: HostNode, ...newNodes: HostNode[]): void;
  setProp(el: HostNode, key: string, value: unknown, cleanups?: CleanupFn[]): void;
  on(el: HostNode, type: string, handler: (...args: any[]) => void): void;
  off(el: HostNode, type: string, handler: (...args: any[]) => void): void;
  /** 判断值是否为合法的宿主节点 */
  isNode(value: unknown): value is HostNode;
  /**
   * 获取宿主节点的前一个兄弟节点。用于 each 指令的位置判断。
   * DOM：返回 previousSibling；SSR：返回 null。
   */
  prevSibling(node: HostNode): HostNode;
  /**
   * 可选：创建静态派生信号。SSR adapter 用于跳过响应式依赖追踪，直接求值。
   * DOM adapter 不实现此方法，core 走默认完整派生路径。
   */
  createStaticDerived?: <T>(fn: (...args: any[]) => T, deps: Signal<any>[]) => Signal<T>;
}
