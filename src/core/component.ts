// kiaao — Component model with Owner lifecycle (HResult)
// handleComponent, createContext, handleAsyncComponent

import { getAdapter } from "../adapter/index.ts";
import { createOwner, disposeOwner, triggerMount } from "./owner.ts";
import { isUse, registerSignalStop, use, type UseFunction } from "./signal.ts";
import {
  isArray,
  isFunction,
  isNil,
  isNotEmpty,
  isNotNil,
  isPromise,
  normalizeChildren,
} from "./type-guards.ts";
import {
  createHResult,
  getSignalState,
  isHResult,
  REACTIVE,
  type CleanupFn,
  type ComponentResult,
  type HostNode,
  type HResult,
  type MergeableResult,
  type NullableProps,
  type Owner,
  type Signal,
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

/** 遍历 HResult 的子结果树 */
function nestBindResult(result: HResult, parentOwner: Owner): HostNode[] {
  // Owner 连接：防止父子相同导致自引用，轻量 Owner 跳过 parent 赋值
  if (result.owner && result.owner !== parentOwner) {
    parentOwner.children.push(result.owner);
    result.owner.parent = parentOwner;
  }

  const effectiveOwner = result.owner ?? parentOwner;

  // 递归处理子节点树
  if (isNotNil(result.childResults) && isNotEmpty(result.childResults)) {
    const allChildNodes: HostNode[] = [];
    for (const child of result.childResults) {
      allChildNodes.push(...nestBind(child, effectiveOwner));
    }

    const [parentEl] = result.nodes;
    if (parentEl && isNotEmpty(allChildNodes)) {
      const adapter = getAdapter();
      adapter.clear(parentEl);
      for (const node of allChildNodes) {
        adapter.append(parentEl, node);
      }
    }
  }

  // 归集 cleanups 到有效 Owner
  if (result.cleanups) {
    for (const c of result.cleanups) {
      effectiveOwner.cleanups.push(c);
    }
  }

  // 轻量 Owner：children 上提给 parentOwner，自身从树中移除
  if (effectiveOwner.isLightweight && effectiveOwner !== parentOwner) {
    for (const child of effectiveOwner.children) {
      child.parent = parentOwner;
      parentOwner.children.push(child);
    }
    effectiveOwner.children.length = 0;
    const idx = parentOwner.children.indexOf(effectiveOwner);
    if (idx !== -1) parentOwner.children.splice(idx, 1);
  }

  return result.nodes;
}

/** 处理原始值（非 HResult/非数组） */
function nestBindPrimitive(item: any, parentOwner: Owner): HostNode[] {
  if (isNil(item)) {
    return [];
  }
  if (getAdapter().isNode(item)) {
    return [item];
  }
  if (isUse(item)) {
    return [handleSignalChild(item, parentOwner)];
  }
  if (isFunction(item)) {
    return nestBind(item(), parentOwner);
  }
  return [getAdapter().text(String(item)) as HostNode];
}

export function nestBind(items: any, parentOwner: Owner): HostNode[] {
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
  const placeholder = adapter.comment("async");
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
        adapter.replace(placeholder, ...nodes);
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
  return bindSignalToTextNode(signal, owner.cleanups);
}

/**
 * 创建信号绑定的文本节点。
 * 返回文本节点，信号变化时自动更新值。
 * stop 函数推入 cleanups 数组，供 disposeOwner 清理。
 */
export function bindSignalToTextNode(signal: any, cleanups: CleanupFn[]): HostNode {
  const adapter = getAdapter();
  const textNode = adapter.text("") as HostNode;
  const derived = use(signal, () => {
    adapter.setText(textNode, String(signal()));
  });
  const stop = getSignalState(derived)?.stop;
  if (stop) cleanups.push(stop);
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
    const comment = getAdapter().comment("component error");
    return createHResult(owner, [comment]);
  }

  if (isPromise(result)) {
    return handleAsyncComponent(result, owner);
  }

  const nodes = nestBind(result, owner);
  nodes.forEach((n) => owner.elements.add(n));
  return createHResult(owner, nodes);
}
