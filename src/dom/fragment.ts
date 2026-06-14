// kiaao — Fragment 组件
// 用 <div style="display:contents"> 包裹子节点，实现无额外 DOM 容器的效果。

import { h } from "./h.ts";

export function Fragment(props: { children?: any }): Node {
  return h("div", { style: { display: "contents" } }, props.children);
}
