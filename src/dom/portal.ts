// kiaao — Portal component
// Renders content into a specified DOM container outside the component tree.

import { getAdapter } from "../adapter/index.ts";
import type { Context, HResult } from "../core/index.ts";
import { adoptResult, createHResult, isString, SSR_COMPONENT, toHResult } from "../core/index.ts";
import { isNode } from "./type-guards.ts";

export function Portal(
  props: { to: string | HTMLElement; children: any },
  context?: Context,
): HResult {
  const adapter = getAdapter();
  const owner = context?.owner;

  if (!owner) {
    return createHResult(null, [adapter.comment("portal-no-ctx")], [], []);
  }

  const target = isString(props.to)
    ? (document.querySelector(props.to) as HTMLElement | null)
    : props.to;

  if (!target) {
    return createHResult(null, [adapter.comment("portal-missing-target")], [], []);
  }

  // 处理 children
  const childHr = toHResult(props.children);
  const portalNodes = adoptResult(owner, childHr);

  // 移动到目标容器
  for (const node of portalNodes) {
    if (isNode(node as Node)) {
      target.append(node as Node);
    }
  }

  // 清理
  context.onUnmount?.(() => {
    for (const node of portalNodes) {
      adapter.remove(node);
    }
  });

  return createHResult(null, [adapter.comment("portal")], [], []);
}

(Portal as any)[SSR_COMPONENT] = () => {
  return { html: "<!-- portal placeholder -->" };
};
