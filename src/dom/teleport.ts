// kiaao v4 — Teleport component

import { SSR_COMPONENT } from "../reactive/types.ts";
import { onUnmount, disposeNode, triggerMount } from "./component.ts";
import { ssr } from "./ssr-helpers.ts";
import { createComment, qs } from "./dom-utils.ts";

export function Teleport(props: {
  to: string | HTMLElement;
  children: (() => any) | (() => any);
}): Node {
  const target = typeof props.to === "string" ? qs<HTMLElement>(props.to) : props.to;
  if (!target) return createComment("teleport-missing-target");

  const content = typeof props.children === "function" ? props.children() : props.children;
  if (content instanceof Node) {
    target.append(content);
    triggerMount(content);
  }

  onUnmount(() => {
    disposeNode(content);
    content.remove();
  });

  return createComment("teleport");
}

(Teleport as any)[SSR_COMPONENT] = () => ssr("<!-- teleport placeholder -->");
