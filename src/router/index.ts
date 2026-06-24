// kiaao — Router: hash-free client-side routing with nested layout support.

import { h } from "../core/h.ts";
import { use, toValue } from "../core/signal.ts";
import { type Signal, type HResult, type NullableProps } from "../core/types.ts";
import { getPathname, pushState as pushHistory, getSearch, parseSearch } from "./utils.ts";

// ── Types ──────────────────────────────────────────────

export type RouteComponent = (props?: NullableProps) => HResult;

export interface Route {
  /** 单个路径段，不允许包含 /。空字符串表示默认子路由。 */
  path: string;
  component: RouteComponent;
}

/** RouterView 的配置属性，可用于嵌套路由场景。 */
export interface RouterViewProps {
  /** 路径前缀，以 / 开头不含尾 /。该 RouterView 只响应 base 内的路径变化。 */
  base?: string;
  /** 专属路由表。路由表不能为空。 */
  routes: Route[];
  /** 无匹配时的后备内容，不传则使用 createRouter 的全局 fallback。 */
  fallback?: RouteComponent;
}

export interface RouterLinkProps {
  /** 导航目标路径，支持响应式 getter。 */
  to: string | (() => string);
  children?: any;
  onClick?: (e: Event) => void;
  [key: string]: any;
}

export interface RouterOptions {
  /** 当没有路由匹配时显示的后备组件。 */
  fallback?: RouteComponent;
}

export interface Router {
  /** View component — renders the matched route */
  RouterView: (props: RouterViewProps) => HResult;
  /** Programmatic navigation */
  navigate: (path: string) => void;
  /** Current pathname signal (getter) */
  currentPath: Signal<string>;
  /** Current URL query parameters signal (getter) */
  currentParams: Signal<Record<string, string>>;
  /** Declarative navigation link component. */
  Link: (props: RouterLinkProps) => HResult;
}

// ── Segment Extraction ─────────────────────────────────

/**
 * 从完整路径中提取当前 RouterView 负责的第一个路径段。
 * 若设置了 base，先验证路径是否在 base 范围内（startsWith + 斜杠边界检查），
 * 再裁剪得到相对路径，取第一段。
 */
function extractSegment(fullPath: string, base?: string): string | null {
  if (base) {
    if (base === "/") {
      // base="/" 匹配所有路径
    } else {
      if (!fullPath.startsWith(base)) return null;
      if (fullPath.length > base.length && fullPath[base.length] !== "/") return null;
    }
  }

  const relative = base ? fullPath.slice(base.length) : fullPath;
  return relative.replace(/^\/+/, "").split("/")[0] || "";
}

// ── RouterView Factory ────────────────────────────────

/** 创建 RouterView 组件：根据当前路径匹配路由并渲染对应组件 */
function createRouterView(
  defaultFallback: RouteComponent,
  currentPath: Signal<string>,
): (props: RouterViewProps) => HResult {
  return (props: RouterViewProps) => {
    const myRoutes = props.routes;
    const myFallback = props?.fallback ?? defaultFallback;
    const myBase = props?.base;

    // 显式创建派生信号替代自动依赖收集
    // 当 currentPath 变化时，extractSegment 自动重新计算
    const segment = use(currentPath, () => extractSegment(currentPath(), myBase));

    // 将路由表转为映射表（初始化时执行一次）
    const routeMap = Object.fromEntries(
      myRoutes.map((r) => [r.path, () => h(r.component, undefined)]),
    );

    return h(
      "div",
      {
        when: segment,
        else: () => myFallback(),
        style: { display: "contents" },
      },
      routeMap,
    );
  };
}

// ── RouterLink Factory ────────────────────────────────

/** 创建 Link 组件：点击时通过 navigate 导航，阻止默认跳转 */
function createRouterLink(navigate: (path: string) => void): (props: RouterLinkProps) => HResult {
  return (props: RouterLinkProps) => {
    const { to, children, onClick: userOnClick, ...rest } = props;

    // 解析导航目标值（支持 getter）
    const resolveTo = () => toValue(to);

    return h(
      "a",
      {
        ...rest,
        href: to,
        onClick: (e: Event) => {
          e.preventDefault();
          userOnClick?.(e);
          navigate(resolveTo());
        },
      },
      children,
    );
  };
}

/** 从 URL 查询字符串中提取参数并更新信号 */
function updateRouterParams(signal: (params: Record<string, string>) => void): void {
  const params: Record<string, string> = {};
  const search = getSearch();
  if (search) {
    parseSearch(search).forEach((value, key) => {
      params[key] = value;
    });
  }
  signal(params);
}

// ── createRouter ───────────────────────────────────────

export function createRouter(options: RouterOptions = {}): Router {
  const currentPath = use(getPathname());

  const currentParams = use<Record<string, string>>({});

  function updateParams(): void {
    updateRouterParams(currentParams);
  }

  window.addEventListener("popstate", () => {
    currentPath(getPathname());
    updateParams();
  });

  function navigate(path: string): void {
    const pathname = path.split("?")[0];
    pushHistory(path);
    currentPath(pathname);
    updateParams();
  }

  const defaultFallback = options.fallback ?? (() => h("div", undefined, "404 Not Found"));

  // 初始化参数
  updateParams();

  return {
    RouterView: createRouterView(defaultFallback, currentPath),
    navigate,
    currentPath,
    currentParams,
    Link: createRouterLink(navigate),
  };
}
