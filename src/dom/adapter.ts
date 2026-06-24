// kiaao — Browser RenderAdapter implementation
// Implements the platform-agnostic RenderAdapter interface for browser DOM.

import type { RenderAdapter } from "../core/types.ts";
import { isObject } from "../utils/type-guards.ts";

// ── SVG ───────────────────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg";

const splitSet = (str: string): Set<string> => new Set(str.trim().split(/\s+/));

const VOID_ELEMENTS = splitSet(
  "area base br col embed hr img input link meta param source track wbr",
);

const SVG_TAGS = splitSet(
  "svg g defs symbol marker clipPath mask pattern switch use foreignObject " +
    "circle ellipse rect line polyline polygon path " +
    "text tspan textPath " +
    "linearGradient radialGradient stop " +
    "filter feBlend feColorMatrix feComponentTransfer " +
    "feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap " +
    "feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR " +
    "feGaussianBlur feImage feMerge feMergeNode feMorphology " +
    "feOffset feSpecularLighting feTile feTurbulence " +
    "animate animateTransform animateMotion set " +
    "desc metadata image",
);

// ── FORCE_ATTRIBUTE Set ────────────────────────────────
// 需要在客户端走 setAttribute、在 SSR 中输出的属性集合。

const FORCE_ATTRIBUTE = splitSet(
  "class id lang dir title hidden tabindex " +
    "accesskey contenteditable draggable spellcheck " +
    "autocapitalize translate slot " +
    "name type placeholder required disabled readonly " +
    "maxlength minlength size min max step pattern " +
    "autocomplete autofocus multiple accept capture selected " +
    "href target rel download hreflang ping referrerpolicy " +
    "src alt width height srcset sizes loading decoding " +
    "crossorigin poster preload autoplay controls loop muted playsinline " +
    "srcdoc sandbox allow allowfullscreen frameborder " +
    "colspan rowspan headers scope " +
    "async defer integrity media charset httpEquiv " +
    "for usemap ismap cite datetime " +
    "form formaction formenctype formmethod formnovalidate " +
    "formtarget novalidate nonce",
);

export { FORCE_ATTRIBUTE };

// ── Adapter ───────────────────────────────────────────

export const browserAdapter: RenderAdapter = {
  createElement(tag: string): Element {
    if (SVG_TAGS.has(tag)) return document.createElementNS(SVG_NS, tag);
    return document.createElement(tag);
  },

  createTextNode(text: string): Text {
    return document.createTextNode(text);
  },

  createComment(text: string): Comment {
    return document.createComment(text);
  },

  before(ref: Node, child: Node): void {
    (ref as ChildNode).before(child);
  },

  append(parent: Node, child: Node): void {
    if (VOID_ELEMENTS.has((parent as Element).localName || "")) return;
    (parent as ParentNode).append(child);
  },

  remove(node: Node): void {
    (node as ChildNode).remove();
  },

  replaceWith(oldNode: Node, ...newNodes: Node[]): void {
    (oldNode as ChildNode).replaceWith(...newNodes);
  },

  removeEventListener(el: EventTarget, type: string, handler: (...args: any[]) => void): void {
    el.removeEventListener(type, handler as EventListener);
  },

  addEventListener(el: EventTarget, type: string, handler: (...args: any[]) => void): void {
    el.addEventListener(type, handler as EventListener);
  },

  isNode(value: unknown): value is Node {
    return value instanceof Node;
  },

  setProp(el: any, key: string, value: unknown): void {
    // attr: 前缀 → 强制 setAttribute
    if (key.startsWith("attr:")) {
      el.setAttribute(key.slice(5), String(value));
      return;
    }
    // prop: 前缀 → 强制 property
    if (key.startsWith("prop:")) {
      el[key.slice(5)] = value;
      return;
    }
    // SVG：所有属性走 setAttribute
    if (el instanceof SVGElement) {
      if (value === true) {
        el.setAttribute(key, "");
        return;
      }
      if (value === false || value == null) {
        el.removeAttribute(key);
        return;
      }
      el.setAttribute(key, isObject(value) ? JSON.stringify(value) : String(value));
      return;
    }
    if (FORCE_ATTRIBUTE.has(key) || key.startsWith("aria-") || key.startsWith("data-")) {
      if (value === true) {
        el.setAttribute(key, "");
        return;
      }
      if (value === false || value == null) {
        el.removeAttribute(key);
        return;
      }
      el.setAttribute(key, isObject(value) ? JSON.stringify(value) : String(value));
      return;
    }
    el[key] = value;
  },
};
