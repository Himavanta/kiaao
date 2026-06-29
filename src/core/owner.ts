// kiaao — Owner tree: lifecycle ownership management
// Platform-agnostic. No DOM dependencies.

import { removeNode } from "../adapter/index.ts";
import { isFunction } from "./type-guards.ts";
import type { Owner } from "./types.ts";

// ── createOwner ───────────────────────────────────────

/**
 * 创建一个新的 Owner 对象。
 * 轻量 Owner（lightweight）由 isLightweight 标记，
 * 在 nestBind 中被 evacuation 逻辑处理，后续阶段将被移除。
 */
export function createOwner(options?: { lightweight?: boolean }): Owner {
  return {
    parent: null,
    children: [],
    cleanups: [],
    mountCallbacks: [],
    unmountCallbacks: [],
    elements: new Set(),
    disposed: false,
    isLightweight: options?.lightweight || false,
  };
}

// ── disposeOwner ──────────────────────────────────────

/** 安全执行生命周期回调，同步错误和异步 rejection 均捕获 */
function safeCall(fn: () => void | Promise<void>, label: string): void {
  try {
    const result = fn();
    if (result && isFunction((result as any).then)) {
      result.catch((err: unknown) => console.error(`[kiaao] ${label}:`, err));
    }
  } catch (err) {
    console.error(`[kiaao] ${label}:`, err);
  }
}

/**
 * 销毁一个 Owner 及其所有子 Owner。
 *
 * 清理顺序：
 * 1. 执行 unmountCallbacks（onUnmount 回调）
 * 执行顺序：
 * 1. 从父 Owner children 中移除自身
 * 2. 递归销毁所有子 Owner（子先销毁）
 * 3. 执行 unmountCallbacks
 * 4. 执行 cleanups
 * 5. 移除 elements
 */
export function disposeOwner(owner: Owner): void {
  if (owner.disposed) return;
  owner.disposed = true;

  // 从父 Owner 的 children 中移除自身
  if (owner.parent) {
    const idx = owner.parent.children.indexOf(owner);
    if (idx !== -1) owner.parent.children.splice(idx, 1);
  }

  // 先递归销毁子 Owner，确保子先 unmount
  const children = [...owner.children];
  for (const child of children) {
    disposeOwner(child);
  }
  owner.children.length = 0;

  // 1. Execute unmount callbacks
  for (const cb of owner.unmountCallbacks) {
    safeCall(cb, "onUnmount");
  }
  owner.unmountCallbacks.length = 0;

  // 2. Execute cleanup callbacks
  for (const cleanup of owner.cleanups) {
    safeCall(cleanup, "cleanup");
  }
  owner.cleanups.length = 0;

  // 3. Remove all owned elements from the DOM（轻量 Owner 的元素由父级 dispose 统一清理）
  if (!owner.isLightweight) {
    for (const el of owner.elements) {
      removeNode(el);
    }
    owner.elements.clear();
  }
}

// ── triggerMount ──────────────────────────────────────

/**
 * 触发 Owner 树中所有未挂载的 onMount 回调。
 * 从当前 Owner 出发，递归遍历 children 树。
 * 通过 visited Set 防止循环引用。
 */
export function triggerMount(owner: Owner, visited: Set<Owner> = new Set()): void {
  if (owner.disposed) return;
  if (visited.has(owner)) return;
  visited.add(owner);

  // 轻量 Owner：透传子 Owner，不触发自身回调
  if (owner.isLightweight) {
    for (const child of owner.children) {
      triggerMount(child, visited);
    }
    return;
  }

  // Execute mount callbacks
  for (const cb of owner.mountCallbacks) {
    safeCall(cb, "onMount");
  }
  owner.mountCallbacks.length = 0;

  // Recursively trigger children
  for (const child of owner.children) {
    triggerMount(child, visited);
  }
}
