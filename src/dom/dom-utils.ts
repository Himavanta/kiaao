// kiaao — DOM utility wrappers + HTML escaping

const SVG_NS = "http://www.w3.org/2000/svg";

/** 空格分隔字符串 → Set */
const splitSet = (str: string): Set<string> => new Set(str.trim().split(/\s+/));

/** 仅通过标签名即可确定为 SVG 的标签集合 */
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

/**
 * 需要在客户端走 setAttribute、在 SSR 中输出的属性集合。
 */
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

export { FORCE_ATTRIBUTE, splitSet };

// ── Attribute Prefix ──────────────────────────────────

export const stripPrefix = (rawKey: string): { prefix: "attr" | "prop" | null; key: string } => {
  const prefix = rawKey.startsWith("attr:") ? "attr" : rawKey.startsWith("prop:") ? "prop" : null;
  return { prefix, key: prefix ? rawKey.slice(5) : rawKey };
};

// ── DOM Creation ──────────────────────────────────────

export const createElement = (tag: string): Element => {
  if (SVG_TAGS.has(tag)) return document.createElementNS(SVG_NS, tag);
  return document.createElement(tag);
};

export const createTextNode = (text: string): Text => document.createTextNode(text);
export const createComment = (text: string): Comment => document.createComment(text);
export const createFragment = (): DocumentFragment => document.createDocumentFragment();

// ── DOM Manipulation ──────────────────────────────────

export const setAttr = (el: Element, key: string, value: string) => el.setAttribute(key, value);
export const removeAttr = (el: Element, key: string) => el.removeAttribute(key);
export const getAttr = (el: Element, key: string) => el.getAttribute(key);
export const addEvent = (el: EventTarget, type: string, handler: any) =>
  el.addEventListener(type, handler);

// ── DOM Traversal ─────────────────────────────────────

export const firstChild = (el: Node): Node | null => el.firstChild;
export const parentNode = (el: Node): Node | null => el.parentNode;
export const prevSibling = (el: Node): Node | null => el.previousSibling;
export const isConnected = (el: Node): boolean => el.isConnected;
export const nodeType = (el: Node): number => el.nodeType;

// ── Query Selector ────────────────────────────────────

export const qs = <T extends Element>(selector: string) => document.querySelector<T>(selector);

// ── HTML Escaping (SSR) ───────────────────────────────

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const escapeAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
