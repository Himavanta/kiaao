// kiaao — h() function: creates real DOM or dispatches to hSSR in SSR mode

import {
  IS_REACTIVE,
  INSTANCE_KEY,
  DISPOSE_KEY,
  LOCAL_EFFECTS,
  SKIP_UPDATE,
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

/** 从节点上移除一个已注册的 stop，防止 LOCAL_EFFECTS 集合无限增长 */
function removeLocalEffect(node: Node, stop: () => void): void {
  const stops = (node as any)[LOCAL_EFFECTS] as Set<() => void> | undefined;
  if (stops) {
    stops.delete(stop);
    if (stops.size === 0) {
      delete (node as any)[LOCAL_EFFECTS];
    }
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

// ── Shared Each Renderer ───────────────────────────────

/**
 * 在容器内执行列表渲染，管理锚点、key 增量更新和生命周期清理。
 * 每次调用都会创建新的锚点，stop 自注册到 LOCAL_EFFECTS 且具备自清理能力。
 */
function renderEach(
  container: HTMLElement,
  eachFn: any,
  childFn: (item: any, index: number) => any,
  keyFn?: any,
): { stop: () => void } {
  const anchor = document.createComment("each");
  container.appendChild(anchor);

  const nodeMap = new Map<any, Node>();

  const innerStop = effect(() => {
    const items = typeof eachFn === "function" ? eachFn() : eachFn;

    // ── 无 key：全量重建 ──
    if (!keyFn) {
      while (container.firstChild !== anchor) {
        disposeNode(container.firstChild!);
        container.removeChild(container.firstChild!);
      }
      if (Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          const node = childFn(items[i], i);
          if (node instanceof Node) {
            container.insertBefore(node, anchor);
            if (container.isConnected) triggerMount(node);
          }
        }
      }
      return;
    }

    // ── 有 key：增量更新 ──
    const newKeys = new Set<any>();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = keyFn(item, i);
      newKeys.add(key);

      const oldNode = nodeMap.get(key);
      if (oldNode) {
        disposeNode(oldNode);
        if (oldNode.parentNode) {
          oldNode.parentNode.removeChild(oldNode);
        }
      }

      const newNode = childFn(item, i);
      if (!(newNode instanceof Node)) continue;

      container.insertBefore(newNode, anchor);
      if (container.isConnected) triggerMount(newNode);

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

  // 自清理 stop：调用时从 LOCAL_EFFECTS 中移除自身
  const selfCleaningStop = () => {
    innerStop();
    removeLocalEffect(container, selfCleaningStop);
  };

  addLocalEffect(container, selfCleaningStop);

  return { stop: selfCleaningStop };
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
  keyFn?: any,
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

  // 当前 each 的 stop，when 切换时手动停止
  let eachStop: (() => void) | undefined;

  const stop = effect(() => {
    const show = Boolean(typeof whenFn === "function" ? whenFn() : whenFn);

    if (isLazy) {
      // 惰性求值：先调用，SKIP_UPDATE 时跳过 DOM 操作
      const result = children[0]();
      if (result === SKIP_UPDATE) return;

      // 非 SKIP_UPDATE：清空旧节点再渲染
      while (el.firstChild) {
        disposeNode(el.firstChild);
        el.removeChild(el.firstChild);
      }
      if (eachStop) {
        eachStop();
        eachStop = undefined;
      }
      if (!show) return;
      if (result instanceof Node) {
        el.appendChild(result);
        triggerMountIfConnected(el, result);
      }
      return;
    }

    // 非惰性路径：先清空再渲染
    while (el.firstChild) {
      disposeNode(el.firstChild);
      el.removeChild(el.firstChild);
    }
    if (eachStop) {
      eachStop();
      eachStop = undefined;
    }
    if (!show) return;

    if (hasEach) {
      // when + each 共存：when 优先，委托给 renderEach
      const childFn = children[0];
      const { stop: estop } = renderEach(el, eachFn, childFn, keyFn);
      eachStop = estop;
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

  const childFn = children[0];
  renderEach(el, eachFn, childFn, keyFn);

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
