// kiaao v4 — SSR helper functions shared between h.ts and components

import { isUse } from "../reactive/core.ts";
import { SSR_COMPONENT } from "../reactive/types.ts";
import { escapeHtml, escapeAttr, FORCE_ATTRIBUTE, stripPrefix, splitSet } from "./dom-utils.ts";

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

function stripDirectives(props: any): any {
  if (!props || typeof props !== "object") return props;
  const { when: _when, each: _each, key: _key, else: _else, ...rest } = props;
  return rest;
}

function serializeAttrs(props: any): string {
  if (!props || typeof props !== "object") return "";
  let html = "";
  for (const rawKey of Object.keys(props)) {
    if (rawKey === "children") continue;

    let val = props[rawKey];
    if (isUse(val)) val = val();
    if (val == null || val === false) continue;

    const { prefix, key } = stripPrefix(rawKey);

    if (prefix === "prop") continue;

    if (prefix === "attr") {
      if (val === true) {
        html += ` ${key}`;
      } else {
        html += ` ${key}="${escapeAttr(String(val))}"`;
      }
      continue;
    }

    if (key.startsWith("on")) continue;

    if (key === "style") {
      if (typeof val === "string") {
        html += ` style="${escapeAttr(val)}"`;
      } else if (typeof val === "object" && val !== null) {
        const cssText = Object.entries(val as Record<string, string | number>)
          .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v}`)
          .join("; ");
        html += ` style="${escapeAttr(cssText)}"`;
      }
      continue;
    }

    if (key.startsWith("aria-") || key.startsWith("data-")) {
      html += ` ${key}="${escapeAttr(String(val))}"`;
      continue;
    }

    if (FORCE_ATTRIBUTE.has(key)) {
      if (val === true) {
        html += ` ${key}`;
      } else {
        html += ` ${key}="${escapeAttr(String(val))}"`;
      }
      continue;
    }
  }
  return html;
}

export function hSSR(tag: any, props: any, children: any[]): SSRSafe {
  if (typeof tag !== "string" && typeof tag !== "function") {
    return ssr("");
  }
  if (typeof tag === "function") {
    const ssrVariant = (tag as any)[SSR_COMPONENT];
    if (ssrVariant) {
      const result = ssrVariant(props || {});
      if (isSSRSafe(result)) return result;
      if (typeof result === "string") return ssr(result);
      return ssr("");
    }
    const result = tag(props || {});
    if (isSSRSafe(result)) return result;
    if (typeof result === "string") return ssr(result);
    if (result && typeof result === "object" && "html" in result) return ssr(result.html);
    return ssr("");
  }

  if (props?.when !== undefined) {
    const whenVal = typeof props.when === "function" ? props.when() : props.when;
    const elseFn = props.else;

    if (children.length === 1 && isPlainObject(children[0])) {
      const map = children[0];
      const branchFn = map[whenVal];
      if (branchFn) {
        const result = branchFn();
        const inner = renderSSRChild(result);
        const attrs = serializeAttrs(stripDirectives(props));
        if (VOID_ELEMENTS.has(tag)) return ssr(`<${tag}${attrs} />`);
        return ssr(`<${tag}${attrs}>${inner}</${tag}>`);
      }
      if (elseFn) {
        const result = elseFn();
        const inner = renderSSRChild(result);
        const attrs = serializeAttrs(stripDirectives(props));
        if (VOID_ELEMENTS.has(tag)) return ssr(`<${tag}${attrs} />`);
        return ssr(`<${tag}${attrs}>${inner}</${tag}>`);
      }
      const attrs = serializeAttrs(stripDirectives(props));
      if (VOID_ELEMENTS.has(tag)) return ssr(`<${tag}${attrs} />`);
      return ssr(`<${tag}${attrs}></${tag}>`);
    }

    const truthy = Boolean(whenVal);
    if (!truthy && elseFn) {
      const result = elseFn();
      const inner = renderSSRChild(result);
      const attrs = serializeAttrs(stripDirectives(props));
      if (VOID_ELEMENTS.has(tag)) return ssr(`<${tag}${attrs} />`);
      return ssr(`<${tag}${attrs}>${inner}</${tag}>`);
    }
    if (VOID_ELEMENTS.has(tag)) {
      return truthy ? ssr(`<${tag}${serializeAttrs(stripDirectives(props))} />`) : ssr("");
    }
    if (truthy) {
      return hSSR(tag, stripDirectives(props), children);
    }
    return ssr(`<${tag}${serializeAttrs(stripDirectives(props))}></${tag}>`);
  }

  if (props?.each !== undefined) {
    if (VOID_ELEMENTS.has(tag)) {
      throw new Error(`each cannot be used on void element <${tag}>`);
    }
    const items = typeof props.each === "function" ? props.each() : props.each;
    const attrs = serializeAttrs(stripDirectives(props));
    const childFn = children[0];
    let html = `<${tag}${attrs}>`;
    if (Array.isArray(items) && typeof childFn === "function") {
      for (let i = 0; i < items.length; i++) {
        const childResult = childFn(items[i], i);
        html += renderSSRChild(childResult);
      }
    }
    html += `</${tag}>`;
    return ssr(html);
  }

  const attrs = serializeAttrs(props);
  if (VOID_ELEMENTS.has(tag)) return ssr(`<${tag}${attrs} />`);

  let html = `<${tag}${attrs}>`;
  for (const child of children) {
    if (Array.isArray(child)) {
      for (const c of child) html += renderSSRChild(c);
    } else {
      html += renderSSRChild(child);
    }
  }
  html += `</${tag}>`;
  return ssr(html);
}
