// kiaao — DOM rendering: h, mount, unmount, onMount, onUnmount

import {
  IS_REACTIVE,
  DISPOSE_KEY,
  INSTANCE_KEY,
  INITIALIZED_KEY,
  DISPOSED_KEY,
  type ReactiveFunction,
} from "./types.ts";

import {
  effect,
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
function processChildren(children: any[], effectStops: Set<() => void>): Node[] {
  const result: Node[] = [];

  for (const child of children) {
    // Flatten nested arrays
    if (Array.isArray(child)) {
      result.push(...processChildren(child, effectStops));
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
      effectStops.add(stop);
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

  // Process children
  const instance = currentComponent();
  const effectStops = instance?.effectStops ?? new Set<() => void>();
  const childNodes = processChildren(children, effectStops);

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

  // Dispose this node
  const dispose = (node as any)[DISPOSE_KEY] as (() => void) | undefined;
  if (dispose) {
    dispose();
  }
}

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
