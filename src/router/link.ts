// kiaao — router: Link 组件
// 设计依据见 docs/路由/v2实施/01-设计决策.md

import type { ComponentFunction } from "../core/index.ts";
import { h, toValue } from "../core/index.ts";
import type { RouterLinkProps } from "./types.ts";

/**
 * 创建 Link 组件。to 支持 string 或 Signal<string>。
 * - href 直接透传信号，由 setProps 建立响应式绑定；
 * - onClick 中通过 toValue 取当前值。
 */
export function createRouterLink(push: (path: string) => Promise<void>): ComponentFunction {
  return function Link(props: RouterLinkProps): ReturnType<typeof h> {
    const { to, children, onClick: userOnClick, ...rest } = props;
    return h(
      "a",
      {
        ...rest,
        href: to,
        onClick: (e: Event) => {
          e.preventDefault();
          userOnClick?.(e);
          push(toValue(to)).catch(() => {});
        },
      },
      children,
    );
  };
}
