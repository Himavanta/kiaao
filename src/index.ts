// kiaao v4 — Public API

// Reactive core (platform-agnostic)
export { use, isUse, toValue } from "./reactive/core.ts";

// DOM rendering
export { h } from "./dom/h.ts";

// Mount & unmount
export { mount, unmount } from "./dom/component.ts";

// Components
export { Fragment } from "./dom/fragment.ts";
export { Teleport } from "./dom/teleport.ts";
export { lazy } from "./dom/lazy.ts";

// Async utilities

// JSX runtime
export { jsx, jsxs, jsxDEV } from "./jsx-runtime/index.ts";

// Types
export type { Getter, Setter } from "./reactive/types.ts";
