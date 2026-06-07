// kiaao — h() function: creates real DOM or dispatches to hSSR in SSR mode

import {
  IS_REACTIVE,
  INSTANCE_KEY,
  DISPOSE_KEY,
  LOCAL_EFFECTS,
  type ReactiveFunction,
} from "./types.ts";

import {
  effect,
  pushComponent,
  popComponent,
  createComponentInstance,
  getRenderMode,
} from "./runtime.ts";

import { createDisposeFn } from "./lifecycle.ts";
import { hSSR } from "./ssr-helpers.ts";

// ── Prop Processing ─────────────────────────────────────

const EVENT_RE = /^on([A-Z])/;

function setProp(el: HTMLElement, key: string, value: any): void {
  if (value == null) return;

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

function processChildren(children: any[]): Node[] {
  const result: Node[] = [];

  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...processChildren(child));
      continue;
    }

    if (child == null || typeof child === "boolean") continue;

    if ((child as ReactiveFunction)[IS_REACTIVE]) {
      const textNode = document.createTextNode("");
      const stop = effect(() => {
        textNode.textContent = String(child());
      });
      let stops = (textNode as any)[LOCAL_EFFECTS] as Set<() => void> | undefined;
      if (!stops) {
        stops = new Set();
        (textNode as any)[LOCAL_EFFECTS] = stops;
      }
      stops.add(stop);
      result.push(textNode);
      continue;
    }

    if (child instanceof Node) {
      result.push(child);
      continue;
    }

    result.push(document.createTextNode(String(child)));
  }

  return result;
}

// ── h ───────────────────────────────────────────────────

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | ((props: any) => any),
  props?: any,
  ...children: any[]
): HTMLElement {
  // SSR mode: delegate to hSSR
  if (getRenderMode() === "ssr") {
    return hSSR(tag, props, children) as any;
  }

  // Component mode
  if (typeof tag === "function") {
    const instance = createComponentInstance();
    pushComponent(instance);

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

  // DOM mode
  const el = document.createElement(tag);

  if (props && typeof props === "object" && !(props as any)[IS_REACTIVE]) {
    for (const key of Object.keys(props)) {
      if (key === "children") continue;

      const value = (props as any)[key];

      if (key.startsWith("on")) {
        // Events: static binding once
        setProp(el, key, value);
      } else if ((value as any)?.[IS_REACTIVE]) {
        // Reactive attribute binding: create effect, register cleanup
        const stop = effect(() => {
          setProp(el, key, value());
        });
        let stops = (el as any)[LOCAL_EFFECTS] as Set<() => void> | undefined;
        if (!stops) {
          stops = new Set();
          (el as any)[LOCAL_EFFECTS] = stops;
        }
        stops.add(stop);
      } else {
        // Static attribute
        setProp(el, key, value);
      }
    }
  }

  const childNodes = processChildren(children);

  for (const node of childNodes) {
    el.appendChild(node);
  }

  return el;
}
