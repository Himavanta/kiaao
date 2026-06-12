// kiaao v4 — h() function: creates real DOM or dispatches to hSSR in SSR mode
// Component mode supports both sync and async components via context-based lifecycle.

import { getRenderMode } from "../reactive/core.ts";
import { isUse } from "../reactive/core.ts";
import { INSTANCE_KEY, DISPOSE_KEY, INITIALIZED_KEY, DISPOSED_KEY } from "../reactive/types.ts";
import { createComponentInstance, createDisposeFn, safeCall, triggerMount } from "./component.ts";
import { hSSR } from "./ssr-helpers.ts";
import { setProps } from "./props.ts";
import { processChildren } from "./process-children.ts";
import { createWhenElement, createEachElement } from "./directives.ts";
import { createElement, createComment } from "./dom-utils.ts";

// ── ComponentContext ───────────────────────────────────

export interface ComponentContext {
  onMount: (fn: () => void | Promise<void>) => void;
  onUnmount: (fn: () => void | Promise<void>) => void;
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
    return createComment("") as unknown as Element;
  }

  // ── 组件模式 ──
  if (typeof tag === "function") {
    const instance = createComponentInstance();

    const context: ComponentContext = {
      onMount: (fn) => {
        if ((instance as any)[DISPOSED_KEY]) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[kiaao] onMount called after component disposed");
          }
          return;
        }
        if ((instance as any)[INITIALIZED_KEY]) {
          // 已挂载，立即执行
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
    };

    let compProps = props ?? {};
    if (children.length > 0) {
      compProps = { ...compProps, children: children.length === 1 ? children[0] : children };
    }

    const result = tag(compProps, context);

    // —— 异步组件 ——
    if (result instanceof Promise) {
      const wrapper = createElement("div") as HTMLElement;
      wrapper.style.display = "contents";
      (wrapper as any)[DISPOSE_KEY] = createDisposeFn(instance);

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

    // —— 同步组件 ——
    if (result instanceof Node) {
      (result as any)[INSTANCE_KEY] = instance;
      (result as any)[DISPOSE_KEY] = createDisposeFn(instance);
      return result as unknown as Element;
    } else {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[kiaao] component returned non-Node value:", result);
      }
      const placeholder = createComment("component returned invalid value");
      (placeholder as any)[INSTANCE_KEY] = instance;
      (placeholder as any)[DISPOSE_KEY] = createDisposeFn(instance);
      return placeholder as unknown as Element;
    }
  }

  // ── DOM 模式：控制流指令 ──
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
  if (props?.each !== undefined) {
    const { each, key, ...rest } = props;
    return createEachElement(tag, rest, children, each, key);
  }

  // ── DOM 模式：普通元素 ──
  const el = createElement(tag);

  setProps(el, props && typeof props === "object" && !isUse(props) ? props : null);

  const childNodes = processChildren(children);

  for (const node of childNodes) {
    el.append(node);
  }

  return el;
}
