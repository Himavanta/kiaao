// kiaao — JSX runtime for automatic transform (react-jsx / react-native + jsxImportSource)
//
// Adapts the React JSX calling convention (children inside props)
// to kiaao's h(tag, props, ...children).

import type { Context } from "../core/component.ts";
import type { DirectiveContext } from "../core/direct.ts";
import { h, Fragment } from "../core/h.ts";
import { isArray, isNil, isUndefined } from "../core/type-guards.ts";
import type { HResult, Props, NullableProps } from "../core/types.ts";

// ── JSX Factories ──────────────────────────────────────

function normalizeChildren(children: unknown): unknown[] | undefined {
  if (isNil(children)) return undefined;
  if (isArray(children)) {
    const flat: any[] = [];
    for (const c of children) {
      if (isArray(c)) flat.push(...c);
      else flat.push(c);
    }
    return flat;
  }
  return [children];
}

function createJsxElement(type: any, props: NullableProps, key?: any): HResult {
  if (isNil(props)) return h(type);

  const { children, ...rest } = props;

  if (!isUndefined(key)) {
    rest.key = key;
  }

  const childList = normalizeChildren(children);

  if (isUndefined(childList)) {
    return h(type, rest);
  }

  return h(type as any, rest, ...childList);
}

// ── Exports for automatic JSX runtime ──────────────────

export { Fragment };
export { createJsxElement as jsx };
export { createJsxElement as jsxs };
export { createJsxElement as jsxDEV };

// ── JSX Type Declarations ──────────────────────────────

export namespace JSX {
  // h() now returns HResult
  export type Element = HResult;
  export interface ElementClass {
    (props: Props, context?: Context): HResult;
    (el: Element, props: Props, ctx: DirectiveContext): void;
  }
  export interface ElementChildrenAttribute {
    children: any;
  }
  export interface IntrinsicElements {
    [elem: string]: Props;
  }
}
