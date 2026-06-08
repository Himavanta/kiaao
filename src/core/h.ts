// kiaao — h() function: creates real DOM or dispatches to hSSR in SSR mode

import { IS_REACTIVE, INSTANCE_KEY, DISPOSE_KEY } from "./types.ts";
import { pushComponent, popComponent, createComponentInstance, getRenderMode } from "./runtime.ts";
import { createDisposeFn } from "./lifecycle.ts";
import { hSSR } from "./ssr-helpers.ts";
import { setProps } from "./props.ts";
import { processChildren } from "./process-children.ts";
import { createWhenElement, createEachElement } from "./directives.ts";

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
