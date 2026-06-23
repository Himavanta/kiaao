// kiaao — createApp: application root with Owner lifecycle management
// Replaces the old global mount/unmount functions.

import { createOwner, disposeOwner, triggerMount, currentOwner } from "./owner.ts";
import { h } from "./h.ts";
import { getAdapter } from "./types.ts";

export interface App {
  mount(container: string | Node): void;
  unmount(): void;
}

import type { ComponentFunction } from "./component.ts";

/**
 * 创建一个kiaao应用实例。
 * 内部创建根 Owner，管理整个组件树的生命周期。
 *
 * @param component 根组件函数
 * @param props 根组件 props（可选）
 * @returns App 实例（mount / unmount）
 *
 * @example
 * ```ts
 * import { createApp } from "kiaao";
 *
 * function App() {
 *   return h("div", null, "Hello");
 * }
 *
 * const app = createApp(App);
 * app.mount("#app");
 * // 稍后
 * app.unmount();
 * ```
 */
export function createApp(component: ComponentFunction, props?: Record<string, any>): App {
  // 创建根 Owner（无父级）
  const rootOwner = createOwner();

  // 渲染组件
  const prevOwner = currentOwner.get();
  currentOwner.set(rootOwner);
  const nodes = h(component, props);
  currentOwner.set(prevOwner);

  // 注册所有根节点到根 Owner
  const nodeList = Array.isArray(nodes) ? nodes.flat(Infinity) : [nodes];
  for (const n of nodeList) {
    if (n instanceof Node) rootOwner.elements.add(n);
  }
  const rootNodes: Node[] = nodeList.filter((n): n is Node => n instanceof Node);

  return {
    mount(container: Element): void {
      const adapter = getAdapter();

      // 将根节点插入 DOM
      for (const node of rootNodes) {
        adapter.append(container, node);
      }

      // 触发 onMount
      triggerMount(rootOwner);
    },

    unmount(): void {
      disposeOwner(rootOwner);
    },
  };
}
