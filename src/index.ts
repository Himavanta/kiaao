// kiaao — Public API

// Reactive core (platform-agnostic)
export { use, isUse, toValue } from "./reactive/core.ts";

// DOM rendering
export { h } from "./dom/h.ts";

// Mount & unmount
export { mount, unmount } from "./dom/component.ts";

// Components
export { Fragment } from "./dom/fragment.ts";
export { Portal } from "./dom/portal.ts";
export { lazy } from "./dom/lazy.ts";

// Async utilities

// JSX runtime
export { jsx, jsxs, jsxDEV } from "./jsx-runtime/index.ts";

// Directive system
export { direct } from "./dom/directive.ts";

// Types
export type { Getter, Setter } from "./reactive/types.ts";
export type { UseFunction } from "./reactive/core.ts";
export type { Context } from "./dom/h.ts";
export type { DirectiveFunction, DirectiveContext } from "./dom/directive.ts";
