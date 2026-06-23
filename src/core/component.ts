// kiaao — Component model with Owner lifecycle
// handleComponent, createContext, handleAsyncComponent

import { createOwner, disposeOwner, triggerMount, currentOwner } from "./owner.ts";
import { registerSignalStop } from "./signal.ts";
import { REACTIVE, type Children } from "./types.ts";
import { getAdapter } from "./types.ts";
import { isNode, isPromise } from "../utils/type-guards.ts";
import { normalizeChildren } from "../utils/helpers.ts";
import type { UseFunction } from "./signal.ts";

// ── Context ───────────────────────────────────────────

export interface Context {
  onMount: (fn: () => void | Promise<void>) => void;
  onUnmount: (fn: () => void | Promise<void>) => void;
  use: UseFunction;
}

export type ComponentFunction<P = any> = (
  props: P,
  context: Context,
) => Children | Promise<Children>;

// ── Safe Signal ──────────────────────────────────────

function createSafeSignal() {
  const noop = () => {};
  (noop as any)[REACTIVE] = {
    value: undefined,
    subs: new Set(),
    set: noop,
    stop: () => {},
  };
  return [() => undefined, noop];
}

// ── createContext ─────────────────────────────────────

function createContextUse(owner: any): UseFunction {
  return ((...args: any[]): any => {
    if (owner.disposed) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[kiaao] context.use called after component disposed");
      }
      return createSafeSignal();
    }
    return registerSignalStop(args, (stop: () => void) => {
      owner.cleanups.push(stop);
    });
  }) as UseFunction;
}

export function createContext(owner: any): Context {
  return {
    onMount: (fn) => {
      if (owner.disposed) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[kiaao] onMount called after component disposed");
        }
        return;
      }
      owner.mountCallbacks.push(fn);
    },
    onUnmount: (fn) => {
      if (owner.disposed) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[kiaao] onUnmount called after component disposed");
        }
        return;
      }
      owner.unmountCallbacks.push(fn);
    },
    use: createContextUse(owner),
  };
}

// ── handleAsyncComponent ──────────────────────────────

/**
 * 处理异步组件：创建占位注释节点，Promise resolve 后替换为真实节点。
 * Owner 在组件函数执行前已创建，context 已绑定。
 */
function handleAsyncComponent(promise: Promise<any>, owner: any): Node[] {
  const adapter = getAdapter();
  const placeholder = adapter.createComment("async") as Comment;

  // 注册占位节点到 Owner
  owner.elements.add(placeholder);

  promise
    .then((realDOM: any) => {
      if (owner.disposed) return;

      if (!isNode(realDOM)) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[kiaao] async component resolved with non-Node value:", realDOM);
        }
        return;
      }

      // 从 elements 中移除占位节点，添加真实节点
      owner.elements.delete(placeholder);
      owner.elements.add(realDOM);

      // 替换 DOM
      adapter.replaceWith(placeholder, realDOM);

      // 触发挂载
      triggerMount(owner);
    })
    .catch((err: Error) => {
      if (owner.disposed) return;
      console.error("[kiaao] async component error:", err);
    });

  return [placeholder];
}

// ── handleComponent ───────────────────────────────────

/**
 * 处理组件模式调用（函数 tag）。
 *
 * 流程：
 * 1. 创建 Owner
 * 2. 确定父 Owner（从 currentOwner）
 * 3. 创建与 Owner 绑定的 context
 * 4. 设置 currentOwner，执行组件函数
 * 5. 恢复 currentOwner
 * 6. 异步组件 → handleAsyncComponent
 * 7. 同步组件 → 注册节点到 Owner，返回 Node[]
 */
export function handleComponent(
  tag: ComponentFunction,
  props: Record<string, any> | null | undefined,
  children: any[],
): Node[] {
  const owner: any = createOwner();

  // 建立父子关系
  const parentOwner = currentOwner.get();
  if (parentOwner) {
    parentOwner.children.push(owner);
    owner.parent = parentOwner;
  }

  // 创建 context
  const context = createContext(owner);

  // 合成组件 props
  let compProps: Record<string, any> = props ?? {};
  if (children.length > 0) {
    compProps = { ...compProps, children: normalizeChildren(children) };
  }

  // 执行组件函数
  const prevOwner = currentOwner.get();
  currentOwner.set(owner);

  let result: any;
  try {
    result = (tag as any)(compProps, context);
  } catch (e) {
    console.error("[kiaao] component error:", e);
    currentOwner.set(prevOwner);
    disposeOwner(owner);
    return [getAdapter().createComment("component error") as Comment];
  }

  currentOwner.set(prevOwner);

  // 异步组件
  if (isPromise(result)) {
    return handleAsyncComponent(result, owner);
  }

  // 同步组件
  const nodes = Array.isArray(result) ? result.flat(Infinity) : [result];
  for (const n of nodes) {
    if (isNode(n)) owner.elements.add(n);
  }

  // 单节点展开
  if (nodes.length === 1) return nodes;
  return nodes;
}
