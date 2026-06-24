// kiaao — Public API (Owner architecture)

// Auto-register browser adapter on import
import { setAdapter } from "./adapter/index.ts";
import { browserAdapter } from "./dom/adapter.ts";
try {
  if (globalThis.document) {
    setAdapter(browserAdapter);
  }
} catch {}

export * from "./core/index.ts";

// DOM-specific exports
export { Portal } from "./dom/portal.ts";
export { lazy } from "./dom/lazy.ts";
export { isNode, isElement, isSVGElement } from "./dom/type-guards.ts";

// JSX runtime
export { jsx, jsxs, jsxDEV } from "./jsx-runtime/index.ts";

// Adapter (platform config)
export type { RenderMode } from "./adapter/index.ts";
