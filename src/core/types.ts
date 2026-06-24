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
}

/** processChildren 的返回值类型 */
export interface ProcessChildrenResult {
  nodes: HostNode[];
  cleanups: CleanupFn[];
}

/** 创建 HResult 对象 */
export function createHResult(
  owner: Owner | null,
  nodes: HostNode[],
  cleanups?: CleanupFn[],
): HResult {
  const result: HResult = {
    [HRESULT_SYMBOL]: true as const,
    owner,
    nodes,
  };
  if (isNotNil(cleanups) && isNotEmpty(cleanups)) {
    result.cleanups = cleanups;
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
export type ComponentResult = HResult | HResult[] | Promise<HResult | HResult[]>;

/** 可合并到 Owner 树的渲染结果 */
export type MergeableResult = HostNode;

/** 清理函数 */
export type CleanupFn = () => void;

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
}

// ── RenderAdapter Interface ────────────────────────────

/** 渲染适配器：所有平台渲染操作通过此接口 */
export interface RenderAdapter {
  createElement(tag: string): HostNode;
  createTextNode(text: string): HostNode;
  createComment(text: string): HostNode;
  before(ref: HostNode, child: HostNode): void;
  append(parent: HostNode, child: HostNode): void;
  remove(node: HostNode): void;
  replaceWith(oldNode: HostNode, ...newNodes: HostNode[]): void;
  setProp(el: HostNode, key: string, value: unknown): void;
  addEventListener(el: HostNode, type: string, handler: (...args: any[]) => void): void;
  removeEventListener(el: HostNode, type: string, handler: (...args: any[]) => void): void;
  /** 判断值是否为合法的宿主节点 */
  isNode(value: unknown): value is HostNode;
  /**
   * 获取宿主节点的前一个兄弟节点。用于 each 指令的位置判断。
   * DOM：返回 previousSibling；SSR：返回 null。
   */
  getPreviousSibling(node: HostNode): HostNode;
  /**
   * 可选：创建静态派生信号。SSR adapter 用于跳过响应式依赖追踪，直接求值。
   * DOM adapter 不实现此方法，core 走默认完整派生路径。
   */
  createStaticDerived?: <T>(fn: (...args: any[]) => T, deps: Signal<any>[]) => Signal<T>;
}
