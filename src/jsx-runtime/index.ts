// kiaao — JSX runtime for automatic transform (react-jsx / react-native + jsxImportSource)
//
// Adapts the React JSX calling convention (children inside props)
// to kiaao's h(tag, props, ...children).

import { h } from "../dom/h.ts";
import type { Context } from "../dom/h.ts";
import { Fragment } from "../dom/fragment.ts";
import { isArray, isNil, isUndefined } from "../utils/type-guards.ts";
import type { DirectiveContext } from "../dom/directive.ts";

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

function createJsxElement(type: any, props: Record<string, any> | null, _key?: any): Node {
  // Normal element or component: forward props.children as rest args
  if (isNil(props)) return h(type);

  const { children, ...rest } = props;
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
  export interface Element extends Node {}
  export interface ElementClass {
    (props: Record<string, any>, context?: Context): Node;
    (el: Element, props: Record<string, any>, ctx: DirectiveContext): void;
  }
  export interface ElementChildrenAttribute {
    children: any;
  }
  export interface IntrinsicElements {
    [elem: string]: Record<string, any>;
  }
}
