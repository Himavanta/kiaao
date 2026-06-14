import {
  isArray,
  isFunction,
  isObject,
  isPromise,
  isSingle,
  isString,
} from "../utils/type-guards.ts";
// kiaao — SSR rendering functions

import { toValue } from "../reactive/core.ts";
import { SSR_COMPONENT, DIRECT_KEY } from "../reactive/types.ts";
import { isVoidElement, isMappingTable, renderSSRChild, ssr, isSSRSafe } from "./ssr-helpers.ts";
import type { SSRSafe } from "./ssr-helpers.ts";
import { serializeAttrs, stripDirectives } from "./ssr-serialize.ts";

// ── SSR Function Tag ──────────────────────────────────

/** SSR 模式下渲染函数标签（指令/SSR 变体/普通组件） */
function hSSRFunctionTag(tag: any, props: any, children: any[]): SSRSafe {
  // 指令在 SSR 模式下跳过执行，直接渲染 children
  if (tag[DIRECT_KEY]) {
    let inner = "";
    for (const child of children) {
      if (isArray(child)) {
        for (const c of child) inner += renderSSRChild(c);
      } else {
        inner += renderSSRChild(child);
      }
    }
    return ssr(inner);
  }

  const ssrVariant = (tag as any)[SSR_COMPONENT];
  if (ssrVariant) {
    const result = ssrVariant(props || {});
    if (isSSRSafe(result)) return result;
    if (isString(result)) return ssr(result);
    return ssr("");
  }

  // SSR 下传入空 context，生命周期不触发
  const context = { onMount: () => {}, onUnmount: () => {} };
  const result = tag(props || {}, context);
  if (isPromise(result)) {
    throw new Error("[kiaao] Async components are not supported in SSR.");
  }
  if (isSSRSafe(result)) return result;
  if (isString(result)) return ssr(result);
  if (isObject(result) && "html" in result) return ssr((result as any).html);
  return ssr("");
}

// ── SSR When Tag ───────────────────────────────────────

/** SSR 模式下渲染 when 指令 */
function hSSRWhenTag(tag: string, props: any, children: any[]): SSRSafe {
  const whenVal = toValue(props.when);
  const elseFn = props.else;
  const cleanProps = () => serializeAttrs(stripDirectives(props));

  // 映射表模式：children 为 { key: () => VNode }
  if (isSingle(children) && isMappingTable(children[0])) {
    const map = children[0];
    const branchFn = map[whenVal];
    if (branchFn) {
      const inner = renderSSRChild(branchFn());
      const attrs = cleanProps();
      if (isVoidElement(tag)) return ssr(`<${tag}${attrs} />`);
      return ssr(`<${tag}${attrs}>${inner}</${tag}>`);
    }
    if (elseFn) {
      const inner = renderSSRChild(elseFn());
      const attrs = cleanProps();
      if (isVoidElement(tag)) return ssr(`<${tag}${attrs} />`);
      return ssr(`<${tag}${attrs}>${inner}</${tag}>`);
    }
    const attrs = cleanProps();
    if (isVoidElement(tag)) return ssr(`<${tag}${attrs} />`);
    return ssr(`<${tag}${attrs}></${tag}>`);
  }

  // 布尔模式
  const truthy = Boolean(whenVal);
  if (!truthy && elseFn) {
    const inner = renderSSRChild(elseFn());
    const attrs = cleanProps();
    if (isVoidElement(tag)) return ssr(`<${tag}${attrs} />`);
    return ssr(`<${tag}${attrs}>${inner}</${tag}>`);
  }
  if (isVoidElement(tag)) {
    return truthy ? ssr(`<${tag}${cleanProps()} />`) : ssr("");
  }
  if (truthy) {
    return hSSR(tag, stripDirectives(props), children);
  }
  return ssr(`<${tag}${cleanProps()}></${tag}>`);
}

// ── hSSR ───────────────────────────────────────────────

export function hSSR(tag: any, props: any, children: any[]): SSRSafe {
  if (!isString(tag) && !isFunction(tag)) {
    return ssr("");
  }

  // 函数标签：指令 / SSR 变体 / 普通组件
  if (isFunction(tag)) {
    return hSSRFunctionTag(tag, props, children);
  }

  // 控制流指令
  if (props?.when !== undefined) {
    return hSSRWhenTag(tag, props, children);
  }

  if (props?.each !== undefined) {
    if (isVoidElement(tag)) {
      throw new Error(`each cannot be used on void element <${tag}>`);
    }
    const items = toValue(props.each);
    const attrs = serializeAttrs(stripDirectives(props));
    const childFn = children[0];
    let html = `<${tag}${attrs}>`;
    if (isArray(items) && isFunction(childFn)) {
      for (const [i, item] of items.entries()) {
        const childResult = childFn(item, i);
        html += renderSSRChild(childResult);
      }
    }
    html += `</${tag}>`;
    return ssr(html);
  }

  // 普通元素
  const attrs = serializeAttrs(props);
  if (isVoidElement(tag)) return ssr(`<${tag}${attrs} />`);

  let html = `<${tag}${attrs}>`;
  for (const child of children) {
    if (isArray(child)) {
      for (const c of child) html += renderSSRChild(c);
    } else {
      html += renderSSRChild(child);
    }
  }
  html += `</${tag}>`;
  return ssr(html);
}
