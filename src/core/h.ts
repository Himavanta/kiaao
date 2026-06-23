// kiaao — h() function: creates real DOM or dispatches to SSR mode
// Component mode creates Owners, DOM mode uses adapter, Directive mode skips component instance.
// Fragment is inlined — returns children array without container.

import { getAdapter, type Children } from "./types.ts";
import { getRenderMode } from "./signal.ts";
import { handleComponent } from "./component.ts";
import { processChildren } from "./process-children.ts";
import { setProps } from "../dom/props.ts";
import { createDirectiveContext, isDirective } from "../dom/directive.ts";
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
import type { DirectiveFunction } from "../dom/directive.ts";

// ── Fragment ─────────────────────────────────────────

/** Fragment 组件：直接返回 children 数组，不创建任何包裹节点 */
export function Fragment(props: { children?: any }): any {
  return props.children;
}

// ── DOM Mode ──────────────────────────────────────────

/**
 * DOM 模式：创建原生 DOM 元素，设置属性，处理子节点。
 * 通过 RenderAdapter 操作，不直接访问浏览器 DOM API。
 */
function handleDomMode(tag: string, props: any, children: any[]): Node[] {
  const adapter = getAdapter();

  // 检查控制流指令
  if (props?.when !== undefined) {
    // when 指令：暂由旧实现处理（Phase 4 改造为 Owner 管理）
    // 返回数组以通过类型检查
    const { when, each, key, else: elseFn, ...rest } = props;
    const result = createWhenElementFallback({
      tag,
      props: rest,
      children,
      whenFn: when,
      eachFn: each,
      keyFn: key,
      elseFn,
    });
    return Array.isArray(result) ? result : [result];
  }

  if (props?.each !== undefined) {
    const { each, key, ...rest } = props;
    const result = createEachElementFallback(tag, rest, children, each, key);
    return Array.isArray(result) ? result : [result];
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

// ── Fallback: when/each (to be replaced in Phase 4) ──

// 临时导入旧实现，保持 Phase 3 可运行
import { createWhenElement } from "../dom/when.ts";
import { createEachElement } from "../dom/each.ts";

function createWhenElementFallback(options: any): any {
  return createWhenElement(options);
}

function createEachElementFallback(
  tag: string,
  props: any,
  children: any[],
  each: any,
  key: any,
): any {
  return createEachElement(tag, props, children, each, key);
}
