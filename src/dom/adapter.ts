// kiaao — Browser RenderAdapter implementation
// Implements the platform-agnostic RenderAdapter interface for browser DOM.

import type { RenderAdapter } from "../core/types.ts";

// ── SVG ───────────────────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg";

const splitSet = (str: string): Set<string> => new Set(str.trim().split(/\s+/));

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

  insertBefore(parent: Node, child: Node, ref: Node | null): void {
    parent.insertBefore(child, ref);
  },

  removeElement(el: Node): void {
    el.parentNode?.removeChild(el);
  },

  replaceWith(oldNode: Node, ...newNodes: Node[]): void {
    (oldNode as any).replaceWith(...newNodes);
  },

  setAttribute(el: Element, key: string, value: string): void {
    el.setAttribute(key, value);
  },

  removeAttribute(el: Element, key: string): void {
    el.removeAttribute(key);
  },

  addEventListener(el: EventTarget, type: string, handler: Function): void {
    el.addEventListener(type, handler as EventListener);
  },

  removeEventListener(el: EventTarget, type: string, handler: Function): void {
    el.removeEventListener(type, handler as EventListener);
  },

  setProperty(el: any, key: string, value: unknown): void {
    el[key] = value;
  },
};
