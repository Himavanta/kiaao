// kiaao — Component model with Owner lifecycle (HResult)
// handleComponent, createContext, handleAsyncComponent

import { createOwner, disposeOwner, triggerMount } from "./owner.ts";
import { registerSignalStop, type UseFunction } from "./signal.ts";
import {
  type Signal,
  type Owner,
  REACTIVE,
  type HResult,
  createHResult,
  isHResult,
  getAdapter,
  type NullableProps,
} from "./types.ts";
import { isNode, isPromise, isArray, isNotEmpty } from "../utils/type-guards.ts";
import { normalizeChildren } from "../utils/helpers.ts";

// ── Context ───────────────────────────────────────────

export interface Context {
  onMount: (fn: () => void | Promise<void>) => void;
  onUnmount: (fn: () => void | Promise<void>) => void;
  use: UseFunction;
}

export type ComponentFunction<P = any> = (
  props: P,
  context: Context,
) => HResult | HResult[] | Promise<HResult | HResult[]>;

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
function mergeResults(items: any[], owner: Owner): Node[] {
  const allNodes: Node[] = [];
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
    } else if (isNode(item)) {
      allNodes.push(item);
    }
  }

  return allNodes;
}

// ── handleAsyncComponent ──────────────────────────────

function handleAsyncComponent(promise: Promise<any>, owner: Owner): HResult {
  const adapter = getAdapter();
  const placeholder = adapter.createComment("async") as Comment;
  owner.elements.add(placeholder);

  promise
    .then((rawResult) => {
      if (owner.disposed) return;

      const nodes = mergeResults(rawResult, owner);

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

  let result: any;
  try {
    result = (tag as any)(compProps, context);
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
