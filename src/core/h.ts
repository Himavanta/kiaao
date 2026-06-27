// kiaao — h() function: creates real DOM or dispatches to SSR mode
// Returns HResult { owner, nodes, cleanups } for explicit lifecycle management.

import { getAdapter } from "../adapter/index.ts";
import {
  handleComponent,
  nestBind,
  bindSignalToTextNode,
  type ComponentFunction,
} from "./component.ts";
import { createDirectiveContext, isDirective, type DirectiveFunction } from "./direct.ts";
import { createOwner } from "./owner.ts";
import { setProps } from "./props.ts";
import { isUse } from "./signal.ts";
import { normalizeChildren, isArray } from "./type-guards.ts";
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

  // 普通元素
  const el: any = adapter.el(tag);
  const orphanCleanups: CleanupFn[] = [];
  setProps(el, isObject(props) ? props : null, orphanCleanups);
  // 将子节点展开并 append 到元素（nestBind 只连 owner，不重复 append）
  for (const child of children) {
    processChild(child, el, orphanCleanups);
  }
  return createHResult(null, [el], [...orphanCleanups], children);
}

/** 展开单个子节点并 append 到父元素 */
function processChild(child: any, parentEl: HostNode, cleanups: CleanupFn[]): void {
  const adapter = getAdapter();
  if (child == null) return;
  if (isArray(child)) {
    for (const c of child) processChild(c, parentEl, cleanups);
    return;
  }
  if (isHResult(child)) {
    const [parentNode] = child.nodes;
    if (parentNode) {
      // childResults 存在时重建子节点（处理共享 HResult 的 dispose 后重建）
      if (child.childResults) {
        const adapter = getAdapter();
        adapter.clear(parentNode);
        for (const sub of child.childResults) processChild(sub, parentNode, cleanups);
      }
      adapter.append(parentEl, parentNode);
    }
    if (child.cleanups) cleanups.push(...child.cleanups);
    return;
  }
  if (adapter.isNode(child)) {
    adapter.append(parentEl, child);
    return;
  }
  if (isUse(child)) {
    adapter.append(parentEl, bindSignalToTextNode(child, cleanups));
    return;
  }
  adapter.append(parentEl, adapter.text(String(child)));
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

  return handleDomMode(tag, props, children);
}
