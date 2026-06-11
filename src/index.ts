// kiaao v4 — Public API

// Reactive core (platform-agnostic)
export { use, isUse, toUse, toVal } from "./reactive/core.ts";

// DOM rendering
export { h } from "./dom/h.ts";

// Lifecycle & mount
export { onMount, onUnmount, mount, unmount } from "./dom/component.ts";

// Components
export { Fragment } from "./dom/fragment.ts";
export { Teleport } from "./dom/teleport.ts";
export { lazy } from "./dom/lazy.ts";

// Async utilities
export { romise } from "./dom/async.ts";

// JSX runtime
export { jsx, jsxs, jsxDEV } from "./jsx-runtime/index.ts";

// Types
export type { Getter, Setter } from "./reactive/types.ts";
