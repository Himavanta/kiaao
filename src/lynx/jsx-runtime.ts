// kiaao/lynx — JSX runtime 桥接
// 复用主 JSX runtime，只为 lynx 提供类型入口

export { jsx, jsxs, jsxDEV, Fragment } from "../jsx-runtime/index.ts";

export namespace JSX {
  export interface IntrinsicElements {
    view: Record<string, any>;
    text: Record<string, any>;
    image: Record<string, any>;
    "scroll-view": Record<string, any>;
    list: Record<string, any>;
    page: Record<string, any>;
    input: Record<string, any>;
    "raw-text": Record<string, any>;
    [elem: string]: any;
  }
}
