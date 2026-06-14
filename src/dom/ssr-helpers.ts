import {
  isBoolean,
  isFunction,
  isNil,
  isNode,
  isNumber,
  isPlainObject,
  isString,
} from "../utils/type-guards.ts";
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
  return v && v[SSR_MARKER] === true && isString(v.html);
}

/** 判断是否为纯对象（用于映射表模式检测） */
/**
 * 判断是否为 when 映射表。
 * 纯对象 + 排除 SSR 安全对象（{ html: string }），防止 SSR 渲染时误判。
 */
export function isMappingTable(v: any): boolean {
  return isPlainObject(v) && !isSSRSafe(v);
}

const VOID_ELEMENTS = splitSet(
  "area base br col embed hr img input link meta param source track wbr",
);

export function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag);
}

export function renderSSRChild(child: any): string {
  if (isNil(child) || isBoolean(child)) return "";
  if (isSSRSafe(child)) return child.html;
  if (isString(child) || isNumber(child)) return escapeHtml(String(child));
  if (isUse(child)) return escapeHtml(String(child()));
  if (isFunction(child)) return renderSSRChild(child());
  if (isNode(child)) return "";
  return "";
}
