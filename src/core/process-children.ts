// kiaao — Child node processing for h()
// Returns { nodes, cleanups } — cleanups are orphan signal binding stops
// that flow upward through HResult.  During transition they are also
// registered to currentOwner (if present) for backward compatibility.

import { getAdapter } from "../adapter/index.ts";
import { isUse, use } from "./signal.ts";
import { isNil, isObject, isArray } from "./type-guards.ts";
import {
  type ProcessChildrenResult,
  isHResult,
  getSignalState,
  type CleanupFn,
  type HostNode,
} from "./types.ts";

/**
 * 将扁平化 children 数组归一化：单元素展开，多元素保持数组。
 */
export function normalizeChildren<T>(children: T[]): T | T[] {
  return children.length === 1 ? children[0] : children;
}

/**
 * 处理子节点数组，返回扁平化的 Node 数组和孤儿的清理函数。
 *
 * - 数组被递归展开
 * - null/undefined/boolean 被跳过
 * - Node 直接保留
 * - HResult 提取其中 nodes 和 cleanups
 * - 信号（Signal）创建文本占位节点 + 派生绑定
 * - 其他值转为文本节点
 */
export function processChildren(children: any[]): ProcessChildrenResult {
  const nodes: HostNode[] = [];
  const cleanups: CleanupFn[] = [];
  const adapter = getAdapter();

  for (const child of children) {
    if (isNil(child) || child === true || child === false) continue;

    if (isArray(child)) {
      const sub = processChildren(child);
      nodes.push(...sub.nodes);
      cleanups.push(...sub.cleanups);
      continue;
    }

    if (getAdapter().isNode(child)) {
      nodes.push(child);
      continue;
    }

    if (isHResult(child)) {
      nodes.push(...child.nodes);
      if (child.cleanups) cleanups.push(...child.cleanups);
      continue;
    }

    // SSR 节点对象——通过 `type` 字段区分（仅 SSR 模式下出现，普通对象有 `type` 属性不会导致运行时错误）
    if (isObject(child) && "type" in (child as any)) {
      nodes.push(child as Node);
      continue;
    }

    if (isUse(child)) {
      const textNode = adapter.createTextNode("") as Text;
      const derived = use(child, () => {
        textNode.textContent = String(child());
      });
      const stop = getSignalState(derived)?.stop;
      if (stop) {
        cleanups.push(stop);
      }
      nodes.push(textNode);
      continue;
    }

    nodes.push(adapter.createTextNode(String(child)) as Text);
  }

  return { nodes, cleanups };
}
