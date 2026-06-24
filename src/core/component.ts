// kiaao — Component model with Owner lifecycle (HResult)
// handleComponent, createContext, handleAsyncComponent

import { getAdapter } from "../adapter/index.ts";
import { normalizeChildren } from "../utils/helpers.ts";
import { createOwner, disposeOwner, triggerMount } from "./owner.ts";
import { registerSignalStop, type UseFunction } from "./signal.ts";
import { isPromise, isArray, isNotEmpty } from "./type-guards.ts";
import {
  type Signal,
  type Owner,
  type HostNode,
  REACTIVE,
  type HResult,
  createHResult,
  isHResult,
  type NullableProps,
  type ComponentResult,
  type MergeableResult,
} from "./types.ts";

// ── Context ───────────────────────────────────────────

export interface Context {
  onMount: (fn: () => void | Promise<void>) => void;
  onUnmount: (fn: () => void | Promise<void>) => void;
  use: UseFunction;
}

export type ComponentFunction<P = any> = (props: P, context: Context) => ComponentResult;

// ── Safe Signal ──────────────────────────────────────

function createSafeSignal(): Signal<any> {
  const signal = (() => undefined) as Signal<any>;
  (signal as any)[REACTIVE] = {
    value: undefined,
    subs: new Set(),
    stop: () => {},
  };
  return signal;
}

// ── createContext ─────────────────────────────────────

function createContextUse(owner: Owner): UseFunction {
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

export function createContext(owner: Owner): Context {
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

// ── Helper: merge HResult items into owner ──────────

/**
 * 将子 HResult 的 owner、nodes、cleanups 合并到当前 owner。
 * 处理单值和数组（Fragment 返回多个根元素）。
 */
function mergeResults(items: MergeableResult, owner: Owner): HostNode[] {
  const allNodes: HostNode[] = [];
  const list = isArray(items) ? items : [items];

  for (const item of list) {
    if (isArray(item)) {
      // 递归处理嵌套数组（Fragment 嵌套 Fragment 等场景）
      const subNodes = mergeResults(item, owner);
      allNodes.push(...subNodes);
    } else if (isHResult(item)) {
      if (item.owner) {
        owner.children.push(item.owner);
        item.owner.parent = owner;
      }
      if (item.cleanups) {
        owner.cleanups.push(...item.cleanups);
      }
      allNodes.push(...item.nodes);
    } else if (getAdapter().isNode(item)) {
      allNodes.push(item);
    }
  }

  return allNodes;
}

// ── handleAsyncComponent ──────────────────────────────

function handleAsyncComponent(promise: Promise<MergeableResult>, owner: Owner): HResult {
  const adapter = getAdapter();
  const placeholder = adapter.createComment("async") as Comment;
  owner.elements.add(placeholder);

  promise
    .then((rawResult) => {
      if (owner.disposed) return;

      const nodes = mergeResults(rawResult, owner);

      // mergeResults 过程中可能被 dispose（如快速导航离开）
      if (owner.disposed) {
        // 已 merge 的子 Owner 会在父级 dispose 时一并清理
        return;
      }

      owner.elements.delete(placeholder);
      nodes.forEach((n) => owner.elements.add(n));

      if (isNotEmpty(nodes)) {
        adapter.replaceWith(placeholder, ...nodes);
      }
      triggerMount(owner);
    })
    .catch((err: Error) => {
      if (owner.disposed) return;
      console.error("[kiaao] async component error:", err);
    });

  return createHResult(owner, [placeholder]);
}

// ── handleComponent ───────────────────────────────────

export function handleComponent(
  tag: ComponentFunction,
  props: NullableProps = {},
  children: any[] = [],
): HResult {
  const owner: Owner = createOwner();
  const context = createContext(owner);

  let compProps = props ?? {};
  if (isNotEmpty(children)) {
    compProps = { ...compProps, children: normalizeChildren(children) };
  }

  let result: ComponentResult;
  try {
    result = tag(compProps, context);
  } catch (e) {
    console.error("[kiaao] component error:", e);
    disposeOwner(owner);
    const comment = getAdapter().createComment("component error") as Node;
    return createHResult(owner, [comment]);
  }

  if (isPromise(result)) {
    return handleAsyncComponent(result, owner);
  }

  const nodes = mergeResults(result, owner);
  nodes.forEach((n) => owner.elements.add(n));
  return createHResult(owner, nodes);
}
