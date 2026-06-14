// kiaao — SSR helper functions shared between h.ts and components
// Types and simple utilities kept here; serialize/render logic split into
// ssr-serialize.ts and ssr-render.ts respectively.

import { isUse } from "../reactive/core.ts";
import { escapeHtml, splitSet } from "./dom-utils.ts";

const SSR_MARKER = Symbol("kiaao.ssr.safe");

export interface SSRSafe {
  [SSR_MARKER]: true;
  html: string;
}

export function ssr(text: string): SSRSafe {
  return { [SSR_MARKER]: true as const, html: text };
}

export function isSSRSafe(v: any): v is SSRSafe {
  return v && v[SSR_MARKER] === true && typeof v.html === "string";
}

/** 判断是否为纯对象（用于映射表模式检测） */
export function isPlainObject(v: any): boolean {
  return !!v && v.constructor === Object && !isSSRSafe(v);
}

const VOID_ELEMENTS = splitSet(
  "area base br col embed hr img input link meta param source track wbr",
);

export function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag);
}

export function renderSSRChild(child: any): string {
  if (child == null || typeof child === "boolean") return "";
  if (isSSRSafe(child)) return child.html;
  if (typeof child === "string" || typeof child === "number") return escapeHtml(String(child));
  if (isUse(child)) return escapeHtml(String(child()));
  if (typeof child === "function") return renderSSRChild(child());
  if (child instanceof Node) return "";
  return "";
}
