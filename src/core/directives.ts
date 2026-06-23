// kiaao — when/each directives with Owner-based cleanup
// Replaces src/dom/when.ts and src/dom/each.ts.
// Internal cleanup uses disposeOwner instead of DOM tree traversal.

import { use, toValue, isUse } from "./signal.ts";
import { REACTIVE } from "./types.ts";
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
    // 提取子 Owner 并建立父子关系
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
  const adapter = getAdapter();
  const el = adapter.createElement(tag) as Element;

  const containerOwner = createOwner();
  containerOwner.elements.add(el);
  setProps(el, props, containerOwner.cleanups);

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
    if (branchOwner) {
      disposeOwner(branchOwner);
      branchOwner = null;
    }
    while (el.firstChild) el.removeChild(el.firstChild);

    branchOwner = createOwner();
    branchOwner.parent = containerOwner;
    containerOwner.children.push(branchOwner);

    try {
      if (isMappingMode && mappingTable) {
        const branchFn = mappingTable[showRaw];
        if (branchFn) appendResult(el, branchFn(), branchOwner);
        else if (elseFn) appendResult(el, elseFn(), branchOwner);
      } else if (isLazy) {
        if (show) appendResult(el, children[0](), branchOwner);
        else if (elseFn) appendResult(el, elseFn(), branchOwner);
      } else if (hasEach) {
        const childFn = children[0];
        if (show) {
          const { nodes } = renderEachOnElement(el, eachFn!, childFn, keyFn);
          for (const n of nodes) if (isNode(n)) branchOwner.elements.add(n);
        } else if (elseFn) appendResult(el, elseFn(), branchOwner);
      } else {
        if (show) {
          const { nodes, cleanups } = processChildren(children);
          for (const node of nodes) {
            el.append(node);
            branchOwner.elements.add(node);
          }
          branchOwner.cleanups.push(...cleanups);
        } else if (elseFn) appendResult(el, elseFn(), branchOwner);
      }
    } finally {
    }
  };

  if (isUse(whenFn)) {
    const [derived] = use(whenFn, () => renderBranch());
    const stop = (derived as any)[REACTIVE]?.stop;
    if (stop) containerOwner.cleanups.push(stop);
  } else {
    renderBranch();
  }

  return el;
}

// ── renderEachOnElement ──────────────────────────────

function renderEachOnElement(container: Element, eachFn: any, childFn: any, keyFn?: any) {
  const adapter = getAdapter();
  const anchor = adapter.createComment("each") as Comment;
  container.append(anchor);
  const nodes: Node[] = [];
  const itemOwners: Map<any, any> = new Map();
  const itemSignalMap: Map<any, [() => any, (v: any) => void]> = new Map();
  const containerOwner = createOwner();

  const sync = () => {
    while (anchor.previousSibling) container.removeChild(anchor.previousSibling);
    const source = toValue(eachFn);
    const items = isArray(source) ? source : [];
    const newKeys = new Set<any>();
    const currentKeys = new Set(itemOwners.keys());

    for (let i = 0; i < items.length; i++) {
      const rawValue = items[i];
      const identity = keyFn ? keyFn(rawValue, i) : i;
      newKeys.add(identity);

      if (itemSignalMap.has(identity)) {
        const [, setter] = itemSignalMap.get(identity)!;
        if (!isUse(rawValue)) setter(rawValue);
      } else {
        const [getter, setter] = use(rawValue);
        itemSignalMap.set(identity, [getter, setter]);
      }
      const itemGetter = itemSignalMap.get(identity)![0];

      let itemOwner = itemOwners.get(identity);
      if (!itemOwner) {
        itemOwner = createOwner();
        itemOwner.parent = containerOwner;
        containerOwner.children.push(itemOwner);
        itemOwners.set(identity, itemOwner);
      }

      let node: any;
      try {
        node = childFn(itemGetter, i);
      } catch (err) {
        console.error("[kiaao] each item render error:", err);
        continue;
      }

      if (isHResult(node)) {
        // 提取子 Owner 并建立父子关系
        if (node.owner) {
          itemOwner.children.push(node.owner);
          node.owner.parent = itemOwner;
        }
        for (const n of node.nodes) {
          if (isNode(n)) {
            itemOwner.elements.add(n);
            anchor.before(n);
            nodes.push(n);
          }
        }
      } else if (isNode(node)) {
        itemOwner.elements.add(node);
        anchor.before(node);
        nodes.push(node);
      } else if (isArray(node)) {
        for (const n of node) {
          if (isNode(n)) {
            itemOwner.elements.add(n);
            anchor.before(n);
            nodes.push(n);
          }
        }
      }
    }

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
  };
  if (containerOwner) containerOwner.cleanups.push(stop);

  return { nodes, stop };
}

// ── createEachElement ─────────────────────────────────

export function createEachElement(
  tag: string,
  props: any,
  children: any[],
  eachFn: any,
  keyFn?: any,
): Element {
  const adapter = getAdapter();
  const el = adapter.createElement(tag) as Element;
  setProps(el, props);
  const childFn = children[0];
  renderEachOnElement(el, eachFn, childFn, keyFn);
  return el;
}
