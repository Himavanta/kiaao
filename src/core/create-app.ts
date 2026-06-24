// kiaao — createApp: application root with Owner lifecycle management
// Replaces the old global mount/unmount functions.

import { createOwner, disposeOwner, triggerMount } from "./owner.ts";
import { h } from "./h.ts";
import { isHResult, getAdapter } from "./types.ts";
import type { ComponentFunction } from "./component.ts";

export interface App {
  mount(container: Element): void;
  unmount(): void;
}

/**
 * 创建一个kiaao应用实例。
 * 内部创建根 Owner，管理整个组件树的生命周期。
 */
export function createApp(component: ComponentFunction, props?: Record<string, any>): App {
  const rootOwner = createOwner();

  // 渲染组件 → 获取 HResult
  const hr = h(component, props);
  const appOwner = isHResult(hr) ? hr.owner : null;
  const nodes: Node[] = isHResult(hr) ? [...hr.nodes] : [];

  // 建立根组件的父子关系——通过 Owner 树递归 dispose，无需共享 elements 引用
  if (appOwner) {
    rootOwner.children.push(appOwner);
    appOwner.parent = rootOwner;
  }

  return {
    mount(container: Element): void {
      const adapter = getAdapter();
      for (const node of nodes) {
        adapter.append(container, node);
      }
      triggerMount(rootOwner);
    },

    unmount(): void {
      disposeOwner(rootOwner);
    },
  };
}
