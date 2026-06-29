// kiaao — createApp: application root with Owner lifecycle management

import { getAdapter } from "../adapter/index.ts";
import { createOwner, disposeOwner, triggerMount, type HResult } from "../core/index.ts";

export interface App {
  mount(target: string | Element): void;
  unmount(): void;
}

/**
 * 创建一个 kiaao 应用实例。
 * 接受 `h()` 的返回值（HResult），管理整个组件树的生命周期。
 *
 * mount 支持 CSS 选择器字符串或 Element 对象。
 *
 * 用法：
 *   createApp(h(MyComponent, { name: "kiaao" })).mount("#app");
 *   createApp(<MyComponent />).mount(document.body);
 */
export function createApp(hr: HResult): App {
  const rootOwner = createOwner();
  const appOwner = hr.owner;

  if (appOwner) {
    rootOwner.children.push(appOwner);
    appOwner.parent = rootOwner;
  }

  function resolveContainer(target: string | Element): Element {
    if (typeof target === "string") {
      const el = document.querySelector(target);
      if (!el) {
        throw new Error(`[kiaao] createApp mount: target "${target}" not found`);
      }
      return el;
    }
    return target;
  }

  return {
    mount(target: string | Element): void {
      const container = resolveContainer(target);
      const adapter = getAdapter();
      for (const node of hr.nodes) {
        adapter.append(container, node);
      }
      triggerMount(rootOwner);
    },

    unmount(): void {
      disposeOwner(rootOwner);
    },
  };
}
