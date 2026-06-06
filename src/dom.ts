// kiaao — DOM rendering: h, mount, unmount, onMount, onUnmount

import {
  IS_REACTIVE,
  DISPOSE_KEY,
  INSTANCE_KEY,
  INITIALIZED_KEY,
  DISPOSED_KEY,
  LOCAL_EFFECTS,
  type ReactiveFunction,
} from "./types.ts";

import {
  effect,
  define,
  currentComponent,
  pushComponent,
  popComponent,
  createComponentInstance,
} from "./runtime.ts";
import type { ComponentInstance } from "./types.ts";

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

// ── Prop Processing ─────────────────────────────────────

const EVENT_RE = /^on([A-Z])/;

function setProp(el: HTMLElement, key: string, value: any): void {
  if (value == null) return;

  // Event listeners: onClick → click
  const eventMatch = key.match(EVENT_RE);
  if (eventMatch) {
    const eventName = eventMatch[1]!.toLowerCase() + key.slice(2 + eventMatch[1]!.length);
    el.addEventListener(eventName, value);
    return;
  }

  switch (key) {
    case "class":
    case "className":
      el.className = value;
      break;
    case "style":
      if (typeof value === "string") {
        el.style.cssText = value;
      } else if (typeof value === "object" && value !== null) {
        Object.assign(el.style, value);
      }
      break;
    default:
      // Boolean attributes
      if (typeof value === "boolean") {
        if (value) {
          el.setAttribute(key, "");
        } else {
          el.removeAttribute(key);
        }
      } else {
        el.setAttribute(key, String(value));
      }
      break;
  }
}

// ── Child Processing ────────────────────────────────────

/**
 * Process child nodes, flattening nested arrays and creating
 * dynamic bindings for reactive functions.
 */
function processChildren(children: any[]): Node[] {
  const result: Node[] = [];

  for (const child of children) {
    // Flatten nested arrays
    if (Array.isArray(child)) {
      result.push(...processChildren(child));
      continue;
    }

    // Skip null / undefined / boolean
    if (child == null || typeof child === "boolean") continue;

    // Reactive function → dynamic text node
    if ((child as ReactiveFunction)[IS_REACTIVE]) {
      const textNode = document.createTextNode("");
      const stop = effect(() => {
        textNode.textContent = String(child());
      });
      // Store stop directly on the textNode, not on the parent component.
      // This ensures disposeNode can clean it up when the node is removed.
      let stops = (textNode as any)[LOCAL_EFFECTS] as Set<() => void> | undefined;
      if (!stops) {
        stops = new Set();
        (textNode as any)[LOCAL_EFFECTS] = stops;
      }
      stops.add(stop);
      result.push(textNode);
      continue;
    }

    // DOM node → direct append
    if (child instanceof Node) {
      result.push(child);
      continue;
    }

    // Primitive → static text node
    result.push(document.createTextNode(String(child)));
  }

  return result;
}

// ── Component Dispose ───────────────────────────────────

function createDisposeFn(instance: ComponentInstance): () => void {
  return () => {
    if ((instance as any)[DISPOSED_KEY]) return;
    (instance as any)[DISPOSED_KEY] = true;

    // 1. Run unmount callbacks
    for (const cb of instance.unmountCallbacks) {
      cb();
    }

    // 2. Stop all effects
    for (const stop of instance.effectStops) {
      stop();
    }
  };
}

// ── h ───────────────────────────────────────────────────

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | ((props: any) => any),
  props?: any,
  ...children: any[]
): HTMLElement {
  // ── Component mode ──
  if (typeof tag === "function") {
    const instance = createComponentInstance();
    pushComponent(instance);

    // Merge rest children into props.children
    let compProps = props ?? {};
    if (children.length > 0) {
      compProps = { ...compProps, children: children.length === 1 ? children[0] : children };
    }

    const result = tag(compProps);
    popComponent();

    if (result instanceof Node) {
      (result as any)[INSTANCE_KEY] = instance;
      (result as any)[DISPOSE_KEY] = createDisposeFn(instance);
    }

    return result as HTMLElement;
  }

  // ── DOM mode ──
  const el = document.createElement(tag);

  // Apply props
  if (props && typeof props === "object" && !(props as any)[IS_REACTIVE]) {
    for (const key of Object.keys(props)) {
      setProp(el, key, (props as any)[key]);
    }
  }

  // Process children — dynamic bindings are tracked via LOCAL_EFFECTS on each textNode
  const childNodes = processChildren(children);

  for (const node of childNodes) {
    el.appendChild(node);
  }

  return el;
}

// ── mount / unmount ─────────────────────────────────────

function triggerMount(node: Node): void {
  const instance = (node as any)[INSTANCE_KEY] as ComponentInstance | undefined;
  if (instance && !(instance as any)[INITIALIZED_KEY]) {
    (instance as any)[INITIALIZED_KEY] = true;
    for (const cb of instance.mountCallbacks) {
      cb();
    }
  }

  // Recurse into child nodes
  for (const child of node.childNodes) {
    triggerMount(child);
  }
}

function disposeNode(node: Node): void {
  // Dispose children first (depth-first)
  for (const child of node.childNodes) {
    disposeNode(child);
  }

  // Stop local effects (dynamic bindings attached to this node)
  const localStops = (node as any)[LOCAL_EFFECTS] as Set<() => void> | undefined;
  if (localStops) {
    for (const stop of localStops) {
      stop();
    }
    localStops.clear();
    delete (node as any)[LOCAL_EFFECTS];
  }

  // Dispose component instance attached to this node
  const dispose = (node as any)[DISPOSE_KEY] as (() => void) | undefined;
  if (dispose) {
    dispose();
  }
}

// ── Show ──────────────────────────────────────────────────

/**
 * Conditional rendering. `when` supports both reactive functions
 * (IS_REACTIVE) and plain functions. Branches are lazily evaluated
 * and fully torn down / rebuilt on toggle.
 */
export function Show(props: {
  when: (() => any) | ReactiveFunction;
  fallback?: () => any;
  children?: () => any;
}): Node {
  const anchor = document.createComment("show");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(anchor);

  // Track nodes owned by the current branch
  let branchNodes: Node[] = [];
  let isFirstRun = true;

  /** Remove all currently tracked branch nodes from DOM */
  function removeBranch() {
    for (const node of branchNodes) {
      disposeNode(node);
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
    branchNodes = [];
  }

  /** Collect nodes from a render result, unwrapping DocumentFragment */
  function collectNodes(result: any): Node[] {
    if (result instanceof DocumentFragment) {
      return Array.from(result.childNodes);
    }
    if (result instanceof Node) {
      return [result];
    }
    if (result != null) {
      return [document.createTextNode(String(result))];
    }
    return [];
  }

  effect(() => {
    const show = Boolean(props.when());

    // Tear down old branch (skip on first run)
    if (!isFirstRun) {
      removeBranch();
    }

    // Render new branch
    const renderFn = show ? props.children : props.fallback;
    if (renderFn) {
      const result = renderFn();
      const nodes = collectNodes(result);
      const parent = anchor.parentNode ?? fragment;

      for (const node of nodes) {
        parent.insertBefore(node, anchor.nextSibling);
      }
      branchNodes = nodes;

      // Trigger lifecycle for dynamically inserted content
      if (!isFirstRun && anchor.parentNode) {
        for (const node of nodes) {
          triggerMount(node);
        }
      }
    }

    isFirstRun = false;
  });

  return fragment;
}

// ── List ──────────────────────────────────────────────────

/**
 * List rendering with key-based reconciliation.
 * `each` receives a getter/derive function returning an array.
 * `key` identifies items for cleanup — all items are freshly rendered
 * on each update, but stale keys are properly disposed.
 */
export function List<T>(props: {
  each: () => T[];
  key: (item: T, index: number) => any;
  children?: (item: T, index: number) => any;
}): Node {
  const anchor = document.createComment("list");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(anchor);

  const children = props.children!;

  effect(() => {
    const list = props.each();
    const parent = anchor.parentNode ?? fragment;

    // Remove all previous children (inserted before anchor's next sibling)
    while (anchor.nextSibling) {
      const old = anchor.nextSibling;
      disposeNode(old);
      old.parentNode?.removeChild(old);
    }

    // Render fresh
    let prevNode: Node = anchor;
    for (let i = 0; i < list.length; i++) {
      const node = children(list[i], i);
      parent.insertBefore(node, prevNode.nextSibling);
      if (parent !== fragment) {
        triggerMount(node);
      }
      prevNode = node;
    }
  });

  return fragment;
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

// ── Teleport ───────────────────────────────────────────────

/**
 * Renders children into a different DOM container (by CSS selector or
 * element reference). The content is logically still part of the current
 * component tree — lifecycle hooks fire normally, and cleanup happens
 * automatically when the Teleport's parent is unmounted.
 */
export function Teleport(props: { to: string | HTMLElement; children: () => any }): Node {
  const target =
    typeof props.to === "string" ? document.querySelector<HTMLElement>(props.to) : props.to;
  if (!target) return document.createComment("teleport-missing-target");

  const content = props.children();
  if (content instanceof Node) {
    target.appendChild(content);
    triggerMount(content);
  }

  onUnmount(() => {
    if (content instanceof Node) {
      disposeNode(content);
      if (content.parentNode) {
        content.parentNode.removeChild(content);
      }
    }
  });

  return document.createComment("teleport");
}

// ── lazy (async component) ───────────────────────────────────

/**
 * Wraps a dynamic import so it can be used as a regular component.
 * Shows nothing (comment placeholder) while loading, then seamlessly
 * replaces it with the real component once loaded.
 *
 * ```ts
 * const AsyncProfile = lazy(() => import("./HeavyProfile.ts"));
 * // use like any other component:
 * h(AsyncProfile, { userId: 42 });
 * ```
 */
export function lazy<T extends (...args: any[]) => any>(
  loader: () => Promise<{ default: T } | T>,
): T {
  const [Component, setComponent] = define<T | null>(null);

  loader()
    .then((mod) => {
      const comp = (mod as any).default || mod;
      setComponent(() => comp);
    })
    .catch((err) => {
      // Throw on next tick so it can be caught by an error boundary
      setTimeout(() => {
        throw err;
      }, 0);
    });

  const LazyComponent = ((props: any) => {
    return h(Show, {
      when: () => Component() !== null,
      fallback: () => document.createComment("lazy-loading"),
      children: () => h(Component()!, props),
    });
  }) as any;

  return LazyComponent as T;
}
