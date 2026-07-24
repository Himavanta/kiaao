// kiaao — router: Link 组件
// 设计依据见 docs/路由/v2实施/01-设计决策.md

import type { ComponentFunction } from "../core/index.ts";
import { h, isUse } from "../core/index.ts";
import type { RouterLinkProps } from "./types.ts";

/**
 * 解析 to 为字符串路径。支持：
 * - string：原样返回；
 * - () => string：每次调用执行 getter；
 * - Signal<string>：每次调用读取信号当前值。
 */
function resolveLinkTarget(to: RouterLinkProps["to"]): string {
  if (typeof to === "string") return to;
  if (isUse(to)) return (to as () => string)();
  if (typeof to === "function") return (to as () => string)();
  return String(to);
}

/**
 * 创建 Link 组件。
 *
 * - to 支持 string / (() => string) / Signal<string>；
 * - onClick 拦截：preventDefault 后调用 push；
 * - 异步 push 采用火灾即忘语义，错误静默处理（已被 createRouter 的 onRoute reject 处理）。
 */
export function createRouterLink(push: (path: string) => Promise<void>): ComponentFunction {
  return function Link(props: RouterLinkProps): ReturnType<typeof h> {
    const { to, children, onClick: userOnClick, ...rest } = props;

    // eslint-disable-next-line typescript/no-explicit-any
    return h(
      "a" as any,
      {
        ...rest,
        href: resolveLinkTarget(to),
        onClick: (e: Event) => {
          e.preventDefault();
          userOnClick?.(e);
          const path = resolveLinkTarget(to);
          push(path).catch(() => {});
        },
      },
      children,
    );
  };
}
