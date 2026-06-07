// kiaao — Router: hash-free client-side routing built on define, h, when.
//
// Usage:
//   import { createRouter } from "kiaao/router";
//
//   const { RouterView, navigate, Link } = createRouter([
//     { path: "/", component: Home },
//     { path: "/users/:id", component: UserProfile },
//   ]);
//
//   function App() {
//     return h("div", null, h(RouterView));
//   }

import { define, derive } from "../runtime.ts";
import { h } from "../dom.ts";
import type { Getter } from "../types.ts";

// ── Types ──────────────────────────────────────────────

export type RouteComponent = (props?: any) => any;

export interface Route {
  path: string;
  component: RouteComponent;
}

export interface Router {
  /** View component — renders the matched route */
  RouterView: () => Node;
  /** Programmatic navigation */
  navigate: (path: string) => void;
  /** Current pathname signal (getter) */
  currentPath: Getter<string>;
  /** Current route params derived from currentPath */
  currentParams: () => Record<string, string>;
  /** Declarative navigation link component */
  Link: (props: { to: string; children?: any; [key: string]: any }) => Node;
}

// ── Path Matching ──────────────────────────────────────

interface MatchResult {
  component: RouteComponent;
  params: Record<string, string>;
}

function matchRoutes(routes: Route[], path: string): MatchResult | null {
  for (const route of routes) {
    const patternParts = route.path.split("/");
    const pathParts = path.split("/");

    if (patternParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let matched = true;

    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      if (pp.startsWith(":")) {
        params[pp.slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (pp !== pathParts[i]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return { component: route.component, params };
    }
  }

  return null;
}

// ── createRouter ───────────────────────────────────────

export function createRouter(routes: Route[], options: { fallback?: RouteComponent } = {}): Router {
  const [currentPath, setPath] = define(window.location.pathname);

  // Listen for browser back/forward
  window.addEventListener("popstate", () => {
    setPath(window.location.pathname);
  });

  function navigate(path: string): void {
    history.pushState(null, "", path);
    setPath(path);
  }

  const fallback = options.fallback ?? (() => h("div", null, "404 Not Found"));

  function RouterView(): Node {
    // 单个 when 元素，惰性函数内部分支判断
    // 惰性函数内部调用 currentPath() 注册为 when effect 的依赖，
    // 路由变化时 effect 重新执行，自动切换渲染内容
    return h(
      "div",
      {
        when: () => true,
        style: { display: "contents" },
      },
      () => {
        const match = matchRoutes(routes, currentPath());
        if (match) {
          return h(match.component, match.params);
        }
        return fallback();
      },
    );
  }

  function Link(props: { to: string; children?: any; [key: string]: any }): Node {
    const { to, children, onClick: userOnClick, ...rest } = props;

    return h(
      "a",
      {
        ...rest,
        href: to,
        onClick: (e: Event) => {
          e.preventDefault();
          userOnClick?.(e);
          navigate(to);
        },
      },
      children,
    );
  }

  const currentParams = derive(() => {
    const match = matchRoutes(routes, currentPath());
    return match ? match.params : {};
  });

  return { RouterView, navigate, currentPath, currentParams, Link };
}
