// kiaao — Shared helpers for control flow components (Show, Case, Each)
// Platform-agnostic. No DOM dependencies beyond the adapter interface.

import { getAdapter } from "../adapter/index.ts";
import type { ComponentFunction } from "./component.ts";
import { h } from "./h.ts";
import { use, isUse } from "./signal.ts";
import { isArray } from "./type-guards.ts";
import { getSignalState } from "./types.ts";
import type { Owner, HostNode, HResult } from "./types.ts";

// ── Anchor Management ─────────────────────────────────

/** 创建注释锚点并注册到 Owner 的 elements */
export function initAnchor(owner: Owner, label: string): HostNode {
  const adapter = getAdapter();
  const anchor = adapter.createComment(label);
  owner.elements.add(anchor);
  return anchor;
}

// ── Child Adoption ────────────────────────────────────

/**
 * 渲染一个子组件并将其 Owner 挂载到目标 Owner 下，节点插入在锚点之前。
 * 返回 HResult 供调用方追踪。
 */
export function adoptBranch(options: {
  parentOwner: Owner;
  anchor: HostNode;
  Component: ComponentFunction;
  componentProps?: any;
}): HResult {
  const { parentOwner, anchor, Component, componentProps } = options;
  const adapter = getAdapter();
  const r = h(Component, componentProps);
  const childOwner = r.owner!;
  childOwner.parent = parentOwner;
  parentOwner.children.push(childOwner);
  for (const node of r.nodes) {
    adapter.before(anchor, node);
  }
  return r;
}

// ── Children Normalization ────────────────────────────

/**
 * 归一化 children prop。
 * handleComponent 对单 child 会通过 normalizeChildren 解包，
 * 导致组件收到的 children 可能是函数而非数组。
 */
export function normalizeChildList<T>(children: T | T[]): T[] {
  return isArray(children) ? children : [children];
}

// ── Signal Subscription ───────────────────────────────

/**
 * 为控制流组件设置信号订阅。
 * 自动跳过 use() 派生初始计算（组件体已处理初始渲染）。
 * 注册派生清理到 Owner.cleanups。
 */
export function subscribeSignal(owner: Owner, signal: any, callback: () => void): void {
  if (!isUse(signal)) return;

  let initialized = false;
  const derived = use(signal, () => {
    if (!initialized) {
      initialized = true;
      return;
    }
    callback();
  });
  const state = getSignalState(derived);
  if (state?.stop) owner.cleanups.push(state.stop);
}
