// kiaao — h() function: creates real DOM or dispatches to SSR mode
// Returns HResult { owner, nodes, cleanups } for explicit lifecycle management.

import { getAdapter } from "../adapter/index.ts";
import { normalizeChildren } from "../utils/helpers.ts";
import { handleComponent, type ComponentFunction } from "./component.ts";
import { createDirectiveContext, isDirective, type DirectiveFunction } from "./direct.ts";
import { createWhenElement, createEachElement } from "./directives.ts";
import { createOwner } from "./owner.ts";
import { processChildren } from "./process-children.ts";
import { setProps } from "./props.ts";
import {
  isBoolean,
  isFunction,
  isNotEmpty,
  isNotNil,
  isObject,
  isString,
  isDefined,
  isNil,
} from "./type-guards.ts";
import {
  type HResult,
  createHResult,
  isHResult,
  type NullableProps,
  type CleanupFn,
  type HostNode,
} from "./types.ts";

// ── Fragment ─────────────────────────────────────────

/** Fragment 组件：直接返回 children 数组，不创建任何包裹节点 */
export function Fragment(props: { children?: any }): any {
  return props.children;
}

// ── DOM Mode ──────────────────────────────────────────

function handleDomMode(tag: string, props: NullableProps = {}, children: any[]): HResult {
  const adapter = getAdapter();

  // 控制流指令（需要用 any 解构可能不存在的指令属性）
  const p = props as any;
  if (isDefined(p?.when)) {
    const { when, each, key, else: elseFn, ...rest } = p;
    const orphanCleanups: CleanupFn[] = [];
    const el = createWhenElement({
      tag,
      props: rest,
      children,
      whenFn: when,
      eachFn: each,
      keyFn: key,
      elseFn,
      cleanups: orphanCleanups,
    });
    return createHResult(null, [el], orphanCleanups);
  }

  if (isDefined(p?.each)) {
    const { each, key, ...rest } = p;
    const orphanCleanups: CleanupFn[] = [];
    const el = createEachElement({
      tag,
      props: rest,
      children,
      eachFn: each,
      keyFn: key,
      cleanups: orphanCleanups,
    });
    return createHResult(null, [el], orphanCleanups);
  }

  // 普通元素
  const el: any = adapter.createElement(tag);
  const orphanCleanups: CleanupFn[] = [];
  setProps(el, isObject(props) ? props : null, orphanCleanups);
  const { nodes: childNodes, cleanups: childCleanups } = processChildren(children);
  for (const node of childNodes) {
    adapter.append(el, node);
  }
  return createHResult(null, [el], [...orphanCleanups, ...childCleanups]);
}

// ── Directive Mode ────────────────────────────────────

function handleDirectiveMode(
  tag: DirectiveFunction,
  props: NullableProps = {},
  children: any[] = [],
): HResult {
  const dirProps = { ...props };
  if (isNotEmpty(children)) {
    dirProps.children = normalizeChildren(children);
  }

  // 指令创建自己的 Owner，通过 HResult 由父组件接管
  const owner = createOwner();

  // 解包 children 中的 HResult
  const flatChildren = children.flat(Infinity);
  const allNodes: HostNode[] = [];

  for (const child of flatChildren) {
    if (isHResult(child)) {
      allNodes.push(...child.nodes);
    } else if (getAdapter().isNode(child)) {
      allNodes.push(child);
    }
  }

  for (const child of allNodes) {
    if (getAdapter().isNode(child)) {
      const ctx = createDirectiveContext(owner);
      (tag as DirectiveFunction)(child as any, dirProps, ctx);
    } else if (process.env.NODE_ENV !== "production") {
      if (isNotNil(child) && !isBoolean(child)) {
        console.warn("[kiaao] directive skipped non-Element child:", child);
      }
    }
  }

  return createHResult(owner, allNodes);
}

// ── h() ────────────────────────────────────────────────

export function h(tag: DirectiveFunction, props?: NullableProps, ...children: any[]): HResult;
export function h(
  tag: string | ComponentFunction,
  props?: NullableProps,
  ...children: any[]
): HResult;
export function h(tag: any, props?: NullableProps, ...children: any[]): HResult {
  if (isNil(props)) props = undefined;
  if (!isString(tag) && !isFunction(tag)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[kiaao] invalid tag: ${String(tag)}. Expected a string or function.`);
    }
    return createHResult(null, [getAdapter().createComment("") as Node]);
  }

  if (isFunction(tag)) {
    if (isDirective(tag)) {
      return handleDirectiveMode(tag, props, children);
    }
    return handleComponent(tag as ComponentFunction, props, children);
  }

  return handleDomMode(tag, props, children);
}
