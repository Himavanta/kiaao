// kiaao v4 — Component model & lifecycle (DOM)
// Component stack, lifecycle hooks, mount/unmount, dispose.

import {
  DISPOSE_KEY,
  INSTANCE_KEY,
  INITIALIZED_KEY,
  DISPOSED_KEY,
  LOCAL_EFFECTS,
  type ComponentInstance,
} from "../reactive/types.ts";

// ── Component Stack ────────────────────────────────────
// 在 h() 的组件模式执行期间维护，供 onMount/onUnmount 注册回调。

let nextComponentId = 0;
const componentStack: ComponentInstance[] = [];

export function currentComponent(): ComponentInstance | undefined {
  return componentStack[componentStack.length - 1] ?? undefined;
}

export function pushComponent(inst: ComponentInstance): void {
  componentStack.push(inst);
}

export function popComponent(): void {
  componentStack.pop();
}

export function createComponentInstance(): ComponentInstance {
  return {
    id: nextComponentId++,
    mountCallbacks: [],
    unmountCallbacks: [],
    effectStops: new Set(),
  };
}

// ── Lifecycle Hooks ────────────────────────────────────

export function onMount(fn: () => void): void {
  const comp = currentComponent();
  if (comp) {
    comp.mountCallbacks.push(fn);
  }
}

export function onUnmount(fn: () => void): void {
  const comp = currentComponent();
  if (comp) {
    comp.unmountCallbacks.push(fn);
  }
}

// ── Component Dispose ───────────────────────────────────

export function createDisposeFn(instance: ComponentInstance): () => void {
  return () => {
    if ((instance as any)[DISPOSED_KEY]) return;
    (instance as any)[DISPOSED_KEY] = true;

    for (const cb of instance.unmountCallbacks) {
      cb();
    }

    for (const stop of instance.effectStops) {
      stop();
    }
  };
}

// ── Tree traversal ─────────────────────────────────────

export function triggerMount(node: Node): void {
  const instance = (node as any)[INSTANCE_KEY] as ComponentInstance | undefined;
  if (instance && !(instance as any)[INITIALIZED_KEY]) {
    (instance as any)[INITIALIZED_KEY] = true;
    for (const cb of instance.mountCallbacks) {
      cb();
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
  container.append(root);
  triggerMount(root);
}

export function unmount(root: Element): void {
  disposeNode(root);
  root.remove();
}
