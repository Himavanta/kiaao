// kiaao — Browser RenderAdapter implementation
// Implements the platform-agnostic RenderAdapter interface for browser DOM.

import { splitSet } from "../adapter/index.ts";
import { isObject, isFunction, attrToString } from "../core/index.ts";
import type { RenderAdapter, HostNode, CleanupFn } from "../core/index.ts";
import {
  createElement,
  createElementNS,
  createTextNode,
  createComment,
  addEventListener,
  removeEventListener,
} from "./dom-utils.ts";

// ── SVG ───────────────────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg";

const VOID_ELEMENTS = splitSet(
  "area base br col embed hr img input link meta param source track wbr",
);

const SVG_TAGS = splitSet(
  "svg g defs symbol marker clipPath mask pattern switch use foreignObject circle ellipse rect line polyline polygon path text tspan textPath linearGradient radialGradient stop filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset feSpecularLighting feTile feTurbulence animate animateTransform animateMotion set desc metadata image",
);

// ── FORCE_ATTRIBUTE Set ────────────────────────────────
// 需要在客户端走 setAttribute、在 SSR 中输出的属性集合。

const FORCE_ATTRIBUTE = splitSet(
  "class id lang dir title hidden tabindex accesskey contenteditable draggable spellcheck autocapitalize translate slot name type placeholder required disabled readonly maxlength minlength size min max step pattern autocomplete autofocus multiple accept capture selected href target rel download hreflang ping referrerpolicy src alt width height srcset sizes loading decoding crossorigin poster preload autoplay controls loop muted playsinline srcdoc sandbox allow allowfullscreen frameborder colspan rowspan headers scope async defer integrity media charset httpEquiv for usemap ismap cite datetime form formaction formenctype formmethod formnovalidate formtarget novalidate nonce",
);

const EVENT_RE = /^on[A-Z]/;

// ── Adapter ───────────────────────────────────────────

export const browserAdapter: RenderAdapter = {
  el(tag: string): Element {
    if (SVG_TAGS.has(tag)) return createElementNS(SVG_NS, tag);
    return createElement(tag);
  },

  text(text: string): Text {
    return createTextNode(text);
  },

  comment(text: string): Comment {
    return createComment(text);
  },

  before(ref: Node, child: Node): void {
    (ref as ChildNode).before(child);
  },

  append(parent: Node, child: Node): void {
    // 非元素节点（Text、Comment 等）不能有子节点
    if (parent.nodeType !== 1) return;
    if (VOID_ELEMENTS.has((parent as Element).localName || "")) return;
    (parent as ParentNode).append(child);
  },

  remove(node: Node): void {
    if (!node) return;
    (node as ChildNode).remove();
  },

  setText(node: Node, value: string): void {
    (node as Text).textContent = value;
  },

  clear(parent: Node): void {
    if (parent.nodeType !== 1) return;
    (parent as Element).replaceChildren();
  },

  replace(oldNode: Node, ...newNodes: Node[]): void {
    (oldNode as ChildNode).replaceWith(...newNodes);
  },

  off(el: EventTarget, type: string, handler: (...args: any[]) => void): void {
    removeEventListener(el, type, handler as any);
  },

  on(el: EventTarget, type: string, handler: (...args: any[]) => void): void {
    addEventListener(el, type, handler as any);
  },

  isNode(value: unknown): value is Node {
    return value instanceof Node;
  },

  isElement(value: unknown): value is Element {
    return value instanceof Element;
  },

  prevSibling(node: HostNode): HostNode {
    return (node as Node).previousSibling ?? null;
  },

  setProp(el: any, key: string, value: unknown, cleanups?: CleanupFn[]): void {
    // 事件绑定——on + 大写字母开头（如 onClick、onClickOutside）
    if (EVENT_RE.test(key)) {
      if (isFunction(value)) {
        const eventType = key.slice(2).toLowerCase();
        addEventListener(el, eventType, value as any);
        cleanups?.push(() => removeEventListener(el, eventType, value as any));
      }
      return;
    }

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

    // style 对象 → 全量替换：先清空再合并
    if (key === "style" && isObject(value)) {
      const elStyle = (el as any).style;
      if (elStyle && isObject(elStyle)) {
        el.removeAttribute("style");
        Object.assign(elStyle, value);
        return;
      }
      // SSR 路径（不应走到这里，兜底）
      el.setAttribute("style", attrToString(value));
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
      el.setAttribute(key, attrToString(value));
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
      el.setAttribute(key, attrToString(value));
      return;
    }
    el[key] = value;
  },
};
