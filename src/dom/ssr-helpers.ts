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

export const ssr = (text: string): SSRSafe => ({ [SSR_MARKER]: true as const, html: text });

export const isSSRSafe = (v: any): v is SSRSafe => v && v[SSR_MARKER] === true && isString(v.html);

/**
 * 判断是否为 when 映射表。
 * 纯对象 + 排除 SSR 安全对象（{ html: string }），防止 SSR 渲染时误判。
 */
export const isMappingTable = (v: any): boolean => isPlainObject(v) && !isSSRSafe(v);

const VOID_ELEMENTS = splitSet(
  "area base br col embed hr img input link meta param source track wbr",
);

export const isVoidElement = (tag: string): boolean => VOID_ELEMENTS.has(tag);

export function renderSSRChild(child: any): string {
  if (isNil(child) || isBoolean(child)) return "";
  if (isSSRSafe(child)) return child.html;
  if (isString(child) || isNumber(child)) return escapeHtml(String(child));
  if (isUse(child)) return escapeHtml(String(child()));
  if (isFunction(child)) return renderSSRChild(child());
  if (isNode(child)) return "";
  return "";
}
