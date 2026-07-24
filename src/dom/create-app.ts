// kiaao — createApp: 应用入口，接受组件函数，内部通过 h() 完成渲染

import { getAdapter } from "../adapter/index.ts";
import {
  createOwner,
  disposeOwner,
  triggerMount,
  h,
  type ComponentFunction,
} from "../core/index.ts";
import { isString } from "../core/index.ts";
import { querySelector } from "./dom-utils.ts";

export interface App {
  mount(target: string | Element): void;
  unmount(): void;
}

/**
 * 创建一个 kiaao 应用实例。
 *
 * 接受组件函数，内部调用 `h(component)` 完成渲染，
 * 管理整个组件树的生命周期。
 *
 * mount 支持 CSS 选择器字符串或 Element 对象。
 *
 * 用法：
 *   createApp(MyComponent).mount("#app");
 *   createApp(() => <App name="kiaao" />).mount(document.body);
 */
export function createApp(component: ComponentFunction): App {
  const hr = h(component);
  const rootOwner = createOwner();
  const appOwner = hr.owner;

  if (appOwner) {
    rootOwner.children.push(appOwner);
    appOwner.parent = rootOwner;
  }

  function resolveContainer(target: string | Element): Element {
    if (isString(target)) {
      const el = querySelector(target);
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
