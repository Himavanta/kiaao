// kiaao — JSX runtime for automatic transform (react-jsx / react-native + jsxImportSource)
//
// Adapts the React JSX calling convention (children inside props)
// to kiaao's h(tag, props, ...children).

import { h } from "../dom.ts";

// ── JSX Factories ──────────────────────────────────────

function normalizeChildren(children: any): any[] | undefined {
  if (children == null) return undefined;
  if (Array.isArray(children)) {
    const flat: any[] = [];
    for (const c of children) {
      if (Array.isArray(c)) flat.push(...c);
      else flat.push(c);
    }
    return flat;
  }
  return [children];
}

function createJsxElement(type: any, props: Record<string, any> | null, _key?: any): any {
  // Normal element or component: forward props.children as rest args
  if (props == null) return h(type);

  const { children, ...rest } = props;
  const childList = normalizeChildren(children);

  if (childList === undefined) {
    return h(type, rest);
  }

  return (h as any)(type, rest, ...childList);
}

// ── Exports for automatic JSX runtime ──────────────────

export { createJsxElement as jsx };
export { createJsxElement as jsxs };
export { createJsxElement as jsxDEV };

// ── JSX Type Declarations ──────────────────────────────

export namespace JSX {
  export interface Element extends Node {}
  export interface ElementClass {
    (props: any): Node;
  }
  export interface ElementChildrenAttribute {
    children: any;
  }
  export interface IntrinsicElements {
    [elem: string]: any;
  }
}
