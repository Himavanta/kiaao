// kiaao — Core module entry
// Re-exports all core functionality for external consumption.
// Platform entries (dom/, server/, motion/ etc.) import from here.

// Reactive system
export { use, isUse, toValue, registerSignalStop, definitionMode } from "./signal.ts";
export type { UseFunction } from "./signal.ts";

// h() factory
export { h, Fragment } from "./h.ts";

// Component model
export { handleComponent, createContext } from "./component.ts";
export type { Context, ComponentFunction } from "./component.ts";

// Owner lifecycle
export { createOwner, disposeOwner, triggerMount } from "./owner.ts";

// Directives
export { direct, createDirectiveContext, isDirective } from "./direct.ts";
export type { DirectiveFunction, DirectiveContext } from "./direct.ts";

// Props handling
export { setProps } from "./props.ts";

// Children processing
export { processChildren } from "./process-children.ts";

// Type-guards
export {
  isArray,
  isFunction,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isNil,
  isNotNil,
  isUndefined,
  isDefined,
  isEmpty,
  isNotEmpty,
  isSingle,
  isMap,
  isSet,
  isPromise,
  isPlainObject,
  isRecord,
} from "./type-guards.ts";

// Core types
export type {
  Signal,
  HResult,
  Owner,
  Props,
  NullableProps,
  ComponentResult,
  MergeableResult,
  CleanupFn,
  HostNode,
  RenderAdapter,
  ProcessChildrenResult,
} from "./types.ts";
export {
  REACTIVE,
  DIRECT_KEY,
  SSR_COMPONENT,
  HRESULT_SYMBOL,
  createHResult,
  isHResult,
  getSignalState,
} from "./types.ts";
