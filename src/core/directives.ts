// kiaao — when/each directive implementations

import { IS_REACTIVE, SKIP_UPDATE, type Getter, type Setter } from "./types.ts";
import { effect, define } from "./runtime.ts";
import { triggerMount, disposeNode } from "./lifecycle.ts";
import { isVoidElement } from "./ssr-helpers.ts";
import { addLocalEffect, removeLocalEffect } from "./local-effect.ts";
import { setProps } from "./props.ts";
import { processChildren } from "./process-children.ts";

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

function renderEach(
  container: HTMLElement,
  eachFn: any,
  childFn: (item: any, index: number, key: any) => any,
  keyFn?: (item: any, index: number, entryKey: any) => any,
): { stop: () => void } {
  const anchor = document.createComment("each");
  container.appendChild(anchor);

  const nodeMap = new Map<any, Node>();
  const itemSignalMap = new Map<any, [Getter<any>, Setter<any>]>();

  const innerStop = effect(() => {
    const source = typeof eachFn === "function" ? eachFn() : eachFn;
    const entries = normalizeEachSource(source);
    const newKeys = new Set<any>();

    for (let i = 0; i < entries.length; i++) {
      const [entryKey, rawValue, index] = entries[i];
      const identity = keyFn ? keyFn(rawValue, index, entryKey) : entryKey;
      newKeys.add(identity);

      let itemGetter: any;
      const isReactive = rawValue != null && (rawValue as any)[IS_REACTIVE];

      if (itemSignalMap.has(identity)) {
        if (isReactive) {
          const existing = itemSignalMap.get(identity)!;
          if (existing[0] !== rawValue) {
            itemSignalMap.set(identity, [rawValue, () => {}]);
          }
          itemGetter = rawValue;
        } else {
          const [, setter] = itemSignalMap.get(identity)!;
          setter(rawValue);
          itemGetter = itemSignalMap.get(identity)![0];
        }
      } else {
        if (isReactive) {
          itemSignalMap.set(identity, [rawValue, () => {}]);
          itemGetter = rawValue;
        } else {
          const [getter, setter] = define(rawValue);
          itemSignalMap.set(identity, [getter, setter]);
          itemGetter = getter;
        }
      }

      if (nodeMap.has(identity)) {
        const node = nodeMap.get(identity)!;
        container.insertBefore(node, anchor);
      } else {
        const node = childFn(itemGetter, index, entryKey);
        if (node instanceof Node) {
          container.insertBefore(node, anchor);
          if (container.isConnected) triggerMount(node);
          nodeMap.set(identity, node);
        }
      }
    }

    for (const [key, node] of nodeMap) {
      if (!newKeys.has(key)) {
        disposeNode(node);
        if (node.parentNode) node.parentNode.removeChild(node);
        nodeMap.delete(key);
      }
    }

    for (const [key] of itemSignalMap) {
      if (!newKeys.has(key)) {
        itemSignalMap.delete(key);
      }
    }
  });

  const selfCleaningStop = () => {
    innerStop();
    removeLocalEffect(container, selfCleaningStop);
  };

  addLocalEffect(container, selfCleaningStop);

  return { stop: selfCleaningStop };
}

// ── Trigger Mount Helper ───────────────────────────────

function triggerMountIfConnected(host: Node, node: Node): void {
  if (host.isConnected) {
    triggerMount(node);
  }
}

// ── createWhenElement ──────────────────────────────────

export function createWhenElement(
  tag: string,
  props: any,
  children: any[],
  whenFn: any,
  eachFn?: any,
  keyFn?: any,
): HTMLElement {
  if (isVoidElement(tag)) {
    throw new Error(`[kiaao] when cannot be used on void element <${tag}>`);
  }

  const el = document.createElement(tag);
  setProps(el, props);

  const isLazy = eachFn === undefined && children.length === 1 && typeof children[0] === "function";
  const hasEach = eachFn !== undefined;

  let eachStop: (() => void) | undefined;

  const stop = effect(() => {
    const show = Boolean(typeof whenFn === "function" ? whenFn() : whenFn);

    if (isLazy) {
      const result = children[0]();
      if (result === SKIP_UPDATE) return;

      if (eachStop) {
        eachStop();
        eachStop = undefined;
      }
      while (el.firstChild) {
        disposeNode(el.firstChild);
        el.removeChild(el.firstChild);
      }
      if (!show) return;
      if (result instanceof Node) {
        el.appendChild(result);
        triggerMountIfConnected(el, result);
      }
      return;
    }

    while (el.firstChild) {
      disposeNode(el.firstChild);
      el.removeChild(el.firstChild);
    }
    if (eachStop) {
      eachStop();
      eachStop = undefined;
    }
    if (!show) return;

    if (hasEach) {
      const childFn = children[0];
      const { stop: estop } = renderEach(el, eachFn, childFn, keyFn);
      eachStop = estop;
    } else {
      const nodes = processChildren(children);
      for (const node of nodes) {
        el.appendChild(node);
        triggerMountIfConnected(el, node);
      }
    }
  });

  addLocalEffect(el, stop);
  return el;
}

// ── createEachElement ──────────────────────────────────

export function createEachElement(
  tag: string,
  props: any,
  children: any[],
  eachFn: any,
  keyFn?: any,
): HTMLElement {
  if (isVoidElement(tag)) {
    throw new Error(`[kiaao] each cannot be used on void element <${tag}>`);
  }

  const el = document.createElement(tag);
  setProps(el, props);

  const childFn = children[0];
  renderEach(el, eachFn, childFn, keyFn);

  return el;
}
