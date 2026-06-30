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

// ── toHResult — 子内容标准化 ──────────────────────────

/**
 * 将任意类型的子内容统一转换为 HResult。
 * 替代原 nestBindPrimitive 的职责。
 */
export function toHResult(child: any): HResult {
  if (isHResult(child)) return child;

  if (isUse(child)) {
    const adapter = getAdapter();
    const textNode = adapter.text("");
    const derived = use(child, () => adapter.setText(textNode, String(child())));
    const stop = getSignalState(derived)?.stop;
    const cleanups = stop ? [stop] : [];
    return createHResult(null, [textNode], [], cleanups);
  }

  if (isFunction(child)) {
    return toHResult(child());
  }

  if (isArray(child)) {
    const pending: Owner[] = [];
    const cleanups: CleanupFn[] = [];
    const nodes: HostNode[] = [];
    for (const item of child.flat()) {
      const hr = toHResult(item);
      nodes.push(...hr.nodes);
      if (hr.owner) {
        pending.push(hr.owner);
      } else {
        pending.push(...hr.pending);
        cleanups.push(...hr.cleanups);
      }
    }
    return createHResult(null, nodes, pending, cleanups);
  }

  if (getAdapter().isNode(child)) {
    return createHResult(null, [child], [], []);
  }

  if (isNil(child)) {
    return createHResult(null, [], [], []);
  }

  return createHResult(null, [getAdapter().text(String(child))], [], []);
}

// ── adoptResult — 内部吸收函数 ─────────────────────────

/**
 * 将 HResult 的资源吸收到指定 Owner。
 * - 边界 HResult（hr.owner 非空）：仅挂接 Owner，不吸节点
 * - 非边界 HResult：吸收 nodes、pending、cleanups
 */
export function adoptResult(owner: Owner, hr: HResult): HostNode[] {
  if (hr.owner) {
    // 边界：只挂接外部组件/指令 Owner（排除自身防止自引用）
    if (hr.owner !== owner && !hr.owner.disposed) {
      owner.children.push(hr.owner);
      hr.owner.parent = owner;
    }
    return hr.nodes;
  }
  // 非边界：吸收所有资源
  for (const node of hr.nodes) {
    owner.elements.add(node);
  }
  for (const childOwner of hr.pending) {
    if (!childOwner.disposed) {
      owner.children.push(childOwner);
      childOwner.parent = owner;
    }
  }
  owner.cleanups.push(...hr.cleanups);
  return hr.nodes;
}

void adoptResult;

// ── handleAsyncComponent ──────────────────────────────

export function handleAsyncComponent(promise: Promise<MergeableResult>, owner: Owner): HResult {
  const adapter = getAdapter();
  const placeholder = adapter.comment("async");
  owner.elements.add(placeholder);

  promise
    .then((rawResult) => {
      if (owner.disposed) return;

      const resolvedHr = toHResult(rawResult);
      const newNodes = adoptResult(owner, resolvedHr);

      if (owner.disposed) return;

      owner.elements.delete(placeholder);

      if (isNotEmpty(newNodes)) {
        adapter.replace(placeholder, ...newNodes);
      }
      triggerMount(owner);
    })
    .catch((err: Error) => {
      if (owner.disposed) return;
      console.error("[kiaao] async component error:", err);
    });

  return createHResult(owner, [placeholder], [], []);
}

// ── Helper: 信号绑定 ─────────────────────────────

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
    return createHResult(owner, [comment], [], []);
  }

  if (isPromise(result)) {
    return handleAsyncComponent(result, owner);
  }

  const childHr = toHResult(result);
  adoptResult(owner, childHr);
  return createHResult(owner, childHr.nodes, [], []);
}
