// kiaao — SSR attribute serialization

import { isUse } from "../reactive/core.ts";
import { escapeAttr, FORCE_ATTRIBUTE, stripPrefix } from "./dom-utils.ts";
import { isNil, isObject, isRecord, isString } from "../utils/type-guards.ts";

// ── CSS Text Serialization ────────────────────────────

/** 将 CSS 对象序列化为内联样式字符串 */
export function serializeCssText(styleObj: Record<string, string | number>): string {
  return Object.entries(styleObj)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v}`)
    .join("; ");
}

// ── Single Attribute Serialization ────────────────────

/** 序列化单条属性为 HTML 属性字符串 */
export function serializeAttr(rawKey: string, val: any): string {
  const { prefix, key } = stripPrefix(rawKey);

  // prop: 前缀 → 不输出
  if (prefix === "prop") return "";

  // attr: 前缀 → 强制输出
  if (prefix === "attr") {
    if (val === true) return ` ${key}`;
    return ` ${key}="${escapeAttr(String(val))}"`;
  }

  // 事件属性不输出
  if (key.startsWith("on")) return "";

  // style
  if (key === "style") {
    if (isString(val)) return ` style="${escapeAttr(val)}"`;
    if (isObject(val)) {
      return ` style="${escapeAttr(serializeCssText(val as Record<string, string | number>))}"`;
    }
    return "";
  }

  // aria-* / data-*
  if (key.startsWith("aria-") || key.startsWith("data-")) {
    return ` ${key}="${escapeAttr(String(val))}"`;
  }

  // FORCE_ATTRIBUTE
  if (FORCE_ATTRIBUTE.has(key)) {
    if (val === true) return ` ${key}`;
    return ` ${key}="${escapeAttr(String(val))}"`;
  }

  return "";
}

/**
 * 从 props 中移除 when/each/key/else 指令属性。
 */
export function stripDirectives(props: any): any {
  if (!isRecord(props)) return props;
  const { when: _when, each: _each, key: _key, else: _else, ...rest } = props;
  return rest;
}

// ── serializeAttrs ────────────────────────────────────

/** 将 props 序列化为 HTML 属性字符串 */
export function serializeAttrs(props: any): string {
  if (!isRecord(props)) return "";
  let html = "";
  for (const rawKey of Object.keys(props)) {
    if (rawKey === "children") continue;

    let val = props[rawKey];
    if (isUse(val)) val = val();
    if (isNil(val) || val === false) continue;

    html += serializeAttr(rawKey, val);
  }
  return html;
}
