// kiaao — createApp: application root with Owner lifecycle management

import { getAdapter } from "../adapter/index.ts";
import { createOwner, disposeOwner, triggerMount, type HResult } from "../core/index.ts";

export interface App {
  mount(container: Element): void;
  unmount(): void;
}

/**
 * 创建一个kiaao应用实例。
 * 接受 `h()` 的返回值（HResult），管理整个组件树的生命周期。
 *
 * 用法：
 *   createApp(h(MyComponent, { name: "kiaao" })).mount(document.body);
 */
export function createApp(hr: HResult): App {
  const rootOwner = createOwner();
  const appOwner = hr.owner;

  if (appOwner) {
    rootOwner.children.push(appOwner);
    appOwner.parent = rootOwner;
  }

  return {
    mount(container: Element): void {
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
