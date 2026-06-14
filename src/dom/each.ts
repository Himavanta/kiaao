import { isArray, isFunction, isNode, isNotNil } from "../utils/type-guards.ts";
// kiaao — each directive implementation (DOM)

import { REACTIVE } from "../reactive/types.ts";
import { isUse, use, toValue } from "../reactive/core.ts";
import { triggerMount, disposeNode } from "./component.ts";
import { addLocalEffect, removeLocalEffect } from "./local-effect.ts";
import { setProps } from "./props.ts";
import {
  createElement,
  createComment,
  createFragment,
  firstChild,
  prevSibling,
  isConnected,
  nodeType,
} from "./dom-utils.ts";
import { isVoidElement } from "./ssr-helpers.ts";

// ── Data Source Normalization ──────────────────────────

/** 将数组源标准化为条目列表，每个条目为 (index, value) */
export function normalizeEachSource(source: unknown): Array<[any, any]> {
  if (isArray(source)) {
    return source.map((v: any, i: number) => [i, v] as [any, any]);
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[kiaao] each source must be an array. Received: ${typeof source}. ` +
        "Pass a signal that resolves to an array, or use Array.from() for other types.",
    );
  }
  return [];
}

// ── Each Item Signal Sync ──────────────────────────────

/**
 * 获取或创建条目的响应式 item getter。
 * 已有条目更新值，新条目创建信号。
 */
function syncItemSignal(
  itemSignalMap: Map<any, [() => any, (v: any) => void]>,
  identity: any,
  rawValue: unknown,
): () => unknown {
  const isReactive = isNotNil(rawValue) && isUse(rawValue);

  if (itemSignalMap.has(identity)) {
    if (isReactive) {
      const getter = rawValue as () => any;
      const existing = itemSignalMap.get(identity)!;
      if (existing[0] !== getter) {
        itemSignalMap.set(identity, [getter, () => {}]);
      }
      return getter;
    }
    const [, setter] = itemSignalMap.get(identity)!;
    setter(rawValue);
    return itemSignalMap.get(identity)![0];
  }

  if (isReactive) {
    const getter = rawValue as () => any;
    itemSignalMap.set(identity, [getter, () => {}]);
    return getter;
  }
  const [getter, setter] = use(rawValue);
  itemSignalMap.set(identity, [getter, setter]);
  return getter;
}

/**
 * 批量清理已消失条目对应的 DOM 节点和信号。
 */
function syncCleanupRemoved(
  nodeMap: Map<any, Node>,
  itemSignalMap: Map<any, [() => any, (v: any) => void]>,
  newKeys: Set<any>,
): void {
  const removedFragment = createFragment();
  for (const [key, node] of nodeMap) {
    if (!newKeys.has(key)) {
      disposeNode(node);
      removedFragment.append(node);
      nodeMap.delete(key);
    }
  }

  for (const [key, [getter]] of itemSignalMap) {
    if (!newKeys.has(key)) {
      const stop = (getter as any)[REACTIVE]?.stop;
      if (isFunction(stop)) stop();
      itemSignalMap.delete(key);
    }
  }
}

/**
 * 复用或创建条目的 DOM 节点。返回更新后的 prevNode。
 */
function syncItemDOM(
  nodeMap: Map<any, Node>,
  container: Element,
  anchor: Comment,
  identity: any,
  childFn: (item: () => unknown, index: number, key: any) => any,
  itemGetter: () => unknown,
  i: number,
  entryKey: any,
  prevNode: Node | null,
): Node | null {
  // 复用已有节点
  if (nodeMap.has(identity)) {
    const node = nodeMap.get(identity)!;
    const needsMove =
      prevNode === null ? firstChild(container) !== node : prevSibling(node) !== prevNode;
    if (needsMove) {
      anchor.before(node);
    }
    return node;
  }

  // 创建新节点
  let node: unknown;
  try {
    node = childFn(itemGetter, i, entryKey);
  } catch (err) {
    console.error("[kiaao] each item render error:", err);
    return prevNode;
  }
  if (isNode(node)) {
    anchor.before(node);
    if (isConnected(container)) triggerMount(node);
    if (nodeType(node) !== Node.DOCUMENT_FRAGMENT_NODE) {
      nodeMap.set(identity, node);
    }
    return node;
  }
  return prevNode;
}

// ── renderEach ─────────────────────────────────────────

/** @internal 被 when.ts 和 createEachElement 调用 */
export function renderEach(
  container: Element,
  /** 数据源：可以是信号 getter（响应式）或普通函数/数组 */
  eachFn: (() => unknown) | (() => unknown[]),
  /** item 是 each 框架创建的信号 getter，每次渲染传入当前值 */
  childFn: (item: () => unknown, index: number, key: any) => any,
  keyFn?: (item: any, index: number, entryKey: any) => any,
): { stop: () => void } {
  const anchor = createComment("each");
  container.append(anchor);

  const nodeMap = new Map<any, Node>();
  const itemSignalMap = new Map<any, [() => any, (v: any) => void]>();

  const sync = () => {
    const source = toValue(eachFn);
    const entries = normalizeEachSource(source);
    const newKeys = new Set<any>();

    let prevNode: Node | null = null;

    for (let i = 0; i < entries.length; i++) {
      const [entryKey, rawValue] = entries[i];
      const identity = keyFn ? keyFn(rawValue, i, entryKey) : entryKey;
      newKeys.add(identity);

      // 获取或创建响应式 item getter
      const itemGetter = syncItemSignal(itemSignalMap, identity, rawValue);

      // 复用或创建 DOM
      const newPrev = syncItemDOM(
        nodeMap,
        container,
        anchor,
        identity,
        childFn,
        itemGetter,
        i,
        entryKey,
        prevNode,
      );
      if (newPrev !== prevNode) {
        prevNode = newPrev;
      }
    }

    // 批量清理消失的节点
    syncCleanupRemoved(nodeMap, itemSignalMap, newKeys);
  };

  // 订阅 eachFn 变化（如果 eachFn 是信号）
  let eachStop: (() => void) | undefined;

  if (isUse(eachFn)) {
    const [derived] = use(eachFn as any, () => {
      sync();
    });
    eachStop = (derived as any)[REACTIVE].stop;
  }

  // 初始渲染
  sync();

  const selfCleaningStop = () => {
    if (eachStop) eachStop();
    removeLocalEffect(container, selfCleaningStop);
  };

  addLocalEffect(container, selfCleaningStop);

  return { stop: selfCleaningStop };
}

// ── createEachElement ──────────────────────────────────

export function createEachElement(
  tag: string,
  props: any,
  children: any[],
  eachFn: (() => unknown[]) | (() => unknown),
  keyFn?: (item: any, index: number, entryKey: any) => any,
): Element {
  if (isVoidElement(tag)) {
    throw new Error(`[kiaao] each cannot be used on void element <${tag}>`);
  }

  const el = createElement(tag);
  setProps(el, props);

  const childFn = children[0];
  renderEach(el, eachFn, childFn, keyFn);

  return el;
}
