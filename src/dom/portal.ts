// kiaao v4 — Portal component
// Renders content into a specified DOM container outside the component tree.

import { SSR_COMPONENT } from "../reactive/types.ts";
import type { Context } from "./h.ts";
import { disposeNode, triggerMount } from "./component.ts";
import { ssr } from "./ssr-helpers.ts";
import { createComment, qs } from "./dom-utils.ts";

export function Portal(
  props: { to: string | HTMLElement; children: any },
  { onUnmount }: Context,
): Node {
  const target = typeof props.to === "string" ? qs<HTMLElement>(props.to) : props.to;
  if (!target) return createComment("portal-missing-target");

  const nodes = Array.isArray(props.children) ? props.children : [props.children];

  for (const node of nodes) {
    if (node instanceof Node) {
      target.append(node);
      triggerMount(node);
    }
  }

  onUnmount(() => {
    for (const node of nodes) {
      if (node instanceof Node) {
        disposeNode(node);
        (node as ChildNode).remove();
      }
    }
  });

  return createComment("portal");
}

(Portal as any)[SSR_COMPONENT] = () => ssr("<!-- portal placeholder -->");
