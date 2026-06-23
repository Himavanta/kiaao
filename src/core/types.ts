// kiaao — Core types: Owner, RenderAdapter, signal internals, symbols
// Platform-agnostic. No DOM dependencies.

// ── Symbols ─────────────────────────────────────────────

/** REACTIVE Symbol — 标记信号函数，指向内部状态对象 */
export const REACTIVE = Symbol("reactive");

/** DIRECT_KEY Symbol — 标记指令函数 */
export const DIRECT_KEY = Symbol("direct");

/** SSR_COMPONENT Symbol — 标记 SSR 变体组件 */
export const SSR_COMPONENT = Symbol("kiaao.ssr");

// ── Public API Types ───────────────────────────────────

/** @internal 用于类型层面区分信号和普通函数的 brand */
export declare const GETTER_BRAND: unique symbol;

/** 信号读取函数 */
export interface Getter<T> {
  (): T;
  readonly [GETTER_BRAND]: true;
}

/** 信号写入函数 */
export interface Setter<T> {
  (newValue: T): T;
  (updater: (prev: T) => T): T;
}

/** h() 返回类型：单个节点或节点数组 */
export type Children = Node | Node[];

// ── Signal Internal Types ──────────────────────────────

/** 定义节点（use(init)）的内部状态 */
export interface DefinitionState<T> {
  value: T;
  subs: Set<DerivationState<any>>;
  set: Setter<T>;
  stop: () => void;
}

/** 派生节点（use(...deps, fn)）的内部状态 */
export interface DerivationState<T> {
  deps: Set<Getter<any>>;
  cachedValue: T;
  subs: Set<DerivationState<any>>;
  computeFn: (v?: any) => T;
  set: Setter<T>;
  stops: Set<() => void>;
  stop: () => void;
}

/** 信号内部状态的联合类型 */
export type SignalState<T> = DefinitionState<T> | DerivationState<T>;

// ── Owner Types ────────────────────────────────────────

/** 生命周期作用域节点 */
export interface Owner {
  parent: Owner | null;
  children: Owner[];
  cleanups: (() => void)[];
  mountCallbacks: (() => void)[];
  unmountCallbacks: (() => void)[];
  elements: Set<unknown>;
  disposed: boolean;
}

// ── RenderAdapter Interface ────────────────────────────

/** 渲染适配器：所有平台渲染操作通过此接口 */
export interface RenderAdapter {
  createElement(tag: string): unknown;
  createTextNode(text: string): unknown;
  createComment(text: string): unknown;
  before(ref: unknown, child: unknown): void;
  append(parent: unknown, child: unknown): void;
  remove(node: unknown): void;
  replaceWith(oldNode: unknown, ...newNodes: unknown[]): void;
  setAttribute(el: unknown, key: string, value: string): void;
  removeAttribute(el: unknown, key: string): void;
  addEventListener(el: unknown, type: string, handler: Function): void;
  removeEventListener(el: unknown, type: string, handler: Function): void;
  setProperty(el: unknown, key: string, value: unknown): void;
  querySelector(selector: string): unknown;
}

// ── Adapter Registration ───────────────────────────────

let _adapter: RenderAdapter | null = null;

export function setAdapter(adapter: RenderAdapter): void {
  _adapter = adapter;
}

export function getAdapter(): RenderAdapter {
  if (!_adapter) {
    throw new Error(
      "[kiaao] No RenderAdapter registered. " +
        "Import from 'kiaao' (auto-registers browser adapter) or call setAdapter() before use.",
    );
  }
  return _adapter;
}

/** 内部使用的 element 移除函数，无 adapter 时静默跳过 */
export function removeNode(node: unknown): void {
  _adapter?.remove(node);
}
