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

// 匹配 JSX 事件属性：on + 大写字母（如 onClick、onClickOutside）
// 排除 only、onto 等以 on 开头的非事件属性
const EVENT_RE = /^on[A-Z]/;

function setProp(el: HTMLElement, key: string, value: any): void {
  if (value == null) return;

  if (EVENT_RE.test(key)) {
    const eventName = key.slice(2).toLowerCase();
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
        // 先清空所有内联样式，再用新对象赋值（替换而非合并）
        el.removeAttribute("style");
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

// ── Helpers ─────────────────────────────────────────────

/** 在节点上注册一个 effect stop，节点移除时自动清理 */
function addLocalEffect(node: Node, stop: () => void): void {
  let stops = (node as any)[LOCAL_EFFECTS] as Set<() => void> | undefined;
  if (!stops) {
    stops = new Set();
    (node as any)[LOCAL_EFFECTS] = stops;
  }
  stops.add(stop);
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
      addLocalEffect(textNode, stop);
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

      if (EVENT_RE.test(key)) {
        // 事件属性：直接静态绑定，不走响应式
        setProp(el, key, value);
      } else if ((value as any)?.[IS_REACTIVE]) {
        // 响应式属性：创建 effect，运行 setProp 更新 DOM
        const stop = effect(() => {
          setProp(el, key, value());
        });
        addLocalEffect(el, stop);
      } else {
        // 静态属性：直接通过 setProp 设置
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
