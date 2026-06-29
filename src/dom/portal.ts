// kiaao — Portal component
// Renders content into a specified DOM container outside the component tree.

import { getAdapter } from "../adapter/index.ts";
import type { Context, HResult } from "../core/index.ts";
import { createHResult, createOwner, isArray, isString } from "../core/index.ts";
import { SSR_COMPONENT } from "../core/index.ts";
import { isNode } from "./type-guards.ts";

/** 从 children 中提取可挂载的 DOM 节点 */
function extractPortalNodes(children: unknown): Node[] {
  if (isArray(children)) {
    return children.flatMap((child) => extractPortalNodes(child));
  }
  if (isNode(children as Node)) {
    return [children as Node];
  }
  if (typeof children === "object" && children !== null && "nodes" in children) {
    return (children as HResult).nodes.filter(isNode) as Node[];
  }
  return [];
}

/** 收集 children 中的 HResult 列表，用于 Owner 连接 */
function collectChildResults(children: unknown): HResult[] {
  if (isArray(children)) {
    return children.flatMap((child) => collectChildResults(child));
  }
  if (typeof children === "object" && children !== null && "owner" in children) {
    return [children as HResult];
  }
  return [];
}

export function Portal(
  props: { to: string | HTMLElement; children: any },
  context?: Context,
): HResult {
  const adapter = getAdapter();
  const onUnmount = context?.onUnmount;
  const target = isString(props.to)
    ? (document.querySelector(props.to) as HTMLElement | null)
    : props.to;
  const lwOwner = createOwner({ lightweight: true });

  // 将 children 的 Owner 连接到 lwOwner，使 triggerMount 能到达它们
  const childResults = collectChildResults(props.children);
  for (const cr of childResults) {
    if (cr.owner && cr.owner !== lwOwner) {
      lwOwner.children.push(cr.owner);
      cr.owner.parent = lwOwner;
    }
  }

  if (!target) {
    return createHResult(lwOwner, [adapter.comment("portal-missing-target")], [], []);
  }

  const portalNodes = extractPortalNodes(props.children);
  for (const node of portalNodes) {
    target.append(node);
  }

  onUnmount?.(() => {
    for (const node of portalNodes) {
      adapter.remove(node);
    }
  });

  return createHResult(lwOwner, [adapter.comment("portal")], [], []);
}

(Portal as any)[SSR_COMPONENT] = () => {
  return { html: "<!-- portal placeholder -->" };
};
