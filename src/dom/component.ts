// kiaao v4 — Component model & lifecycle (DOM)
// Component instance creation, lifecycle hooks (via context), mount/unmount, dispose.

import {
  DISPOSE_KEY,
  INSTANCE_KEY,
  INITIALIZED_KEY,
  DISPOSED_KEY,
  LOCAL_EFFECTS,
  DIRECTIVE_MOUNT,
  DIRECTIVE_UNMOUNT,
  type ComponentInstance,
} from "../reactive/types.ts";
// ── Component Instance ─────────────────────────────────

let nextComponentId = 0;

/**
 * 将一个组件实例关联到一个 DOM 节点上。
 * 允许多个实例共享同一节点（如包装组件直接返回子组件结果）。
 * 节点第一次关联时初始化 INSTANCE_KEY 和 DISPOSE_KEY 为 Set，
 * 后续关联追加到 Set 中。
 */
/**
 * 将一个组件实例关联到一个 DOM 节点上。
 * 允许多个实例共享同一节点。
 * INSTANCE_KEY 和 DISPOSE_KEY 各自独立初始化 Set。
 */
export function attachInstance(node: Node, instance: ComponentInstance): void {
  if (!(node as any)[INSTANCE_KEY]) {
    (node as any)[INSTANCE_KEY] = new Set<ComponentInstance>();
  }
  if (!(node as any)[DISPOSE_KEY]) {
    (node as any)[DISPOSE_KEY] = new Set<() => void>();
  }
  (node as any)[INSTANCE_KEY].add(instance);
  (node as any)[DISPOSE_KEY].add(createDisposeFn(instance));
}

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
  // 组件 onMount 回调
  const instances = (node as any)[INSTANCE_KEY] as Set<ComponentInstance> | undefined;
  if (instances) {
    instances.forEach((instance: ComponentInstance) => {
      if (!(instance as any)[INITIALIZED_KEY]) {
        (instance as any)[INITIALIZED_KEY] = true;
        for (const cb of instance.mountCallbacks) {
          safeCall(cb, "onMount");
        }
      }
    });
  }

  // 指令 onMount 回调（按注册顺序执行）
  const directiveMounts = (node as any)[DIRECTIVE_MOUNT] as Set<() => void> | undefined;
  if (directiveMounts) {
    for (const fn of directiveMounts) {
      safeCall(fn, "directive onMount");
    }
  }

  for (const child of node.childNodes) {
    triggerMount(child);
  }
}

// ── Cleanup Steps ──────────────────────────────────────

/** 清理节点上的 LOCAL_EFFECTS（包括指令的 context.use 创建的信号） */
function disposeLocalEffects(node: Node): void {
  const localStops = (node as any)[LOCAL_EFFECTS] as Set<() => void> | undefined;
  if (!localStops) return;

  for (const stop of localStops) {
    stop();
  }
  localStops.clear();
  delete (node as any)[LOCAL_EFFECTS];
}

/** 执行节点上指令的 onUnmount 回调 */
function disposeDirectiveUnmounts(node: Node): void {
  const directiveUnmounts = (node as any)[DIRECTIVE_UNMOUNT] as Set<() => void> | undefined;
  if (!directiveUnmounts) return;

  for (const fn of directiveUnmounts) {
    safeCall(fn, "directive onUnmount");
  }
  directiveUnmounts.clear();
  delete (node as any)[DIRECTIVE_UNMOUNT];
}

/** 清理节点上的 DISPOSE_KEY（组件 onUnmount）和 INSTANCE_KEY */
function disposeComponentRefs(node: Node): void {
  // 执行 DISPOSE_KEY（组件的 onUnmount）
  const disposeFns = (node as any)[DISPOSE_KEY] as Set<() => void> | undefined;
  if (disposeFns) {
    disposeFns.forEach((fn: () => void) => fn());
    disposeFns.clear();
  }

  // 清理 INSTANCE_KEY
  const instances = (node as any)[INSTANCE_KEY] as Set<ComponentInstance> | undefined;
  if (instances) {
    instances.clear();
  }
}

// ── disposeNode ────────────────────────────────────────

export function disposeNode(node: Node): void {
  // 1. 递归处理子节点
  for (const child of node.childNodes) {
    disposeNode(child);
  }

  // 2. 清理 LOCAL_EFFECTS（包括指令的 context.use 创建的信号）
  disposeLocalEffects(node);

  // 3. 执行指令的 onUnmount 回调
  disposeDirectiveUnmounts(node);

  // 4. 执行 DISPOSE_KEY + 清理 INSTANCE_KEY
  disposeComponentRefs(node);
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
