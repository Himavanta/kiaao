// kiaao — when/each directives with Owner-based cleanup
// Replaces src/dom/when.ts and src/dom/each.ts.
// Internal cleanup uses disposeOwner instead of DOM tree traversal.

import { use, toValue, isUse } from "./signal.ts";
import { getSignalState } from "./types.ts";
import { createOwner, disposeOwner } from "./owner.ts";
import { getAdapter } from "./types.ts";
import { setProps } from "../dom/props.ts";
import { processChildren } from "./process-children.ts";
import {
  isFunction,
  isNode,
  isSingle,
  isUndefined,
  isArray,
  isPlainObject,
} from "../utils/type-guards.ts";
import { isHResult } from "./types.ts";

// ── Helper: append result to element ────────────────

function appendResult(el: Element, result: any, owner: any): void {
  if (isHResult(result)) {
    if (result.owner) {
      owner.children.push(result.owner);
      result.owner.parent = owner;
    }
    for (const node of result.nodes) {
      if (isNode(node)) {
        el.append(node);
        owner.elements.add(node);
      }
    }
    return;
  }
  if (isNode(result)) {
    el.append(result);
    owner.elements.add(result);
  } else if (isArray(result)) {
    for (const node of result) {
      if (isNode(node)) {
        el.append(node);
        owner.elements.add(node);
      }
    }
  }
}

// ── Mapping Table Detection ───────────────────────────

function isMappingTable(v: any): boolean {
  return isPlainObject(v) && !isHResult(v);
}

// ── When: Detect Mode ────────────────────────────────

function detectWhenMode(children: any[], eachFn: any) {
  const isMapping = isSingle(children) && isMappingTable(children[0]);
  const mappingTable = isMapping ? children[0] : null;
  const isLazy = !isMapping && isUndefined(eachFn) && isSingle(children) && isFunction(children[0]);
  const hasEach = !isMapping && !isUndefined(eachFn);
  return { isMappingMode: isMapping, isLazy, hasEach, mappingTable };
}

// ── When: clear element children ─────────────────────

function clearElement(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ── When: render by mode ────────────────────────────

function renderMappingMode(options: {
  el: Element;
  mappingTable: Record<string, () => any>;
  showRaw: any;
  elseFn: (() => any) | undefined;
  owner: any;
}): void {
  const { el, mappingTable, showRaw, elseFn, owner } = options;
  const branchFn = mappingTable[showRaw];
  if (branchFn) appendResult(el, branchFn(), owner);
  else if (elseFn) appendResult(el, elseFn(), owner);
}

function renderLazyMode(options: {
  el: Element;
  childFn: () => any;
  show: boolean;
  elseFn: (() => any) | undefined;
  owner: any;
}): void {
  const { el, childFn, show, elseFn, owner } = options;
  if (show) appendResult(el, childFn(), owner);
  else if (elseFn) appendResult(el, elseFn(), owner);
}

function renderEachMode(options: {
  el: Element;
  eachFn: unknown;
  childFn: any;
  keyFn: unknown;
  owner: any;
}): void {
  const { el, eachFn, childFn, keyFn, owner } = options;
  const { nodes } = renderEachOnElement({
    container: el,
    eachFn,
    childFn,
    keyFn,
    cleanups: owner ? owner.cleanups : undefined,
  });
  for (const n of nodes) if (isNode(n)) owner.elements.add(n);
}

function renderStaticMode(options: {
  el: Element;
  children: any[];
  show: boolean;
  elseFn: (() => any) | undefined;
  owner: any;
}): void {
  const { el, children, show, elseFn, owner } = options;
  if (!show) {
    if (elseFn) appendResult(el, elseFn(), owner);
    return;
  }
  const { nodes, cleanups } = processChildren(children);
  for (const node of nodes) {
    el.append(node);
    owner.elements.add(node);
  }
  owner.cleanups.push(...cleanups);
}

/** 订阅 whenFn 变化，非信号时立即执行一次初始渲染 */
function subscribeWhenFn(
  whenFn: unknown,
  renderBranch: () => void,
  cleanups: (() => void)[],
): void {
  if (isUse(whenFn)) {
    const derived = use(whenFn, () => renderBranch());
    const stop = getSignalState(derived)?.stop;
    if (stop) cleanups.push(stop);
  } else {
    renderBranch();
  }
}

// ── createWhenElement ─────────────────────────────────

export function createWhenElement(options: {
  tag: string;
  props: any;
  children: any[];
  whenFn: unknown;
  eachFn?: unknown;
  keyFn?: unknown;
  elseFn?: () => any;
  cleanups?: (() => void)[];
}): Element {
  const { tag, props, children, whenFn, eachFn, keyFn, elseFn, cleanups } = options;
  const adapter = getAdapter();
  const el = adapter.createElement(tag) as Element;

  setProps(el, props, cleanups);

  const { isMappingMode, isLazy, hasEach, mappingTable } = detectWhenMode(children, eachFn);
  let prevKey: any;
  let branchOwner: any;

  const renderBranch = () => {
    const showRaw = toValue(whenFn);
    const show = Boolean(showRaw);
    if (isMappingMode) {
      if (showRaw === prevKey) return;
      prevKey = showRaw;
    }
    if (branchOwner) {
      disposeOwner(branchOwner);
      branchOwner = null;
    }
    clearElement(el);

    branchOwner = createOwner();

    if (isMappingMode && mappingTable) {
      renderMappingMode({ el, mappingTable, showRaw, elseFn, owner: branchOwner });
    } else if (isLazy) {
      renderLazyMode({ el, childFn: children[0], show, elseFn, owner: branchOwner });
    } else if (hasEach) {
      renderEachMode({ el, eachFn: eachFn!, childFn: children[0], keyFn, owner: branchOwner });
    } else {
      renderStaticMode({ el, children, show, elseFn, owner: branchOwner });
    }
  };

  subscribeWhenFn(whenFn, renderBranch, cleanups || []);

  // 在父 Owner dispose 时，同时清理当前分支的 Owner
  if (cleanups) {
    const ownCleanup = () => {
      if (branchOwner) disposeOwner(branchOwner);
    };
    cleanups.push(ownCleanup);
  }

  return el;
} // ── Each: helpers ──────────────────────────────────

/** 创建条目的 DOM 节点，处理 HResult/Node/Array 三种返回类型 */
function createItemDOMNodes(options: {
  itemSignal: any;
  index: number;
  childFn: any;
  itemOwner: any;
  anchor: any;
  nodes: Node[];
}): Node[] {
  const { itemSignal, index: i, childFn, itemOwner, anchor, nodes } = options;
  let node: any;
  try {
    node = childFn(itemSignal, i);
  } catch (err) {
    console.error("[kiaao] each item render error:", err);
    return [];
  }

  const newNodes: Node[] = [];
  const addNode = (n: Node) => {
    itemOwner.elements.add(n);
    anchor.before(n);
    newNodes.push(n);
    nodes.push(n);
  };

  if (isHResult(node)) {
    if (node.owner) {
      itemOwner.children.push(node.owner);
      node.owner.parent = itemOwner;
    }
    for (const n of node.nodes) if (isNode(n)) addNode(n);
  } else if (isNode(node)) {
    addNode(node);
  } else if (isArray(node)) {
    for (const n of node) if (isNode(n)) addNode(n);
  }
  return newNodes;
}

/** 检查 identity 匹配的节点组是否需要重排，需要则移动到 anchor 前 */
function repositionItemGroup(options: {
  container: Element;
  anchor: any;
  existingNodes: Node[];
  prevNode: Node | null;
}): Node | null {
  const { container, anchor, existingNodes, prevNode } = options;
  if (!existingNodes.length) return prevNode;
  const firstNode = existingNodes[0];
  const needsMove =
    prevNode === null
      ? container.firstChild !== firstNode && container.firstChild !== anchor
      : firstNode.previousSibling !== prevNode;
  if (needsMove) {
    for (const n of [...existingNodes].reverse()) {
      anchor.before(n);
    }
  }
  return existingNodes[existingNodes.length - 1] || prevNode;
}

/** 获取或创建条目信号 */
function getOrCreateSignal(itemSignalMap: Map<any, any>, identity: any, rawValue: unknown): any {
  if (itemSignalMap.has(identity)) {
    itemSignalMap.get(identity)!(rawValue);
  } else {
    itemSignalMap.set(identity, use(rawValue));
  }
  return itemSignalMap.get(identity)!;
}

/** 获取或创建条目 Owner */
function getOrCreateOwner(itemOwners: Map<any, any>, identity: any): any {
  let owner = itemOwners.get(identity);
  if (!owner) {
    owner = createOwner();
    itemOwners.set(identity, owner);
  }
  return owner;
}

/** 清理已移除条目的 Owner 和信号 */
function disposeRemovedItems(options: {
  currentKeys: Set<any>;
  newKeys: Set<any>;
  itemOwners: Map<any, any>;
  itemSignalMap: Map<any, any>;
  itemNodeMap: Map<any, Node[]>;
}): void {
  const { currentKeys, newKeys, itemOwners, itemSignalMap, itemNodeMap } = options;
  for (const key of currentKeys) {
    if (newKeys.has(key)) continue;
    const owner = itemOwners.get(key);
    if (owner) {
      disposeOwner(owner);
      itemOwners.delete(key);
    }
    const sig = itemSignalMap.get(key);
    if (sig) {
      const stop = getSignalState(sig)?.stop;
      if (isFunction(stop)) stop();
      itemSignalMap.delete(key);
    }
    itemNodeMap.delete(key);
  }
}

// ── renderEachOnElement ──────────────────────────────

function renderEachOnElement(options: {
  container: Element;
  eachFn: any;
  childFn: any;
  keyFn?: any;
  cleanups?: (() => void)[];
}) {
  const { container, eachFn, childFn, keyFn, cleanups } = options;
  const adapter = getAdapter();
  const anchor = adapter.createComment("each") as Comment;
  container.append(anchor);
  const nodes: Node[] = [];
  const itemOwners: Map<any, any> = new Map();
  const itemSignalMap: Map<any, any> = new Map();
  const itemNodeMap: Map<any, Node[]> = new Map();

  const sync = () => {
    const source = toValue(eachFn);
    const items = isArray(source) ? source : [];
    const newKeys = new Set<any>();
    const currentKeys = new Set(itemOwners.keys());
    let prevNode: Node | null = null;

    for (const [i, rawValue] of items.entries()) {
      const identity = keyFn ? keyFn(rawValue, i) : i;
      newKeys.add(identity);
      const itemSignal = getOrCreateSignal(itemSignalMap, identity, rawValue);
      const itemOwner = getOrCreateOwner(itemOwners, identity);

      if (itemNodeMap.has(identity)) {
        prevNode = repositionItemGroup({
          container,
          anchor,
          existingNodes: itemNodeMap.get(identity)!,
          prevNode,
        });
      } else {
        const newItemNodes = createItemDOMNodes({
          itemSignal,
          index: i,
          childFn,
          itemOwner,
          anchor,
          nodes,
        });
        itemNodeMap.set(identity, newItemNodes);
        prevNode = newItemNodes[newItemNodes.length - 1] || prevNode;
      }
    }
    disposeRemovedItems({
      currentKeys,
      newKeys,
      itemOwners,
      itemSignalMap,
      itemNodeMap,
    });
  };

  if (isUse(eachFn)) {
    const derived = use(eachFn, () => sync());
    const eachStop = getSignalState(derived)?.stop;
    if (cleanups)
      cleanups.push(() => {
        if (eachStop) eachStop();
        cleanupEachMaps(itemOwners, itemSignalMap, itemNodeMap);
      });
  } else {
    sync();
    if (cleanups)
      cleanups.push(() => {
        cleanupEachMaps(itemOwners, itemSignalMap, itemNodeMap);
      });
  }

  return { nodes };
}

function cleanupEachMaps(
  itemOwners: Map<any, any>,
  itemSignalMap: Map<any, any>,
  itemNodeMap: Map<any, Node[]>,
): void {
  for (const [, owner] of itemOwners) disposeOwner(owner);
  itemOwners.clear();
  itemSignalMap.clear();
  itemNodeMap.clear();
}

// ── createEachElement ─────────────────────────────────

export function createEachElement(options: {
  tag: string;
  props: any;
  children: any[];
  eachFn: any;
  keyFn?: any;
  cleanups?: (() => void)[];
}): Element {
  const { tag, props, children, eachFn, keyFn, cleanups } = options;
  const adapter = getAdapter();
  const el = adapter.createElement(tag) as Element;
  setProps(el, props, cleanups);
  const childFn = children[0];
  renderEachOnElement({ container: el, eachFn, childFn, keyFn, cleanups });
  return el;
}
