// kiaao v4 — h() function: creates real DOM or dispatches to hSSR in SSR mode
// Component mode supports both sync and async components via context-based lifecycle.

import { getRenderMode, isUse, use as globalUse } from "../reactive/core.ts";
import { REACTIVE, DISPOSE_KEY, INITIALIZED_KEY, DISPOSED_KEY } from "../reactive/types.ts";
import type { UseFunction } from "../reactive/core.ts";
import type { ComponentInstance } from "../reactive/types.ts";
import {
  createComponentInstance,
  createDisposeFn,
  safeCall,
  triggerMount,
  attachInstance,
} from "./component.ts";
import { hSSR } from "./ssr-helpers.ts";
import { setProps } from "./props.ts";
import { processChildren } from "./process-children.ts";
import { createWhenElement, createEachElement } from "./directives.ts";
import { createElement, createComment } from "./dom-utils.ts";
import { isDirective, createDirectiveContext } from "./directive.ts";
import type { DirectiveFunction } from "./directive.ts";

// ── Context ───────────────────────────────────

export interface Context {
  onMount: (fn: () => void | Promise<void>) => void;
  onUnmount: (fn: () => void | Promise<void>) => void;
  use: UseFunction;
}

export type ComponentFunction<P = any> = (props: P, context: Context) => Node | Promise<Node>;

// ── Safe Signal ───────────────────────────────────────
// 组件已销毁后返回的无操作信号

function createSafeSignal(): [() => undefined, (v?: any) => void] {
  const noop = () => {};
  (noop as any)[REACTIVE] = { value: undefined, subs: new Set(), set: noop, stop: () => {} };
  return [() => undefined, noop];
}

// ── Component Use Creator ────────────────────────────

/** 创建组件级的 use 函数，信号在组件卸载时自动清理 */
function createContextUse(instance: ComponentInstance): UseFunction {
  return ((...args: any[]): any => {
    if ((instance as any)[DISPOSED_KEY]) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[kiaao] context.use called after component disposed");
      }
      return createSafeSignal();
    }

    const result = (globalUse as (...a: any[]) => any)(...args);
    const getter = result[0];

    // 引用已有信号，不注册清理
    if (args.length === 1 && isUse(args[0]) && result[0] === args[0]) {
      return result;
    }

    // 创建了新资源，注册 stop 到组件实例
    const stop = (getter as any)[REACTIVE].stop;
    if (typeof stop === "function") {
      instance.unmountCallbacks.push(stop);
    }
    return result;
  }) as UseFunction;
}

// ── Context Creator ─────────────────────────────────

function createContext(instance: ComponentInstance): Context {
  return {
    onMount: (fn) => {
      if ((instance as any)[DISPOSED_KEY]) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[kiaao] onMount called after component disposed");
        }
        return;
      }
      if ((instance as any)[INITIALIZED_KEY]) {
        safeCall(fn, "onMount");
      } else {
        instance.mountCallbacks.push(fn);
      }
    },
    onUnmount: (fn) => {
      if ((instance as any)[DISPOSED_KEY]) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[kiaao] onUnmount called after component disposed");
        }
        return;
      }
      instance.unmountCallbacks.push(fn);
    },
    use: createContextUse(instance),
  };
}

// ── Directive Mode ────────────────────────────────────

/** 指令模式：遍历 children，对每个 Element 调用指令函数 */
function handleDirectiveMode(tag: any, props: any, children: any[]): Element {
  const dirProps = { ...props };
  if (children.length > 0) {
    dirProps.children = children.length === 1 ? children[0] : children;
  }

  const flatChildren = children.flat(Infinity);

  for (const child of flatChildren) {
    if (child instanceof Element) {
      const ctx = createDirectiveContext(child);
      (tag as DirectiveFunction)(child, dirProps, ctx);
    } else if (process.env.NODE_ENV !== "production") {
      if (child != null && typeof child !== "boolean") {
        console.warn("[kiaao] directive skipped non-Element child:", child);
      }
    }
  }

  // 单子节点展开：单个 Node 直接返回，保持消费者兼容性
  if (flatChildren.length === 1 && flatChildren[0] instanceof Node) {
    return flatChildren[0] as unknown as Element;
  }
  return children as unknown as Element;
}

// ── Async Component Result ────────────────────────────

/** 处理异步组件：创建 wrapper，等待 Promise resolve 后挂载子节点 */
function handleAsyncComponentResult(result: Promise<any>, instance: ComponentInstance): Element {
  const wrapper = createElement("div") as HTMLElement;
  wrapper.style.display = "contents";
  (wrapper as any)[DISPOSE_KEY] = new Set<() => void>();
  (wrapper as any)[DISPOSE_KEY].add(createDisposeFn(instance));

  let disposed = false;
  instance.unmountCallbacks.push(() => {
    disposed = true;
  });

  result
    .then((realDOM: any) => {
      if (disposed) return;

      if (!(realDOM instanceof Node)) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[kiaao] async component resolved with non-Node value:", realDOM);
        }
        realDOM = createComment("async component resolved with invalid value");
      }

      wrapper.appendChild(realDOM as Node);

      // 先递归触发子树中已就位子组件的 onMount
      triggerMount(realDOM);

      // 再触发当前异步组件自身的 onMount
      if (!(instance as any)[INITIALIZED_KEY]) {
        (instance as any)[INITIALIZED_KEY] = true;
        instance.mountCallbacks.forEach((fn) => safeCall(fn, "onMount"));
      }
    })
    .catch((err: Error) => {
      if (disposed) return;
      console.error("[kiaao] async component error:", err);
    });

  return wrapper as unknown as Element;
}

// ── Sync Component Result ─────────────────────────────

/** 处理同步组件结果：Node / 多根数组 / 非法值 */
function handleSyncComponentResult(result: any, instance: ComponentInstance): Element {
  // Node → 直接关联实例
  if (result instanceof Node) {
    attachInstance(result, instance);
    return result as unknown as Element;
  }

  // 指令/多根元素返回值 → Fragment 包裹
  if (Array.isArray(result)) {
    const wrapper = createElement("div") as HTMLElement;
    wrapper.style.display = "contents";
    attachInstance(wrapper, instance);
    for (const child of result) {
      if (child instanceof Node) {
        wrapper.appendChild(child);
      }
    }
    return wrapper as unknown as Element;
  }

  // 非法值 → 注释占位
  if (process.env.NODE_ENV !== "production") {
    console.warn("[kiaao] component returned non-Node value:", result);
  }
  const placeholder = createComment("component returned invalid value");
  attachInstance(placeholder, instance);
  return placeholder as unknown as Element;
}

// ── DOM Mode ──────────────────────────────────────────

/** DOM 模式：when/each 控制流指令或普通元素创建 */
function handleDomMode(tag: string, props: any, children: any[]): Element {
  // when 指令
  if (props?.when !== undefined) {
    const { when, each, key, else: elseFn, ...rest } = props;
    return createWhenElement({
      tag,
      props: rest,
      children,
      whenFn: when,
      eachFn: each,
      keyFn: key,
      elseFn,
    });
  }

  // each 指令
  if (props?.each !== undefined) {
    const { each, key, ...rest } = props;
    return createEachElement(tag, rest, children, each, key);
  }

  // 普通元素
  const el = createElement(tag);
  setProps(el, props && typeof props === "object" && !isUse(props) ? props : null);
  const childNodes = processChildren(children);
  for (const node of childNodes) {
    el.append(node);
  }
  return el;
}

// ── h() ────────────────────────────────────────────────

export function h(
  tag: string | ((props: any, context?: any) => any),
  props?: any,
  ...children: any[]
): Element {
  // SSR mode: delegate to hSSR
  if (getRenderMode() === "ssr") {
    return hSSR(tag, props, children) as any;
  }

  // 无效 tag → 注释占位节点
  if (typeof tag !== "string" && typeof tag !== "function") {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        new Error(`[kiaao] invalid tag: ${String(tag)}. Expected a string or function.`),
      );
    }
    return createComment("") as unknown as Element;
  }

  // 函数标签：指令 / 组件
  if (typeof tag === "function") {
    // 指令模式
    if (isDirective(tag)) {
      return handleDirectiveMode(tag, props, children);
    }

    // 组件模式
    const instance = createComponentInstance();
    const context = createContext(instance);

    let compProps = props ?? {};
    if (children.length > 0) {
      compProps = { ...compProps, children: children.length === 1 ? children[0] : children };
    }

    const result = tag(compProps, context);

    // 异步组件
    if (result instanceof Promise) {
      return handleAsyncComponentResult(result, instance);
    }

    // 同步组件
    return handleSyncComponentResult(result, instance);
  }

  // DOM 模式
  return handleDomMode(tag, props, children);
}
