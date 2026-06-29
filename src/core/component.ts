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
    // 边界：只挂接组件/指令 Owner
    if (!hr.owner.disposed) {
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

// 临时引用防止未使用警告，后续阶段接入后删除
void toHResult;
void adoptResult;

// ── Helper: nestBind — 统一遍历结果树，连接 Owner + 构建 DOM ────

/** 遍历 HResult 的子结果树 */
function nestBindResult(result: HResult, parentOwner: Owner): HostNode[] {
  // Owner 连接：防止父子相同导致自引用
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

  return createHResult(owner, [placeholder], [], []);
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
    return createHResult(owner, [comment], [], []);
  }

  if (isPromise(result)) {
    return handleAsyncComponent(result, owner);
  }

  const nodes = nestBind(result, owner);
  nodes.forEach((n) => owner.elements.add(n));
  return createHResult(owner, nodes, [], []);
}
