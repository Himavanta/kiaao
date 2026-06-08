// kiaao — Router: hash-free client-side routing with nested layout support.
//
// Usage:
//   import { createRouter } from "kiaao/router";
//
//   const { RouterView, navigate, Link } = createRouter([
//     { path: "", component: Home },
//     { path: "dashboard", component: DashboardLayout },
//   ]);
//
//   function App() {
//     return h("div", null, h(RouterView));
//   }
//
//   function DashboardLayout() {
//     return h("main", null,
//       h(RouterView, { base: "/dashboard", routes: dashboardRoutes })
//     );
//   }

import { define } from "../core/runtime.ts";
import { h } from "../core/h.ts";
import { SKIP_UPDATE, type Getter } from "../core/types.ts";

// ── Types ──────────────────────────────────────────────

export type RouteComponent = (props?: any) => any;

export interface Route {
  /** 单个路径段，不允许包含 /。空字符串表示默认子路由。 */
  path: string;
  component: RouteComponent;
}

export interface Router {
  /**
   * 路由视图组件。
   * - base：路径前缀，以 / 开头不含尾 /。该 RouterView 只响应 base 内的路径变化。
   * - routes：专属路由表，不传则使用 createRouter 的默认路由表。
   * - fallback：无匹配时的后备内容，不传则使用 createRouter 的全局 fallback。
   */
  RouterView: (props?: { base?: string; routes?: Route[]; fallback?: () => any }) => Node;
  /** Programmatic navigation — accepts full absolute path. */
  navigate: (path: string) => void;
  /** Current pathname signal (getter). */
  currentPath: Getter<string>;
  /** Query parameters from current URL. */
  currentParams: () => Record<string, string>;
  /** Declarative navigation link component. */
  Link: (props: { to: string | (() => string); children?: any; [key: string]: any }) => Node;
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

// ── Single-segment Route Matching ──────────────────────

function matchRoute(routes: Route[], segment: string): Route | null {
  return routes.find((r) => r.path === segment) || null;
}

// ── createRouter ───────────────────────────────────────

export function createRouter(routes: Route[], options: { fallback?: RouteComponent } = {}): Router {
  const [currentPath, setPath] = define(window.location.pathname);

  window.addEventListener("popstate", () => {
    setPath(window.location.pathname);
  });

  function navigate(path: string): void {
    // 只保存 pathname 部分，query string 通过 window.location.search 获取
    const pathname = path.split("?")[0];
    history.pushState(null, "", path);
    setPath(pathname);
  }

  const defaultFallback = options.fallback ?? (() => h("div", null, "404 Not Found"));

  function RouterView(props?: { base?: string; routes?: Route[]; fallback?: () => any }): Node {
    const myRoutes = props?.routes ?? routes;
    const myFallback = props?.fallback ?? defaultFallback;
    const myBase = props?.base;

    // 缓存上一次的段，用于 SKIP_UPDATE 判断
    let prevSegment: string | null = null;

    return h(
      "div",
      {
        when: () => (myBase ? currentPath().startsWith(myBase) : true),
        style: { display: "contents" },
      },
      () => {
        const raw = currentPath();
        const segment = extractSegment(raw, myBase);

        // 段为空且不在 base 范围内 → fallback
        if (segment === null) return myFallback();

        // 段未变 → SKIP_UPDATE，when 指令跳过 DOM 操作
        if (segment === prevSegment) return SKIP_UPDATE;

        prevSegment = segment;

        const route = matchRoute(myRoutes, segment);
        if (route) return h(route.component, null);

        return myFallback();
      },
    );
  }

  function Link(props: { to: string | (() => string); children?: any; [key: string]: any }): Node {
    const { to, children, onClick: userOnClick, ...rest } = props;

    // 解析导航目标值（支持 getter）
    const resolveTo = () => (typeof to === "function" ? to() : to);

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
  }

  function currentParams(): Record<string, string> {
    const params: Record<string, string> = {};
    const search = window.location.search;
    if (search) {
      new URLSearchParams(search).forEach((value, key) => {
        params[key] = value;
      });
    }
    return params;
  }

  return { RouterView, navigate, currentPath, currentParams, Link };
}
