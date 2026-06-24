// kiaao — DOM platform module entry
// Exports DOM adapter, type-guards, and DOM-specific components.

export { browserAdapter } from "./adapter.ts";
export { Portal } from "./portal.ts";
export { lazy } from "./lazy.ts";
export { isNode, isElement, isSVGElement } from "./type-guards.ts";
