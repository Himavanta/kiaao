// kiaao — DOM utility wrappers for better minification

const SVG_NS = "http://www.w3.org/2000/svg";

/** 仅通过标签名即可确定为 SVG 的标签集合（排除 HTML/SVG 共有标签：a, title, style） */
const SVG_TAGS = new Set([
  // 容器
  "svg",
  "g",
  "defs",
  "symbol",
  "marker",
  "clipPath",
  "mask",
  "pattern",
  "switch",
  "use",
  "foreignObject",
  // 几何图形
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "path",
  // 文本
  "text",
  "tspan",
  "textPath",
  // 渐变与填充
  "linearGradient",
  "radialGradient",
  "stop",
  // 滤镜
  "filter",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "feSpecularLighting",
  "feTile",
  "feTurbulence",
  // 动画
  "animate",
  "animateTransform",
  "animateMotion",
  "set",
  // 其他
  "desc",
  "metadata",
  "image",
]);

/**
 * 需要在客户端走 setAttribute、在 SSR 中输出的属性集合。
 * 筛选原则：是否会在纯 HTML 中手写该属性。
 * 显式排除：value（受控组件）、checked（受控组件）。
 */
const FORCE_ATTRIBUTE = new Set([
  // 全局
  "class",
  "id",
  "lang",
  "dir",
  "title",
  "hidden",
  "tabindex",
  "accesskey",
  "contenteditable",
  "draggable",
  "spellcheck",
  "autocapitalize",
  "translate",
  "slot",
  // 表单
  "name",
  "type",
  "placeholder",
  "required",
  "disabled",
  "readonly",
  "maxlength",
  "minlength",
  "size",
  "min",
  "max",
  "step",
  "pattern",
  "autocomplete",
  "autofocus",
  "multiple",
  "accept",
  "capture",
  "selected",
  // 链接
  "href",
  "target",
  "rel",
  "download",
  "hreflang",
  "ping",
  "referrerpolicy",
  // 媒体
  "src",
  "alt",
  "width",
  "height",
  "srcset",
  "sizes",
  "loading",
  "decoding",
  "crossorigin",
  "poster",
  "preload",
  "autoplay",
  "controls",
  "loop",
  "muted",
  "playsinline",
  // iframe
  "srcdoc",
  "sandbox",
  "allow",
  "allowfullscreen",
  "frameborder",
  // 表格
  "colspan",
  "rowspan",
  "headers",
  "scope",
  // script / style / link / meta
  "async",
  "defer",
  "integrity",
  "media",
  "charset",
  "httpEquiv",
  // 其他
  "for",
  "usemap",
  "ismap",
  "cite",
  "datetime",
  "form",
  "formaction",
  "formenctype",
  "formmethod",
  "formnovalidate",
  "formtarget",
  "novalidate",
  "nonce",
]);

export { FORCE_ATTRIBUTE };

/** 剥离 attr: / prop: 前缀，返回前缀类型和裸 key */
export function stripPrefix(rawKey: string): { prefix: "attr" | "prop" | null; key: string } {
  const prefix = rawKey.startsWith("attr:") ? "attr" : rawKey.startsWith("prop:") ? "prop" : null;
  return { prefix, key: prefix ? rawKey.slice(5) : rawKey };
}

export const createElement = (tag: string): Element => {
  if (SVG_TAGS.has(tag)) {
    return document.createElementNS(SVG_NS, tag);
  }
  return document.createElement(tag);
};
export const createTextNode = (text: string): Text => document.createTextNode(text);
export const createComment = (text: string): Comment => document.createComment(text);
export const createFragment = (): DocumentFragment => document.createDocumentFragment();

export const setAttr = (el: Element, key: string, value: string) => el.setAttribute(key, value);
export const removeAttr = (el: Element, key: string) => el.removeAttribute(key);
export const getAttr = (el: Element, key: string) => el.getAttribute(key);
export const addEvent = (el: EventTarget, type: string, handler: any) =>
  el.addEventListener(type, handler);

export const firstChild = (el: Node): Node | null => el.firstChild;
export const parentNode = (el: Node): Node | null => el.parentNode;
export const prevSibling = (el: Node): Node | null => el.previousSibling;
export const isConnected = (el: Node): boolean => el.isConnected;
export const nodeType = (el: Node): number => el.nodeType;

export const getPathname = (): string => window.location.pathname;
export const getSearch = (): string => window.location.search;
export const pushState = (path: string) => history.pushState(null, "", path);
export const parseSearch = (search: string): URLSearchParams => new URLSearchParams(search);
export const qs = <T extends Element>(selector: string) => document.querySelector<T>(selector);
