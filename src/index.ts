// kiaao — Public API (Owner architecture)

// Auto-register browser adapter on import
import { setAdapter } from "./core/types.ts";
import { browserAdapter } from "./dom/adapter.ts";
try {
  if (typeof document !== "undefined") {
    setAdapter(browserAdapter);
  }
} catch {}

// Reactive core (platform-agnostic)
export { use, isUse, toValue } from "./core/signal.ts";

// DOM rendering (new h() with Owner tree)
export { h } from "./core/h.ts";

// Components
export { Fragment } from "./core/h.ts";

// Mount & unmount (createApp API with Owner lifecycle)
export { createApp } from "./core/create-app.ts";
export type { App } from "./core/create-app.ts";

// Portal, lazy (unchanged)
export { Portal } from "./dom/portal.ts";
export { lazy } from "./dom/lazy.ts";

// JSX runtime
export { jsx, jsxs, jsxDEV } from "./jsx-runtime/index.ts";

// Directive system
export { direct } from "./core/direct.ts";

// Types
export type { Getter, Setter, Children } from "./core/types.ts";
export type { UseFunction } from "./core/signal.ts";
export type { Context } from "./core/component.ts";
export type { DirectiveFunction, DirectiveContext } from "./core/direct.ts";
