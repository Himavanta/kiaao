// kiaao — Portal component
// Renders content into a specified DOM container outside the component tree.

import { getAdapter } from "../adapter/index.ts";
import type { Context, HResult } from "../core/index.ts";
import { adoptResult, createHResult, isString, toHResult } from "../core/index.ts";
import { querySelector } from "./dom-utils.ts";
import { isNode } from "./type-guards.ts";

export function Portal(
  props: { to: string | HTMLElement; children: any },
  context?: Context,
): HResult {
  const adapter = getAdapter();
  const owner = context?.owner;

  if (!owner) {
    return createHResult({ owner: null, nodes: [adapter.comment("portal-no-ctx")] });
  }

  const target = isString(props.to) ? (querySelector(props.to) as HTMLElement | null) : props.to;

  if (!target) {
    return createHResult({ owner: null, nodes: [adapter.comment("portal-missing-target")] });
  }

  const childHr = toHResult(props.children);
  const portalNodes = adoptResult(owner, childHr);

  for (const node of portalNodes) {
    if (isNode(node as Node)) {
      target.append(node as Node);
    }
  }

  context.onUnmount?.(() => {
    for (const node of portalNodes) {
      adapter.remove(node);
    }
  });

  return createHResult({ owner: null, nodes: [adapter.comment("portal")] });
}
