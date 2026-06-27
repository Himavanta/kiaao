// kiaao — Component model with Owner lifecycle (HResult)
// handleComponent, createContext, handleAsyncComponent

import { getAdapter } from "../adapter/index.ts";
import { createOwner, disposeOwner, triggerMount } from "./owner.ts";
import { registerSignalStop, isUse, use, type UseFunction } from "./signal.ts";
import { normalizeChildren } from "./type-guards.ts";
import { isPromise, isArray, isNotEmpty } from "./type-guards.ts";
import {
  type Signal,
  type Owner,
  type HostNode,
  REACTIVE,
  type HResult,
  createHResult,
  isHResult,
  getSignalState,
  type NullableProps,
  type ComponentResult,
  type MergeableResult,
} from "./types.ts";

// ── Context ───────────────────────────────────────────

export interface Context {
  onMount: (fn: () => void | Promise<void>) => void;
  onUnmount: (fn: () => void | Promise<void>) => void;
  use: UseFunction;
  owner: Owner;
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
    owner,
  };
}

// ── Helper: nestBind — 统一遍历结果树，连接 Owner + 构建 DOM ────

/** 从 HResult 提取宿主元素（首个节点） */
function hostElement(result: HResult): HostNode {
  const [el] = result.nodes;
  return el;
}

/** 将子节点列表 append 到父元素 */
function appendChildren(parentEl: HostNode, children: HostNode[]): void {
  if (!parentEl || children.length === 0) return;
  const adapter = getAdapter();
  for (const node of children) {
    adapter.append(parentEl, node);
  }
}

/** 遍历 HResult 的子结果树 */
function nestBindResult(result: HResult, parentOwner: Owner): HostNode[] {
  if (result.owner) {
    parentOwner.children.push(result.owner);
    result.owner.parent = parentOwner;
  }

  const effectiveOwner = result.owner || parentOwner;

  // 递归处理 DOM 元素的原始子节点树
  if (result.childResults && result.childResults.length > 0) {
    const allChildNodes: HostNode[] = [];
    for (const child of result.childResults) {
      allChildNodes.push(...nestBind(child, effectiveOwner));
    }
    appendChildren(hostElement(result)!, allChildNodes);
  }

  // 归集 cleanups 到有效 Owner
  if (result.cleanups) {
    for (const c of result.cleanups) {
      effectiveOwner.cleanups.push(c);
    }
  }

  return result.nodes;
}

/** 处理原始值（非 HResult/非数组） */
function nestBindPrimitive(item: any, parentOwner: Owner): HostNode[] {
  if (getAdapter().isNode(item)) {
    return [item];
  }
  if (isUse(item)) {
    return [handleSignalChild(item, parentOwner)];
  }
  return [getAdapter().createTextNode(String(item)) as HostNode];
}

function nestBind(items: any, parentOwner: Owner): HostNode[] {
  if (isArray(items)) {
    const allNodes: HostNode[] = [];
    for (const item of items) {
      allNodes.push(...nestBind(item, parentOwner));
    }
    return allNodes;
  }
  if (isHResult(items)) return nestBindResult(items, parentOwner);
  return nestBindPrimitive(items, parentOwner);
}

// ── handleAsyncComponent ──────────────────────────────

function handleAsyncComponent(promise: Promise<MergeableResult>, owner: Owner): HResult {
  const adapter = getAdapter();
  const placeholder = adapter.createComment("async") as Comment;
  owner.elements.add(placeholder);

  promise
    .then((rawResult) => {
      if (owner.disposed) return;

      const nodes = nestBind(rawResult, owner);

      if (owner.disposed) {
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

// ── Helper: 信号绑定 ─────────────────────────────

function handleSignalChild(signal: any, owner: Owner): HostNode {
  const adapter = getAdapter();
  const textNode = adapter.createTextNode("") as HostNode;
  const derived = use(signal, () => {
    (textNode as any).textContent = String(signal());
  });
  const stop = getSignalState(derived)?.stop;
  if (stop) {
    owner.cleanups.push(stop);
  }
  return textNode;
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

  const nodes = nestBind(result, owner);
  nodes.forEach((n) => owner.elements.add(n));
  return createHResult(owner, nodes);
}
