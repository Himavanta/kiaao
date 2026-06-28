// kiaao — Portal component
// Renders content into a specified DOM container outside the component tree.

import { getAdapter } from "../adapter/index.ts";
import type { Context, HResult } from "../core/index.ts";
import { createHResult } from "../core/index.ts";
import { isArray, isString } from "../core/index.ts";
import { SSR_COMPONENT } from "../core/index.ts";
import { isNode } from "./type-guards.ts";

export function Portal(
  props: { to: string | HTMLElement; children: any },
  context?: Context,
): HResult {
  const adapter = getAdapter();
  const onUnmount = context?.onUnmount;
  const target = isString(props.to)
    ? (document.querySelector(props.to) as HTMLElement | null)
    : props.to;
  if (!target) return createHResult(null, [adapter.comment("portal-missing-target")]);

  const nodes = isArray(props.children) ? props.children : [props.children];

  for (const node of nodes) {
    if (isNode(node)) {
      target.append(node);
    }
  }

  onUnmount?.(() => {
    for (const node of nodes) {
      if (isNode(node)) {
        adapter.remove(node);
      }
    }
  });

  return createHResult(null, [adapter.comment("portal")]);
}

(Portal as any)[SSR_COMPONENT] = () => {
  return { html: "<!-- portal placeholder -->" };
};
