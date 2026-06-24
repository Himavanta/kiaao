// kiaao — h() function: creates real DOM or dispatches to SSR mode
// Returns HResult { owner, nodes, cleanups } for explicit lifecycle management.

import { getAdapter, type HResult, createHResult, isHResult, type NullableProps } from "./types.ts";
import { createOwner } from "./owner.ts";
import { handleComponent, type ComponentFunction } from "./component.ts";
import { processChildren } from "./process-children.ts";
import { setProps } from "../dom/props.ts";
import { createDirectiveContext, isDirective, type DirectiveFunction } from "./direct.ts";
import { normalizeChildren } from "../utils/helpers.ts";
import {
  isBoolean,
  isElement,
  isFunction,
  isNotEmpty,
  isNode,
  isNotNil,
  isObject,
  isString,
  isDefined,
  isNil,
} from "../utils/type-guards.ts";
import { createWhenElement, createEachElement } from "./directives.ts";

// ── Fragment ─────────────────────────────────────────

/** Fragment 组件：直接返回 children 数组，不创建任何包裹节点 */
export function Fragment(props: { children?: any }): any {
  return props.children;
}

// ── DOM Mode ──────────────────────────────────────────

function handleDomMode(tag: string, props: any, children: any[]): HResult {
  const adapter = getAdapter();

  // 控制流指令
  if (isDefined(props?.when)) {
    const { when, each, key, else: elseFn, ...rest } = props;
    const orphanCleanups: (() => void)[] = [];
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

  if (isDefined(props?.each)) {
    const { each, key, ...rest } = props;
    const orphanCleanups: (() => void)[] = [];
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
  const orphanCleanups: (() => void)[] = [];
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
  const allNodes: Node[] = [];

  for (const child of flatChildren) {
    if (isHResult(child)) {
      allNodes.push(...child.nodes);
    } else if (isNode(child)) {
      allNodes.push(child);
    }
  }

  for (const child of allNodes) {
    if (isElement(child)) {
      const ctx = createDirectiveContext(owner);
      (tag as DirectiveFunction)(child, dirProps, ctx);
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
