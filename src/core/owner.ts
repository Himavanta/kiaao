// kiaao — Owner tree: lifecycle ownership management
// Platform-agnostic. No DOM dependencies.

import type { Owner } from "./types.ts";
import { removeNode } from "./types.ts";

// ── createOwner ───────────────────────────────────────

/**
 * 创建一个新的 Owner 对象。
 * Owner 之间通过 parent/children 指针形成所有权树。
 * 创建后不自动关联父 Owner——由调用方在父级 children 中 push。
 */
export function createOwner(): Owner {
  return {
    parent: null,
    children: [],
    cleanups: [],
    mountCallbacks: [],
    unmountCallbacks: [],
    elements: new Set(),
    disposed: false,
  };
}

// ── disposeOwner ──────────────────────────────────────

/** 安全执行生命周期回调，同步错误和异步 rejection 均捕获 */
function safeCall(fn: () => void | Promise<void>, label: string): void {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
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
 * 2. 执行 cleanups（派生 stop、指令清理等）
 * 3. 移除 elements 中所有渲染元素
 * 4. 递归销毁所有子 Owner（遍历快照副本，防止迭代错位）
 * 5. 清空 children 数组
 */
export function disposeOwner(owner: Owner): void {
  if (owner.disposed) return;
  owner.disposed = true;

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

  // 3. Remove all owned elements from the DOM (via adapter if registered)
  for (const el of owner.elements) {
    removeNode(el);
  }
  owner.elements.clear();

  // 4. Recursively dispose children (iterate copy, clear after)
  const children = [...owner.children];
  for (const child of children) {
    disposeOwner(child);
  }
  owner.children.length = 0;
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
