// kiaao — when/each directives with Owner-based cleanup
// Replaces src/dom/when.ts and src/dom/each.ts.
// Internal cleanup uses disposeOwner instead of DOM tree traversal.

import { use, toValue, isUse } from "./signal.ts";
import { REACTIVE } from "./types.ts";
import { createOwner, disposeOwner, currentOwner } from "./owner.ts";
import { getAdapter } from "./types.ts";
import { setProps } from "../dom/props.ts";
import { processChildren } from "./process-children.ts";
import { isFunction, isNode, isSingle, isUndefined, isArray } from "../utils/type-guards.ts";
import { isMappingTable, isVoidElement } from "../dom/ssr-helpers.ts";

// ── Helper: append result to element ────────────────

function appendResult(el: Element, result: any, owner: any): void {
  if (isNode(result)) {
    el.append(result);
    owner.elements.add(result);
  } else if (Array.isArray(result)) {
    for (const node of result) {
      if (isNode(node)) {
        el.append(node);
        owner.elements.add(node);
      }
    }
  }
}

// ── When: Detect Mode ────────────────────────────────

function detectWhenMode(children: any[], eachFn: any) {
  const isMapping = isSingle(children) && isMappingTable(children[0]);
  const mappingTable = isMapping ? children[0] : null;
  const isLazy = !isMapping && isUndefined(eachFn) && isSingle(children) && isFunction(children[0]);
  const hasEach = !isMapping && !isUndefined(eachFn);
  return { isMappingMode: isMapping, isLazy, hasEach, mappingTable };
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
}): Element {
  const { tag, props, children, whenFn, eachFn, keyFn, elseFn } = options;
  if (isVoidElement(tag)) {
    throw new Error(`[kiaao] when cannot be used on void element <${tag}>`);
  }

  const adapter = getAdapter();
  const el = adapter.createElement(tag) as Element;
  setProps(el, props);

  // Container Owner: owns the when element and its lifecycle
  const containerOwner = createOwner();
  const parentOwner = currentOwner.get();
  if (parentOwner) {
    parentOwner.children.push(containerOwner);
    containerOwner.parent = parentOwner;
  }
  containerOwner.elements.add(el);

  const { isMappingMode, isLazy, hasEach, mappingTable } = detectWhenMode(children, eachFn);

  let prevKey: any = undefined;
  let branchOwner: any = null;

  const renderBranch = () => {
    const showRaw = toValue(whenFn);
    const show = Boolean(showRaw);

    if (isMappingMode) {
      if (showRaw === prevKey) return;
      prevKey = showRaw;
    }

    // Dispose previous branch
    if (branchOwner) {
      disposeOwner(branchOwner);
      branchOwner = null;
    }

    // Clear DOM children
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }

    // Create new branch Owner
    branchOwner = createOwner();
    branchOwner.parent = containerOwner;
    containerOwner.children.push(branchOwner);

    // Set currentOwner so processChildren/setProps register to branchOwner
    const prev = currentOwner.get();
    currentOwner.set(branchOwner);

    try {
      if (isMappingMode && mappingTable) {
        const branchFn = mappingTable[showRaw];
        if (branchFn) {
          appendResult(el, branchFn(), branchOwner);
        } else if (elseFn) {
          appendResult(el, elseFn(), branchOwner);
        }
      } else if (isLazy) {
        if (show) {
          appendResult(el, children[0](), branchOwner);
        } else if (elseFn) {
          appendResult(el, elseFn(), branchOwner);
        }
      } else if (hasEach) {
        const childFn = children[0];
        if (show) {
          const { nodes } = renderEachOnElement(el, eachFn!, childFn, keyFn);
          for (const n of nodes) {
            if (isNode(n)) branchOwner.elements.add(n);
          }
        } else if (elseFn) {
          appendResult(el, elseFn(), branchOwner);
        }
      } else {
        // Static mode
        if (show) {
          const nodes = processChildren(children);
          for (const node of nodes) {
            el.append(node);
            branchOwner.elements.add(node);
          }
        } else if (elseFn) {
          appendResult(el, elseFn(), branchOwner);
        }
      }
    } finally {
      currentOwner.set(prev);
    }
  };

  // Subscribe to when signal
  if (isUse(whenFn)) {
    const [derived] = use(whenFn, () => {
      renderBranch();
    });
    const stop = (derived as any)[REACTIVE]?.stop;
    if (stop) containerOwner.cleanups.push(stop);
  } else {
    renderBranch();
  }

  return el;
}

// ── renderEachOnElement ──────────────────────────────

function renderEachOnElement(
  container: Element,
  eachFn: any,
  childFn: any,
  keyFn?: any,
): { nodes: Node[]; stop: () => void } {
  const adapter = getAdapter();
  const anchor = adapter.createComment("each") as Comment;
  container.append(anchor);

  const nodes: Node[] = [];
  const itemOwners: Map<any, any> = new Map();
  const itemSignalMap: Map<any, [() => any, (v: any) => void]> = new Map();

  const containerOwner = currentOwner.get();

  const sync = () => {
    // 清除旧条目节点（保留锚点）
    while (anchor.previousSibling) {
      const child = anchor.previousSibling;
      container.removeChild(child);
    }
    const source = toValue(eachFn);
    const items = isArray(source) ? source : [];
    const newKeys = new Set<any>();
    const currentKeys = new Set(itemOwners.keys());

    let prevNode: Node | null = null;

    for (let i = 0; i < items.length; i++) {
      const rawValue = items[i];
      const identity = keyFn ? keyFn(rawValue, i) : i;
      newKeys.add(identity);

      // Sync signal
      if (itemSignalMap.has(identity)) {
        const [, setter] = itemSignalMap.get(identity)!;
        if (!isUse(rawValue)) setter(rawValue);
      } else {
        const [getter, setter] = use(rawValue);
        itemSignalMap.set(identity, [getter, setter]);
      }

      const itemGetter = itemSignalMap.get(identity)![0];

      // Reuse or create Owner
      let itemOwner = itemOwners.get(identity);
      if (!itemOwner) {
        itemOwner = createOwner();
        itemOwner.parent = containerOwner;
        if (containerOwner) containerOwner.children.push(itemOwner);
        itemOwners.set(identity, itemOwner);
      }

      // Render item
      currentOwner.set(itemOwner);
      let node: any;
      try {
        node = childFn(itemGetter, i);
      } catch (err) {
        console.error("[kiaao] each item render error:", err);
        currentOwner.set(null);
        continue;
      }
      currentOwner.set(null);

      if (isNode(node)) {
        itemOwner.elements.add(node);
        anchor.before(node);
        if (prevNode === null && container.firstChild !== node) {
          // Move to correct position
        } else if (prevNode !== null && (node as any).previousSibling !== prevNode) {
          anchor.before(node);
        }
        nodes.push(node);
        prevNode = node;
      } else if (Array.isArray(node)) {
        for (const n of node) {
          if (isNode(n)) {
            itemOwner.elements.add(n);
            anchor.before(n);
            nodes.push(n);
            prevNode = n;
          }
        }
      }
    }

    // Cleanup removed items
    for (const key of currentKeys) {
      if (!newKeys.has(key)) {
        const owner = itemOwners.get(key);
        if (owner) {
          disposeOwner(owner);
          itemOwners.delete(key);
        }
        const sig = itemSignalMap.get(key);
        if (sig) {
          const stop = (sig[0] as any)[REACTIVE]?.stop;
          if (isFunction(stop)) stop();
          itemSignalMap.delete(key);
        }
      }
    }
  };

  // Subscribe to each signal
  let eachStop: (() => void) | undefined;
  if (isUse(eachFn)) {
    const [derived] = use(eachFn, () => sync());
    eachStop = (derived as any)[REACTIVE]?.stop;
  } else {
    sync();
  }

  const stop = () => {
    if (eachStop) eachStop();
    for (const [, owner] of itemOwners) {
      disposeOwner(owner);
    }
    itemOwners.clear();
    itemSignalMap.clear();
    if (containerOwner) {
      const idx = containerOwner.cleanups.indexOf(stop);
      if (idx !== -1) containerOwner.cleanups.splice(idx, 1);
    }
  };

  if (containerOwner) containerOwner.cleanups.push(stop);

  return { nodes, stop };
}

// ── createEachElement (external entry) ─────────────────

export function createEachElement(
  tag: string,
  props: any,
  children: any[],
  eachFn: any,
  keyFn?: any,
): Element {
  if (isVoidElement(tag)) {
    throw new Error(`[kiaao] each cannot be used on void element <${tag}>`);
  }

  const adapter = getAdapter();
  const el = adapter.createElement(tag) as Element;
  setProps(el, props);

  const childFn = children[0];
  currentOwner.set(null);
  renderEachOnElement(el, eachFn, childFn, keyFn);

  return el;
}
