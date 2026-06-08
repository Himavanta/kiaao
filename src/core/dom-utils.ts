// kiaao — DOM utility wrappers for better minification

export const createElement = (tag: string): HTMLElement => document.createElement(tag);
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
export const setClassName = (el: HTMLElement, cls: string) => {
  el.className = cls;
};
export const setCssText = (el: HTMLElement, css: string) => {
  el.style.cssText = css;
};

export const getPathname = (): string => window.location.pathname;
export const getSearch = (): string => window.location.search;
export const pushState = (path: string) => history.pushState(null, "", path);
export const parseSearch = (search: string): URLSearchParams => new URLSearchParams(search);
export const qs = <T extends Element>(selector: string) => document.querySelector<T>(selector);
