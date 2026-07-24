// kiaao — router: public types
// 设计依据见 docs/路由/路由API方案v2.md 与 docs/路由/v2实施/01-设计决策.md

import type { ComponentFunction, Signal } from "../core/index.ts";

// ── RouteMap ───────────────────────────────────────────

/**
 * 嵌套路由定义。
 *
 * - 叶子节点：函数值，自动包装为 `{ "": fn }`；
 * - 目录节点：对象值，含 `""` 键指向其 layout/索引页；
 * - `""` 必传且必须是 ComponentFunction（运行时校验）。
 *
 * key 不允许包含 `/`，违反此约束视为用户错误，框架不做任何自动处理。
 */
export type RouteMap = {
  [segment: string]: ComponentFunction | RouteMap;
};

// ── RouterOptions ──────────────────────────────────────

/**
 * createRouter 的入参。
 *
 * - routes：嵌套路由树；运行时校验其含 `""` 键且为函数；
 * - onRoute：导航守卫，async / void / string 三种返回：
 *   - void：放行
 *   - string：重定向，再次进入 onRoute
 *   - Promise：异步决策
 *
 * 全局 fallback 不需要。用户通过 `<RouterView>{() => <NotFound/>}</RouterView>`
 * 在 layout 内部提供局部 fallback。
 */
export interface RouterOptions {
  routes: RouteMap;

  onRoute?: (to: string, from: string | null) => string | void | Promise<string | void>;
}

// ── Router (createRouter 返回值) ──────────────────────

/**
 * createRouter 的对外契约。
 *
 * - Router：顶层组件，在应用根处渲染；
 * - Link：声明式导航，to 支持 string 或 Signal；
 * - push：编程式导航，异步，触发 onRoute；
 * - current：pathname 的派生只读信号；
 * - search：query 解析后的派生只读信号。
 */
export interface Router {
  Router: ComponentFunction;
  Link: ComponentFunction;
  push: (path: string) => Promise<void>;
  current: Signal<string>;
  search: Signal<Record<string, string>>;
}

// ── 内部组件 props ────────────────────────────────────

/**
 * RouterView 接收的 props。
 *
 * 通过 props 注入到 layout 组件中：
 *   function RootLayout({ RouterView }) { return <RouterView /> }
 */
export interface RouterViewProps {
  /**
   * 局部 fallback。
   *
   * 当当前 segment 没有匹配任何子路由时，调用第一个元素作为 fallback 渲染。
   */
  children?: [() => unknown];
}

/**
 * Link 组件接收的 props。
 *
 * to 支持两种类型：
 * - string：静态路径；
 * - Signal<string>：信号，路由变化时重新解析。
 */
export interface RouterLinkProps {
  to: string | Signal<string>;
  children?: unknown;
  onClick?: (e: Event) => void;
  [key: string]: unknown;
}

// ── 内部辅助类型 ──────────────────────────────────────

/**
 * runGuard 的返回类型。
 *
 * - ok: true 表示守卫放行或返回重定向目标，target / next 是下一次迭代值；
 * - ok: false 表示守卫未通过（throw / reject 或重定向超限），调用方按 navigate 模式处理。
 */
export type GuardResult = { ok: true; target: string; next: number } | { ok: false };

/**
 * RouteGroup 工厂入参（内部类型）。
 */
export interface RouteGroupProps {
  routes: RouteMap;
  base: string;
  current: Signal<string>;
}
