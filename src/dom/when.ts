// kiaao v4 — when directive implementation (DOM)

import { REACTIVE } from "../reactive/types.ts";
import { isUse, use, toValue } from "../reactive/core.ts";
import { triggerMount, disposeNode } from "./component.ts";
import { isVoidElement, isPlainObject } from "./ssr-helpers.ts";
import { addLocalEffect, removeLocalEffect } from "./local-effect.ts";
import { setProps } from "./props.ts";
import { processChildren } from "./process-children.ts";
import { renderEach } from "./each.ts";
import { createElement, createFragment, firstChild, isConnected } from "./dom-utils.ts";

// ── Trigger Mount Helper ───────────────────────────────

function triggerMountIfConnected(host: Node, node: Node): void {
  if (isConnected(host)) {
    triggerMount(node);
  }
}

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
