// kiaao — Public API (Owner architecture)

// Auto-register browser adapter on import
import { setAdapter } from "./adapter/index.ts";
import { browserAdapter } from "./dom/adapter.ts";
try {
  if (globalThis.document) {
    setAdapter(browserAdapter);
  }
} catch {}

// Reactive core (platform-agnostic)
export { use, isUse, toValue } from "./core/signal.ts";
export type { RenderMode } from "./adapter/index.ts";

// DOM rendering (new h() with Owner tree)
export { h, Fragment } from "./core/h.ts";

// Components
export { createApp } from "./core/create-app.ts";
export type { App } from "./core/create-app.ts";
export type { ComponentFunction, Context } from "./core/component.ts";

// Portal, lazy
export { Portal } from "./dom/portal.ts";
export { lazy } from "./dom/lazy.ts";

// JSX runtime
export { jsx, jsxs, jsxDEV } from "./jsx-runtime/index.ts";

// Directive system
export { direct } from "./core/direct.ts";
export type { DirectiveFunction, DirectiveContext } from "./core/direct.ts";

// Signal types
export type { UseFunction } from "./core/signal.ts";

// Core framework types
export type {
  Signal,
  HResult,
  Owner,
  Props,
  NullableProps,
  CleanupFn,
  ComponentResult,
  MergeableResult,
  RenderAdapter,
  ProcessChildrenResult,
} from "./core/types.ts";
