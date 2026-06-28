// kiaao — h() function: creates real DOM or dispatches to SSR mode
// Returns HResult { owner, nodes, cleanups } for explicit lifecycle management.

import { getAdapter } from "../adapter/index.ts";
import { handleComponent, nestBind, type ComponentFunction } from "./component.ts";
import { createDirectiveContext, isDirective, type DirectiveFunction } from "./direct.ts";
import { createOwner } from "./owner.ts";
import { setProps } from "./props.ts";
import { normalizeChildren } from "./type-guards.ts";
import {
  isBoolean,
  isFunction,
  isEmpty,
  isNotEmpty,
  isNotNil,
  isObject,
  isString,
  isNil,
} from "./type-guards.ts";
import {
  type HResult,
  createHResult,
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

  // 普通元素
  const el: any = adapter.el(tag);
  const owner = createOwner({ lightweight: true });
  owner.elements.add(el);
  const orphanCleanups: CleanupFn[] = [];
  setProps(el, isObject(props) ? props : null, orphanCleanups);
  // 子节点由 nestBind 统一处理，handleDomMode 只创建元素
  return createHResult(owner, [el], [...orphanCleanups], children);
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

  return createHResult(owner, allNodes);
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
    return createHResult(null, [getAdapter().comment("")]);
  }

  if (isString(tag) && isEmpty(tag)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[kiaao] empty string tag, falling back to comment node");
    }
    return createHResult(null, [getAdapter().comment("")]);
  }

  if (isFunction(tag)) {
    if (isDirective(tag)) {
      return handleDirectiveMode(tag, props, children);
    }
    return handleComponent(tag as ComponentFunction, props, children);
  }

  const result = handleDomMode(tag, props, children);
  // 处理独立 h() 调用的子节点（组件内由 handleComponent 的 nestBind 处理）
  nestBind(result, result.owner!);
  // 清空 childResults，防止组件内 nestBind 重复处理
  (result as any).childResults = null;
  return result;
}
