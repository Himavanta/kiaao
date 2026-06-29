// kiaao — h() function: creates real DOM or dispatches to SSR mode
// Returns HResult { owner, nodes, cleanups } for explicit lifecycle management.

import { getAdapter } from "../adapter/index.ts";
import { handleComponent, nestBind, toHResult, type ComponentFunction } from "./component.ts";
import { createDirectiveContext, isDirective, type DirectiveFunction } from "./direct.ts";
import { createOwner } from "./owner.ts";
import { setProps } from "./props.ts";
import {
  isBoolean,
  isEmpty,
  isFunction,
  isNil,
  isNotEmpty,
  isNotNil,
  isObject,
  isString,
  normalizeChildren,
} from "./type-guards.ts";
import {
  createHResult,
  type CleanupFn,
  type HostNode,
  type HResult,
  type NullableProps,
  type Owner,
} from "./types.ts";

// ── Fragment ─────────────────────────────────────────

/** Fragment 组件：直接返回 children 数组，不创建任何包裹节点 */
export function Fragment(props: { children?: any }): any {
  return props.children;
}

// ── DOM Mode ──────────────────────────────────────────

function handleDomMode(tag: string, props: NullableProps = {}, children: any[]): HResult {
  const adapter = getAdapter();
  const el = adapter.el(tag);
  const pending: Owner[] = [];
  const cleanups: CleanupFn[] = [];
  const allNodes: HostNode[] = [el];

  const propCleanups: CleanupFn[] = [];
  setProps(el, isObject(props) ? props : null, propCleanups);
  cleanups.push(...propCleanups);

  for (const child of children.flat()) {
    const hr = toHResult(child);
    if (hr.owner) {
      pending.push(hr.owner);
    } else {
      pending.push(...hr.pending);
      cleanups.push(...hr.cleanups);
    }
    for (const node of hr.nodes) {
      adapter.append(el, node);
      allNodes.push(node);
    }
  }

  return createHResult(null, allNodes, pending, cleanups);
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

  // 使用 nestBind 统一处理子结果树，确保子组件 Owner 连接正确
  const flatChildren = children.flat(Infinity);
  const allNodes: HostNode[] = [];

  for (const child of flatChildren) {
    allNodes.push(...nestBind(child, owner));
  }

  for (const child of allNodes) {
    if (getAdapter().isNode(child)) {
      const ctx = createDirectiveContext(owner);
      try {
        (tag as DirectiveFunction)(child as any, dirProps, ctx);
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[kiaao] directive error:", e);
        }
      }
    } else if (process.env.NODE_ENV !== "production") {
      if (isNotNil(child) && !isBoolean(child)) {
        console.warn("[kiaao] directive skipped non-Element child:", child);
      }
    }
  }

  return createHResult(owner, allNodes, [], []);
}

// ── h() ────────────────────────────────────────────────

export function h(tag: DirectiveFunction, props?: NullableProps, ...children: any[]): HResult;
export function h<P>(tag: ComponentFunction<P>, props?: P | null, ...children: any[]): HResult;
export function h(tag: string, props?: NullableProps, ...children: any[]): HResult;
export function h(tag: any, props?: NullableProps, ...children: any[]): HResult {
  if (isNil(props)) props = undefined;
  if (!isString(tag) && !isFunction(tag)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[kiaao] invalid tag: ${String(tag)}. Expected a string or function.`);
    }
    return createHResult(null, [getAdapter().comment("")], [], []);
  }

  if (isString(tag) && isEmpty(tag)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[kiaao] empty string tag, falling back to comment node");
    }
    return createHResult(null, [getAdapter().comment("")], [], []);
  }

  if (isFunction(tag)) {
    if (isDirective(tag)) {
      return handleDirectiveMode(tag, props, children);
    }
    return handleComponent(tag as ComponentFunction, props, children);
  }

  const result = handleDomMode(tag, props, children);
  return result;
}
