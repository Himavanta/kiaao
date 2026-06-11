// kiaao v4 — h() function: creates real DOM or dispatches to hSSR in SSR mode

import { getRenderMode } from "../reactive/core.ts";
import { isUse } from "../reactive/core.ts";
import { INSTANCE_KEY, DISPOSE_KEY } from "../reactive/types.ts";
import {
  pushComponent,
  popComponent,
  createComponentInstance,
  createDisposeFn,
} from "./component.ts";
import { hSSR } from "./ssr-helpers.ts";
import { setProps } from "./props.ts";
import { processChildren } from "./process-children.ts";
import { createWhenElement, createEachElement } from "./directives.ts";
import { createElement } from "./dom-utils.ts";

export function h(tag: string | ((props: any) => any), props?: any, ...children: any[]): Element {
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

    return result as Element;
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

  // 过滤掉响应式 props（交给上面的 each/when 路径处理）
  setProps(el, props && typeof props === "object" && !isUse(props) ? props : null);

  const childNodes = processChildren(children);

  for (const node of childNodes) {
    el.append(node);
  }

  return el;
}
