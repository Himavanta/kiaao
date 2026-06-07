// kiaao — Server-side rendering entry
//
// Usage:
//   import { renderToString } from "kiaao/server";
//   const html = renderToString(MyComponent, { name: "kiaao" });

import { h } from "../dom.ts";
import { setRenderMode, getRenderMode } from "../runtime.ts";
import { isSSRSafe } from "../ssr-helpers.ts";

export function renderToString(
  component: (props: any) => any,
  props?: any,
  options?: { slots?: Record<string, string> },
): string {
  const prevMode = getRenderMode();
  setRenderMode("ssr");

  let mergedProps = props ?? {};
  if (options?.slots?.default) {
    mergedProps = { ...mergedProps, children: options.slots.default };
  }

  const result = h(component, mergedProps);

  setRenderMode(prevMode);

  return isSSRSafe(result) ? result.html : typeof result === "string" ? result : "";
}
