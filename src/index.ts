// kiaao — Public API (Owner architecture)

// Reactive core (platform-agnostic)
export { use, isUse, toValue } from "./core/signal.ts";

// DOM rendering (new h() with Owner tree)
export { h } from "./core/h.ts";

// Components
export { Fragment } from "./core/h.ts";

// Mount & unmount (temporary — will be replaced by createApp in Phase 5)
export { mount, unmount } from "./dom/component.ts";

// Portal, lazy (unchanged)
export { Portal } from "./dom/portal.ts";
export { lazy } from "./dom/lazy.ts";

// JSX runtime
export { jsx, jsxs, jsxDEV } from "./jsx-runtime/index.ts";

// Directive system
export { direct } from "./dom/directive.ts";

// Types
export type { Getter, Setter, Children } from "./core/types.ts";
export type { UseFunction } from "./core/signal.ts";
export type { Context } from "./core/component.ts";
export type { DirectiveFunction, DirectiveContext } from "./dom/directive.ts";
