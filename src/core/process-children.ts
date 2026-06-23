// kiaao — Child node processing for h()
// Owner-aware: signal binding cleanups register to currentOwner.

import { getAdapter } from "../core/types.ts";
import { currentOwner } from "../core/owner.ts";
import { isUse, use } from "../core/signal.ts";
import { REACTIVE } from "../core/types.ts";
import { isBoolean, isNil, isNode } from "../utils/type-guards.ts";

/**
 * 处理子节点数组，返回扁平化的 Node 数组。
 * - 数组被递归展开
 * - null/undefined/boolean 被跳过
 * - Node 直接保留
 * - 信号（Signal）创建文本占位节点 + 派生绑定，清理函数注册到当前 Owner
 * - 其他值转为文本节点
 */
export function processChildren(children: any[]): Node[] {
  const result: Node[] = [];
  const adapter = getAdapter();

  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...processChildren(child));
      continue;
    }

    if (isNil(child) || isBoolean(child)) continue;

    if (isNode(child)) {
      result.push(child);
      continue;
    }

    if (isUse(child)) {
      const textNode = adapter.createTextNode("") as Text;
      const [derived] = use(child, () => {
        textNode.textContent = String(child());
      });
      const stop = (derived as any)[REACTIVE]?.stop;
      if (stop) {
        const owner = currentOwner.get();
        if (owner) owner.cleanups.push(stop);
      }
      result.push(textNode);
      continue;
    }

    result.push(adapter.createTextNode(String(child)) as Text);
  }

  return result;
}
