// kiaao — Lifecycle hooks and DOM mount/unmount utilities

import {
  DISPOSE_KEY,
  INSTANCE_KEY,
  INITIALIZED_KEY,
  DISPOSED_KEY,
  LOCAL_EFFECTS,
  type ComponentInstance,
} from "./types.ts";

import { currentComponent } from "./runtime.ts";

// ── onMount / onUnmount ────────────────────────────────

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

export function mount(root: HTMLElement, container: HTMLElement): void {
  container.appendChild(root);
  triggerMount(root);
}

export function unmount(root: HTMLElement): void {
  disposeNode(root);

  if (root.parentNode) {
    root.parentNode.removeChild(root);
  }
}
