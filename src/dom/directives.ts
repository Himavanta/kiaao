// kiaao v4 — when/each directive implementations (DOM)

import { REACTIVE } from "../reactive/types.ts";
import { isUse, use, toValue } from "../reactive/core.ts";
import { triggerMount, disposeNode } from "./component.ts";
import { isVoidElement, isPlainObject } from "./ssr-helpers.ts";
import { addLocalEffect, removeLocalEffect } from "./local-effect.ts";
import { setProps } from "./props.ts";
import { processChildren } from "./process-children.ts";
import {
  createElement,
  createComment,
  createFragment,
  firstChild,
  prevSibling,
  isConnected,
  nodeType,
} from "./dom-utils.ts";

// ── Data Source Normalization ──────────────────────────

function normalizeEachSource(source: any): Array<[any, any, number]> {
  if (source instanceof Map) {
    return [...source.entries()].map(([k, v], i) => [k, v, i]);
  }
  if (source instanceof Set) {
    return [...source].map((v, i) => [v, v, i]);
  }
  if (typeof source === "number") {
    return Array.from({ length: source }, (_, i) => [String(i), undefined, i]);
  }
  if (typeof source === "string") {
    return Array.from(source).map((v, i) => [String(i), v, i]);
  }
  const entries = Object.entries(source ?? {});
  return entries.map(([k, v], i) => [k, v, i]);
}

// ── Shared Each Renderer ───────────────────────────────

/** 清空元素的所有子节点并返回被移除的 fragment */
function clearChildren(el: Element): DocumentFragment {
  const removed = createFragment();
  let child: Node | null;
  while ((child = firstChild(el))) {
    disposeNode(child);
    removed.append(child);
  }
  return removed;
}

// ── Each Item Signal Sync ──────────────────────────────

/**
 * 获取或创建条目的响应式 item getter。
 * 已有条目更新值，新条目创建信号。
 */
function syncItemSignal(
  itemSignalMap: Map<any, [() => any, (v: any) => void]>,
  identity: any,
  rawValue: any,
): any {
  const isReactive = rawValue != null && isUse(rawValue);

  if (itemSignalMap.has(identity)) {
    if (isReactive) {
      const existing = itemSignalMap.get(identity)!;
      if (existing[0] !== rawValue) {
        itemSignalMap.set(identity, [rawValue, () => {}]);
      }
      return rawValue;
    }
    const [, setter] = itemSignalMap.get(identity)!;
    setter(rawValue);
    return itemSignalMap.get(identity)![0];
  }

  if (isReactive) {
    itemSignalMap.set(identity, [rawValue, () => {}]);
    return rawValue;
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

  for (const [key] of itemSignalMap) {
    if (!newKeys.has(key)) {
      itemSignalMap.delete(key);
    }
  }
}

// ── renderEach ─────────────────────────────────────────

function renderEach(
  container: Element,
  eachFn: (() => any[]) | (() => any),
  childFn: (item: any, index: number, key: any) => any,
  keyFn?: (item: any, index: number, entryKey: any) => any,
): { stop: () => void } {
  const anchor = createComment("each");
  container.append(anchor);

  const nodeMap = new Map<any, Node>();
  const itemSignalMap = new Map<any, [() => any, (v: any) => void]>();

  const sync = () => {
    const source = toValue(eachFn);
    if (process.env.NODE_ENV !== "production") {
      if (source == null) {
        console.warn(new Error("[kiaao] each source is null or undefined."));
      } else if (!Array.isArray(source) && typeof source !== "object") {
        console.warn(new Error("[kiaao] each source should be an array or iterable object."));
      }
    }
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
      if (nodeMap.has(identity)) {
        const node = nodeMap.get(identity)!;
        const needsMove =
          prevNode === null ? firstChild(container) !== node : prevSibling(node) !== prevNode;
        if (needsMove) {
          anchor.before(node);
        }
        prevNode = node;
      } else {
        let node: any;
        try {
          node = childFn(itemGetter, i, entryKey);
        } catch (err) {
          console.error("[kiaao] each item render error:", err);
          continue;
        }
        if (node instanceof Node) {
          anchor.before(node);
          if (isConnected(container)) triggerMount(node);
          if (nodeType(node) !== Node.DOCUMENT_FRAGMENT_NODE) {
            nodeMap.set(identity, node);
          }
          prevNode = node;
        }
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

// ── Trigger Mount Helper ───────────────────────────────

function triggerMountIfConnected(host: Node, node: Node): void {
  if (isConnected(host)) {
    triggerMount(node);
  }
}

// ── When Mode Detection ───────────────────────────────

/**
 * 检测 when 指令的模式：映射表 / 惰性 / 静态
 */
function detectWhenMode(
  children: any[],
  eachFn: any,
): {
  isMappingMode: boolean;
  isLazy: boolean;
  hasEach: boolean;
  mappingTable: Record<string, () => any> | null;
} {
  const isMappingMode = children.length === 1 && isPlainObject(children[0]);
  const mappingTable = isMappingMode ? children[0] : null;
  const isLazy =
    !isMappingMode &&
    eachFn === undefined &&
    children.length === 1 &&
    typeof children[0] === "function" &&
    !isUse(children[0]);
  const hasEach = !isMappingMode && eachFn !== undefined;

  if (isMappingMode && eachFn !== undefined && typeof console !== "undefined") {
    console.warn(`[kiaao] When using mapping table mode, the 'each' prop is ignored.`);
  }

  return { isMappingMode, isLazy, hasEach, mappingTable };
}

// ── When Render Modes ─────────────────────────────────

/** 映射表模式：根据当前 key 渲染对应分支，key 未匹配时回退 else */
function renderWhenMappingMode(
  el: Element,
  mappingTable: Record<string, () => any>,
  showRaw: any,
  elseFn: (() => any) | undefined,
): void {
  const branchFn = mappingTable[showRaw];
  if (branchFn) {
    const node = branchFn();
    if (node instanceof Node) {
      el.append(node);
      triggerMountIfConnected(el, node);
    }
  } else if (elseFn) {
    const node = elseFn();
    if (node instanceof Node) {
      el.append(node);
      triggerMountIfConnected(el, node);
    }
  }
}

/** 惰性模式：条件为真时调用子函数渲染，否则渲染 else */
function renderWhenLazyMode(
  el: Element,
  childFn: () => any,
  show: boolean,
  elseFn: (() => any) | undefined,
): void {
  if (!show) {
    if (elseFn) {
      const node = elseFn();
      if (node instanceof Node) {
        el.append(node);
        triggerMountIfConnected(el, node);
      }
    }
    return;
  }
  const result = childFn();
  if (result instanceof Node) {
    el.append(result);
    triggerMountIfConnected(el, result);
  }
}

/** 静态模式：非惰性路径，支持 hasEach 和普通子节点 */
function renderWhenStaticMode(
  el: Element,
  children: any[],
  show: boolean,
  elseFn: (() => any) | undefined,
  eachFn: any,
  keyFn: any,
  hasEach: boolean,
): { eachStop: (() => void) | undefined } {
  if (!show) {
    if (elseFn) {
      const node = elseFn();
      if (node instanceof Node) {
        el.append(node);
        triggerMountIfConnected(el, node);
      }
    }
    return { eachStop: undefined };
  }

  if (hasEach) {
    const childFn = children[0];
    const { stop: estop } = renderEach(el, eachFn, childFn, keyFn);
    return { eachStop: estop };
  }

  const nodes = processChildren(children);
  for (const node of nodes) {
    el.append(node);
    triggerMountIfConnected(el, node);
  }
  return { eachStop: undefined };
}

/**
 * 订阅 whenFn 信号变化，每次变化时执行 renderBranch。
 * 非信号时只执行一次初始渲染。
 */
function subscribeWhen(
  whenFn: any,
  renderBranch: () => void,
): { whenStop: (() => void) | undefined } {
  if (isUse(whenFn)) {
    const [derived] = use(whenFn, () => {
      renderBranch();
    });
    return { whenStop: (derived as any)[REACTIVE].stop };
  }
  renderBranch();
  return { whenStop: undefined };
}

// ── createWhenElement ──────────────────────────────────

export function createWhenElement(options: {
  tag: string;
  props: any;
  children: any[];
  whenFn: any;
  eachFn?: any;
  keyFn?: any;
  elseFn?: () => any;
}): Element {
  const { tag, props, children, whenFn, eachFn, keyFn, elseFn } = options;

  if (isVoidElement(tag)) {
    throw new Error(`[kiaao] when cannot be used on void element <${tag}>`);
  }

  const el = createElement(tag);
  setProps(el, props);

  // 检测模式
  const { isMappingMode, isLazy, hasEach, mappingTable } = detectWhenMode(children, eachFn);

  let prevKey: any = undefined;
  let eachStop: (() => void) | undefined;

  // 渲染分支，由派生回调调用
  const renderBranch = () => {
    const showRaw = toValue(whenFn);
    const show = Boolean(showRaw);

    // 映射表模式
    if (isMappingMode) {
      if (showRaw === prevKey) return;
      prevKey = showRaw;
      clearChildren(el);
      renderWhenMappingMode(el, mappingTable!, showRaw, elseFn);
      return;
    }

    clearChildren(el);

    // 停止上一次的 each
    if (eachStop) {
      eachStop();
      eachStop = undefined;
    }

    // 惰性模式
    if (isLazy) {
      renderWhenLazyMode(el, children[0], show, elseFn);
      return;
    }

    // 静态模式
    const result = renderWhenStaticMode(el, children, show, elseFn, eachFn, keyFn, hasEach);
    eachStop = result.eachStop;
  };

  // 订阅 whenFn 变化或执行初始渲染
  const { whenStop } = subscribeWhen(whenFn, renderBranch);

  const selfCleaningStop = () => {
    if (whenStop) whenStop();
    if (eachStop) eachStop();
    removeLocalEffect(el, selfCleaningStop);
  };

  addLocalEffect(el, selfCleaningStop);

  return el;
}

// ── createEachElement ──────────────────────────────────

export function createEachElement(
  tag: string,
  props: any,
  children: any[],
  eachFn: (() => any[]) | (() => any),
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
