// kiaao — SSR RenderAdapter implementation
// Creates lightweight serializable node trees for string rendering.

import { splitSet } from "../adapter/index.ts";
import { definitionMode, isNil, isNotNil, isObject, attrToString } from "../core/index.ts";
import type { RenderAdapter, CleanupFn } from "../core/index.ts";

// ── HTML Escaping (SSR) ───────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── SSR Node Types ───────────────────────────────────

interface SSRElement {
  type: "element";
  tag: string;
  attrs: Record<string, string | boolean>;
  children: SSRNode[];
}

interface SSRText {
  type: "text";
  value: string;
}

interface SSRComment {
  type: "comment";
  value: string;
}

type SSRNode = SSRElement | SSRText | SSRComment;

// ── Serialization ────────────────────────────────────

const VOID_ELEMENTS = splitSet(
  "area base br col embed hr img input keygen link meta param source track wbr",
);

/** 将 SSR 节点树序列化为 HTML 字符串 */
export function serializeSSRNode(node: SSRNode): string {
  if (node.type === "text") return escapeHtml(node.value);
  if (node.type === "comment") return `<!--${node.value}-->`;

  // Element
  const tag = node.tag;
  let attrs = "";
  for (const [key, val] of Object.entries(node.attrs)) {
    if (val === true) {
      attrs += ` ${key}`;
    } else if (val !== false && isNotNil(val)) {
      attrs += ` ${key}="${escapeAttr(String(val))}"`;
    }
  }

  if (VOID_ELEMENTS.has(tag)) return `<${tag}${attrs} />`;

  let html = `<${tag}${attrs}>`;
  for (const child of node.children) {
    html += serializeSSRNode(child);
  }
  html += `</${tag}>`;
  return html;
}

const EVENT_RE = /^on[A-Z]/;

// ── Style Object Serialization ─────────────────────────

/**
 * camelCase → kebab-case。
 * 例：`backgroundColor` → `background-color`
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * 将 style 对象序列化为 CSS 字符串。
 * 例：`{ color: "red", fontSize: "16px" }` → `"color: red; font-size: 16px"`
 *
 * - 过滤 null/undefined/空字符串；
 * - key 驼峰转短横线；
 * - value 原样拼接（数字按字符串输出，与浏览器 CSSStyleDeclaration 一致）。
 */
function styleObjectToString(style: object): string {
  return Object.entries(style)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${camelToKebab(k)}: ${v}`)
    .join("; ");
}

// ── SSR Adapter ──────────────────────────────────────

export const ssrAdapter: RenderAdapter = {
  el(tag: string): SSRElement {
    return { type: "element", tag, attrs: {}, children: [] };
  },

  text(text: string): SSRText {
    return { type: "text", value: text };
  },

  comment(text: string): SSRComment {
    return { type: "comment", value: text };
  },

  before(_ref: unknown, _child: unknown): void {
    // SSR 中不需要 DOM 级别的 before/append 顺序管理
  },

  append(parent: unknown, child: unknown): void {
    const p = parent as SSRElement;
    const c = child as SSRNode;
    if (p.type === "element") {
      p.children.push(c);
    }
  },

  remove(_node: unknown): void {
    // SSR 无 DOM，空操作
  },

  replace(_oldNode: unknown, ..._newNodes: unknown[]): void {
    // SSR 无 DOM，空操作
  },

  setText(node: unknown, value: string): void {
    const n = node as SSRText;
    if (n.type === "text") n.value = value;
  },

  clear(parent: unknown): void {
    if (!isObject(parent)) return;
    const p = parent as SSRElement;
    if (p.type === "element") p.children.length = 0;
  },

  isNode(value: unknown): value is SSRNode {
    return isObject(value) && "type" in value;
  },

  isElement(value: unknown): value is SSRElement {
    return isObject(value) && (value as any).type === "element";
  },

  createStaticDerived(fn, _deps) {
    const value = fn(undefined);
    return definitionMode(value);
  },

  setProp(el: unknown, key: string, value: unknown, _cleanups?: CleanupFn[]): void {
    const element = el as SSRElement;
    if (element.type !== "element") return;

    if (isNil(value) || value === false) return;

    // prop: 前缀 → SSR 不输出
    if (key.startsWith("prop:")) return;
    // attr: 前缀 → 去掉前缀后存储
    const actualKey = key.startsWith("attr:") ? key.slice(5) : key;

    // 事件属性不输出（匹配 JSX 事件约定 onClick、onMouseDown 等）
    if (EVENT_RE.test(actualKey)) return;

    if (value === true) {
      // 布尔值 true → bare attribute（如 <input disabled>）
      element.attrs[actualKey] = true;
      return;
    }

    // style 对象 → 序列化为 CSS 字符串（与浏览器 adapter 的 Object.assign(el.style, value) 等价）
    if (actualKey === "style" && isObject(value)) {
      element.attrs[actualKey] = styleObjectToString(value as object);
      return;
    }

    // 其他属性作为字符串输出到 SSR
    element.attrs[actualKey] = attrToString(value);
  },
};
