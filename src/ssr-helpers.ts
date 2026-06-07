// kiaao — SSR helper functions shared between dom.ts and components.ts

import { IS_REACTIVE, SSR_COMPONENT } from "./types.ts";
import { escapeHtml, escapeAttr } from "./escape.ts";

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

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export function renderSSRChild(child: any): string {
  if (child == null || typeof child === "boolean") return "";
  if (isSSRSafe(child)) return child.html;
  if (typeof child === "string" || typeof child === "number") return escapeHtml(String(child));
  if ((child as any)[IS_REACTIVE]) return escapeHtml(String(child()));
  if (typeof child === "function") return renderSSRChild(child());
  if (child instanceof Node) return "";
  return "";
}

export function hSSR(tag: any, props: any, children: any[]): SSRSafe {
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

  let html = `<${tag}`;

  if (props && typeof props === "object") {
    for (const key of Object.keys(props)) {
      if (key === "children") continue;

      // Resolve reactive function values to their current static value
      let val = props[key];
      if ((val as any)?.[IS_REACTIVE]) val = val();

      if (key.startsWith("on")) {
        continue;
      } else if (key === "class" || key === "className") {
        html += ` class="${escapeAttr(val)}"`;
      } else if (key === "style") {
        if (typeof val === "string") {
          html += ` style="${escapeAttr(val)}"`;
        } else if (typeof val === "object" && val !== null) {
          const cssText = Object.entries(val)
            .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v}`)
            .join("; ");
          html += ` style="${escapeAttr(cssText)}"`;
        }
      } else {
        html += ` ${key}="${escapeAttr(String(val))}"`;
      }
    }
  }

  if (VOID_ELEMENTS.has(tag)) return ssr(html + " />");
  html += ">";

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
