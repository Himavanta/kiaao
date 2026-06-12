// kiaao — Server-side rendering entry
//
// Usage:
//   import { renderToString } from "kiaao/server";
//   const html = renderToString(MyComponent, { name: "kiaao" });

import { h } from "../dom/h.ts";
import { setRenderMode, getRenderMode } from "../reactive/core.ts";
import { isSSRSafe } from "../dom/ssr-helpers.ts";

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

  try {
    const result = h(component, mergedProps);
    return isSSRSafe(result) ? result.html : typeof result === "string" ? result : "";
  } finally {
    setRenderMode(prevMode);
  }
}
