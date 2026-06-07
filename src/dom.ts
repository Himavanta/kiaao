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

import { createDisposeFn, triggerMount, disposeNode } from "./lifecycle.ts";
import { hSSR, isVoidElement } from "./ssr-helpers.ts";

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

// ── Shared Props Handler ───────────────────────────────

/** 在元素上设置一组属性（事件/响应式/静态），effect 注册到 LOCAL_EFFECTS */
function setProps(el: HTMLElement, props: Record<string, any> | null | undefined): void {
  if (!props || typeof props !== "object") return;

  for (const key of Object.keys(props)) {
    if (key === "children") continue;

    const value = props[key];

    if (EVENT_RE.test(key)) {
      setProp(el, key, value);
    } else if ((value as any)?.[IS_REACTIVE]) {
      const stop = effect(() => {
        setProp(el, key, value());
      });
      addLocalEffect(el, stop);
    } else {
      setProp(el, key, value);
    }
  }
}

// ── Control-flow directive helpers ─────────────────────

/** 如果宿主元素已在文档中，触发新子节点的 mount 回调 */
function triggerMountIfConnected(host: Node, node: Node): void {
  if (host.isConnected) {
    triggerMount(node);
  }
}

/** 创建条件渲染元素（when 指令） */
function createWhenElement(
  tag: string,
  props: any,
  children: any[],
  whenFn: any,
  eachFn?: any,
  _keyFn?: any,
): HTMLElement {
  if (isVoidElement(tag)) {
    throw new Error(`[kiaao] when cannot be used on void element <${tag}>`);
  }

  const el = document.createElement(tag);

  // ── 设置属性 ──
  setProps(el, props);

  // 判断是否为惰性求值模式（子节点为单一函数，且无 each）
  const isLazy = eachFn === undefined && children.length === 1 && typeof children[0] === "function";
  const hasEach = eachFn !== undefined;

  const stop = effect(() => {
    const show = Boolean(typeof whenFn === "function" ? whenFn() : whenFn);

    // 清空旧子节点
    while (el.firstChild) {
      disposeNode(el.firstChild);
      el.removeChild(el.firstChild);
    }

    if (!show) return;

    if (hasEach) {
      // when + each 共存：when 优先，在其内执行 each
      const items = typeof eachFn === "function" ? eachFn() : eachFn;
      const childFn = children[0];
      if (Array.isArray(items) && typeof childFn === "function") {
        for (let i = 0; i < items.length; i++) {
          const result = childFn(items[i], i);
          if (result instanceof Node) {
            el.appendChild(result);
            triggerMountIfConnected(el, result);
          }
        }
      }
    } else if (isLazy) {
      // 惰性求值
      const result = children[0]();
      if (result instanceof Node) {
        el.appendChild(result);
        triggerMountIfConnected(el, result);
      }
    } else {
      // 静态子节点（已由 h() 外层求值）
      const nodes = processChildren(children);
      for (const node of nodes) {
        el.appendChild(node);
        triggerMountIfConnected(el, node);
      }
    }
  });

  // 注册清理
  addLocalEffect(el, stop);

  return el;
}

/** 创建列表渲染元素（each 指令） */
function createEachElement(
  tag: string,
  props: any,
  children: any[],
  eachFn: any,
  keyFn?: any,
): HTMLElement {
  if (isVoidElement(tag)) {
    throw new Error(`[kiaao] each cannot be used on void element <${tag}>`);
  }

  const el = document.createElement(tag);

  // ── 设置属性 ──
  setProps(el, props);

  // 锚点：作为列表起始位置的固定参考点
  const anchor = document.createComment("each");
  el.appendChild(anchor);

  const nodeMap = new Map<any, Node>(); // key → 旧 DOM 节点
  const childFn = children[0]; // (item, index) => Node

  const stop = effect(() => {
    const items = typeof eachFn === "function" ? eachFn() : eachFn;

    // ── 无 key：全量重建（兼容行为） ──
    if (!keyFn) {
      while (el.firstChild !== anchor) {
        disposeNode(el.firstChild!);
        el.removeChild(el.firstChild!);
      }
      if (Array.isArray(items) && typeof childFn === "function") {
        for (let i = 0; i < items.length; i++) {
          const node = childFn(items[i], i);
          if (node instanceof Node) {
            el.insertBefore(node, anchor);
            if (el.isConnected) triggerMount(node);
          }
        }
      }
      return;
    }

    // ── 有 key：基于 key 的增量更新 ──
    const newKeys = new Set<any>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = keyFn(item, i);
      newKeys.add(key);

      // 同一 key 的旧节点不再需要，先清理
      const oldNode = nodeMap.get(key);
      if (oldNode) {
        disposeNode(oldNode);
        if (oldNode.parentNode) {
          oldNode.parentNode.removeChild(oldNode);
        }
      }

      // 始终调用 childFn 生成新节点（方向 B：保证数据与 item 同步）
      const newNode = childFn(item, i);
      if (!(newNode instanceof Node)) continue;

      // anchor 是固定参考点，始终在它之前插入
      el.insertBefore(newNode, anchor);
      if (el.isConnected) triggerMount(newNode);

      nodeMap.set(key, newNode);
    }

    // 清理不再使用的旧节点
    for (const [key, oldNode] of nodeMap) {
      if (!newKeys.has(key)) {
        disposeNode(oldNode);
        if (oldNode.parentNode) {
          oldNode.parentNode.removeChild(oldNode);
        }
        nodeMap.delete(key);
      }
    }
  });

  addLocalEffect(el, stop);

  return el;
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

  // ── DOM 模式：控制流指令 ──
  if (props?.when !== undefined) {
    const { when, each, key, ...rest } = props;
    return createWhenElement(tag, rest, children, when, each, key);
  }
  if (props?.each !== undefined) {
    const { each, key, ...rest } = props;
    return createEachElement(tag, rest, children, each, key);
  }

  // ── DOM 模式：普通元素 ──
  const el = document.createElement(tag);

  setProps(el, props && typeof props === "object" && !(props as any)[IS_REACTIVE] ? props : null);

  const childNodes = processChildren(children);

  for (const node of childNodes) {
    el.appendChild(node);
  }

  return el;
}
