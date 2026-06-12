// kiaao v4 — Component model & lifecycle (DOM)
// Component instance creation, lifecycle hooks (via context), mount/unmount, dispose.

import {
  DISPOSE_KEY,
  INSTANCE_KEY,
  INITIALIZED_KEY,
  DISPOSED_KEY,
  LOCAL_EFFECTS,
  type ComponentInstance,
} from "../reactive/types.ts";

// ── Component Instance ─────────────────────────────────

let nextComponentId = 0;

export function createComponentInstance(): ComponentInstance {
  return {
    id: nextComponentId++,
    mountCallbacks: [],
    unmountCallbacks: [],
  };
}

// ── Safe Call ──────────────────────────────────────────
// 统一执行生命周期回调，捕获同步错误和异步 rejection。

export function safeCall(fn: () => void | Promise<void>, label: string): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.catch((err) => console.error(`[kiaao] ${label}:`, err));
    }
  } catch (err) {
    console.error(`[kiaao] ${label}:`, err);
  }
}

// ── Component Dispose ───────────────────────────────────

export function createDisposeFn(instance: ComponentInstance): () => void {
  return () => {
    if ((instance as any)[DISPOSED_KEY]) return;
    (instance as any)[DISPOSED_KEY] = true;

    for (const cb of instance.unmountCallbacks) {
      safeCall(cb, "onUnmount");
    }
  };
}

// ── Tree traversal ─────────────────────────────────────

export function triggerMount(node: Node): void {
  const instance = (node as any)[INSTANCE_KEY] as ComponentInstance | undefined;
  if (instance && !(instance as any)[INITIALIZED_KEY]) {
    (instance as any)[INITIALIZED_KEY] = true;
    for (const cb of instance.mountCallbacks) {
      safeCall(cb, "onMount");
    }
  }

  for (const child of node.childNodes) {
    triggerMount(child);
  }
}

export function disposeNode(node: Node): void {
  for (const child of node.childNodes) {
    disposeNode(child);
  }

  const localStops = (node as any)[LOCAL_EFFECTS] as Set<() => void> | undefined;
  if (localStops) {
    for (const stop of localStops) {
      stop();
    }
    localStops.clear();
    delete (node as any)[LOCAL_EFFECTS];
  }

  const dispose = (node as any)[DISPOSE_KEY] as (() => void) | undefined;
  if (dispose) {
    dispose();
  }
}

// ── mount / unmount ─────────────────────────────────────

export function mount(root: Element, container: Element): void {
  if (process.env.NODE_ENV !== "production") {
    if (container.children.length > 0) {
      console.warn(
        new Error(
          `[kiaao] mount target already has ${container.children.length} child node(s). Existing content will be preserved.`,
        ),
      );
    }
  }
  container.append(root);
  triggerMount(root);
}

export function unmount(root: Element): void {
  if (process.env.NODE_ENV !== "production") {
    if (!root.isConnected) {
      console.warn(new Error("[kiaao] unmount called on already disconnected node."));
    }
  }
  disposeNode(root);
  root.remove();
}
