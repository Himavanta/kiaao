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
export const setClassName = (el: Element, cls: string) => {
  if (el.namespaceURI === SVG_NS) {
    el.setAttribute("class", cls);
  } else {
    (el as HTMLElement).className = cls;
  }
};
export const setCssText = (el: Element, css: string) => {
  (el as HTMLElement).style.cssText = css;
};

export const getPathname = (): string => window.location.pathname;
export const getSearch = (): string => window.location.search;
export const pushState = (path: string) => history.pushState(null, "", path);
export const parseSearch = (search: string): URLSearchParams => new URLSearchParams(search);
export const qs = <T extends Element>(selector: string) => document.querySelector<T>(selector);
