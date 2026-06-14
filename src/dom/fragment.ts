// kiaao — Fragment 组件
// 用 <div style="display:contents"> 包裹子节点，实现无额外 DOM 容器的效果。

import { h } from "./h.ts";

export const Fragment = (props: { children?: any }): Node =>
  h("div", { style: { display: "contents" } }, props.children);
