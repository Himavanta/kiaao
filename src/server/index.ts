// kiaao — Server-side rendering entry
//
// Usage:
//   import { renderToString } from "kiaao/server";
//   const html = renderToString(MyComponent, { name: "kiaao" });

import { setAdapter, getAdapter } from "../core/types.ts";
import { setRenderMode, getRenderMode } from "../core/signal.ts";
import { h } from "../core/h.ts";
import { ssrAdapter, serializeSSRNode } from "./adapter.ts";
import { isObject, isDefined } from "../utils/type-guards.ts";
import type { ComponentFunction } from "../core/component.ts";

export function renderToString(
  component: ComponentFunction,
  props?: any,
  options?: { slots?: Record<string, string> },
): string {
  const prevMode = getRenderMode();
  let prevAdapter: any;
  try {
    prevAdapter = getAdapter();
  } catch {
    /* 无 adapter 时不保存 */
  }

  setRenderMode("ssr");
  setAdapter(ssrAdapter);

  let mergedProps = props ?? {};
  if (options?.slots?.default) {
    mergedProps = { ...mergedProps, children: options.slots.default };
  }

  try {
    const result = h(component, mergedProps);
    const nodes = result.nodes || [];
    let html = "";
    for (const node of nodes) {
      if (isObject(node) && "type" in (node as any)) {
        html += serializeSSRNode(node as any);
      }
    }
    return html;
  } finally {
    setRenderMode(prevMode);
    if (isDefined(prevAdapter)) setAdapter(prevAdapter);
  }
}
