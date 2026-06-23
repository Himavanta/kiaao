// kiaao — h() function: creates real DOM or dispatches to SSR mode
// Component mode creates Owners, DOM mode uses adapter, Directive mode skips component instance.
// Fragment is inlined — returns children array without container.

import { getAdapter, type Children } from "./types.ts";
import { getRenderMode } from "./signal.ts";
import { handleComponent } from "./component.ts";
import { processChildren } from "./process-children.ts";
import { setProps } from "../dom/props.ts";
import { createDirectiveContext, isDirective } from "../core/direct.ts";
import { normalizeChildren } from "../utils/helpers.ts";
import {
  isBoolean,
  isElement,
  isFunction,
  isNotEmpty,
  isNotNil,
  isObject,
  isString,
} from "../utils/type-guards.ts";
import type { ComponentFunction } from "./component.ts";
import type { DirectiveFunction } from "./direct.ts";

// ── Fragment ─────────────────────────────────────────

/** Fragment 组件：直接返回 children 数组，不创建任何包裹节点 */
export function Fragment(props: { children?: any }): any {
  return props.children;
}

// ── DOM Mode ──────────────────────────────────────────

function handleDomMode(tag: string, props: any, children: any[]): Node[] {
  const adapter = getAdapter();

  // 控制流指令
  if (props?.when !== undefined) {
    const { when, each, key, else: elseFn, ...rest } = props;
    const result = createWhenElement({
      tag,
      props: rest,
      children,
      whenFn: when,
      eachFn: each,
      keyFn: key,
      elseFn,
    });
    return [result];
  }

  if (props?.each !== undefined) {
    const { each, key, ...rest } = props;
    const result = createEachElement(tag, rest, children, each, key);
    return [result];
  }

  // 普通元素
  const el: any = adapter.createElement(tag);
  setProps(el, isObject(props) ? props : null);
  const childNodes = processChildren(children);
  for (const node of childNodes) {
    adapter.append(el, node);
  }
  return [el];
}

// ── Directive Mode ────────────────────────────────────

/** 指令模式：遍历 children，对每个 Element 调用指令函数 */
function handleDirectiveMode(tag: DirectiveFunction, props: any, children: any[]): Node[] {
  const dirProps = { ...props };
  if (isNotEmpty(children)) {
    dirProps.children = normalizeChildren(children);
  }

  const flatChildren = children.flat(Infinity);

  for (const child of flatChildren) {
    if (isElement(child)) {
      const ctx = createDirectiveContext(child);
      (tag as DirectiveFunction)(child, dirProps, ctx);
    } else if (process.env.NODE_ENV !== "production") {
      if (isNotNil(child) && !isBoolean(child)) {
        console.warn("[kiaao] directive skipped non-Element child:", child);
      }
    }
  }

  return flatChildren as Node[];
}

// ── h() ────────────────────────────────────────────────

// Type overloads
export function h(tag: DirectiveFunction, props?: any, ...children: any[]): Children;
export function h(tag: string | ComponentFunction, props?: any, ...children: any[]): Children;
export function h(tag: any, props?: any, ...children: any[]): Children {
  // SSR mode: not yet supported in new h() - Phase 6 will add SSR adapter
  if (getRenderMode() === "ssr") {
    console.warn("[kiaao] SSR mode not yet supported in new h() - Phase 6");
    return [getAdapter().createComment("ssr-not-ready") as Node];
  }

  // Invalid tag → 注释占位
  if (!isString(tag) && !isFunction(tag)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[kiaao] invalid tag: ${String(tag)}. Expected a string or function.`);
    }
    return [getAdapter().createComment("") as Node];
  }

  // 函数标签：指令 / 组件
  if (isFunction(tag)) {
    if (isDirective(tag)) {
      return handleDirectiveMode(tag, props, children);
    }
    // 组件模式
    return handleComponent(tag as ComponentFunction, props, children);
  }

  // 字符串标签：DOM 模式
  return handleDomMode(tag, props, children);
}

// ── Import new Owner-based directives ─────────────────

import { createWhenElement, createEachElement } from "./directives.ts";
