// kiaao — router: 内部 RouteGroup 与 RouterView 工厂
//
// 不导出。RouteGroup 是递归机件，createRouter 把顶层 RouteGroup 绑定为 Router。

import type { ComponentFunction, HResult, Signal } from "../core/index.ts";
import { Case, h, use } from "../core/index.ts";
import type { RouteMap } from "./types.ts";
import { extractSegment } from "./utils.ts";

// ── RouteGroup 工厂 ────────────────────────────────────

interface RouterGroupFactoryOptions {
  routes: RouteMap;
  base: string;
  current: Signal<string>;
}

/**
 * 内部递归机件。
 *
 * - 取 `routes[""]` 作为 layout（必传且是函数，由 createRouter 校验）；
 * - 将对象类型的子路由包装为新的 RouteGroup 工厂；
 * - 函数类型的子路由保持原样，作为叶子组件；
 * - 返回的 ComponentFunction 渲染 layout，并将嵌套的 RouterView 通过 props 注入。
 */
export function createRouterGroup(options: RouterGroupFactoryOptions): ComponentFunction {
  const { routes, base, current } = options;
  const indexEntry = routes[""];
  const others: Record<string, ComponentFunction> = {};

  // 预处理：对象 → RouteGroup 工厂；函数 → 叶子组件
  for (const key of Object.keys(routes)) {
    if (key === "") continue;
    const value = routes[key];
    if (typeof value === "function") {
      // 叶子：保持原函数作为 ComponentFunction
      others[key] = value;
    } else {
      // 目录：递归构造 RouteGroup 工厂
      const childBase = base === "/" ? `/${key}` : `${base}/${key}`;
      others[key] = createRouterGroup({
        routes: value,
        base: childBase,
        current,
      });
    }
  }

  // layout 必为函数（createRouter 入口校验）。此处再次保护。
  if (typeof indexEntry !== "function") {
    return () => null;
  }

  const IndexLayout: ComponentFunction = indexEntry;

  return function RouteGroupComponent(_props, _context): HResult {
    // 每次调用都创建新的 RouterView，闭包捕获 `others` 与 `base`
    const RouterView: ComponentFunction = (viewProps, _viewContext): HResult => {
      const segment = use(current, () => extractSegment(current(), base));
      // children 可能为单个函数（normalizeChildren 后）或函数数组，都兼容
      const children = viewProps?.children;
      const fallback = Array.isArray(children)
        ? children[0]
        : (children as (() => unknown) | undefined);
      // eslint-disable-next-line typescript/no-explicit-any
      return h(Case as any, { value: segment }, others, fallback);
    };

    return h(IndexLayout, { RouterView });
  };
}
