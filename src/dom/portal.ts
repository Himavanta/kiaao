// kiaao — Portal component
// Renders content into a specified DOM container outside the component tree.

import { getAdapter } from "../adapter/index.ts";
import type { Context } from "../core/index.ts";
import { isArray, isString } from "../core/index.ts";
import { SSR_COMPONENT } from "../core/index.ts";
import { isNode } from "./type-guards.ts";

export function Portal(
  props: { to: string | HTMLElement; children: any },
  { onUnmount }: Context,
): Node {
  const adapter = getAdapter();
  const target = isString(props.to)
    ? (document.querySelector(props.to) as HTMLElement | null)
    : props.to;
  if (!target) return adapter.createComment("portal-missing-target") as Node;

  const nodes = isArray(props.children) ? props.children : [props.children];

  for (const node of nodes) {
    if (isNode(node)) {
      target.append(node);
    }
  }

  onUnmount(() => {
    for (const node of nodes) {
      if (isNode(node)) {
        adapter.remove(node);
      }
    }
  });

  return adapter.createComment("portal") as Node;
}

(Portal as any)[SSR_COMPONENT] = () => {
  return { html: "<!-- portal placeholder -->" };
};
