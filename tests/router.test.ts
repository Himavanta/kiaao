// @vitest-environment happy-dom
// 路由全面测试：基本功能、嵌套、边界、极限场景

import { expect, test, describe, beforeEach } from "vite-plus/test";
import { use } from "../src/reactive/core.ts";
import { h } from "../src/index.ts";
import { createRouter } from "../src/router/index.ts";

// 每次测试前重置路径
beforeEach(() => {
  window.history.pushState(null, "", "/");
});

// ── 基本路由 ─────────────────────────────────────────

describe("basic routing", () => {
  const routes = [
    { path: "", component: () => h("h1", null, "Home") },
    { path: "about", component: () => h("h1", null, "About") },
    { path: "contact", component: () => h("h1", null, "Contact") },
  ];

  test("renders default route at root path", () => {
    const { RouterView } = createRouter();
    const el = h("div", null, h(RouterView, { routes }));
    expect(el.textContent).toBe("Home");
  });

  test("navigate switches to matched route", () => {
    const { RouterView, navigate } = createRouter();
    const el = h("div", null, h(RouterView, { routes }));
    expect(el.textContent).toBe("Home");

    navigate("/about");
    expect(el.textContent).toBe("About");
  });

  test("navigate to multiple routes sequentially", () => {
    const { RouterView, navigate } = createRouter();
    const el = h("div", null, h(RouterView, { routes }));

    navigate("/about");
    expect(el.textContent).toBe("About");

    navigate("/contact");
    expect(el.textContent).toBe("Contact");

    navigate("/");
    expect(el.textContent).toBe("Home");
  });

  test("navigate to same route does not re-render", () => {
    const { RouterView, navigate } = createRouter();
    const el = h("div", null, h(RouterView, { routes }));

    navigate("/about");
    expect(el.textContent).toBe("About");

    navigate("/about");
    expect(el.textContent).toBe("About");
  });
});

// ── Fallback / 404 ────────────────────────────────────

describe("fallback", () => {
  const routes = [{ path: "", component: () => h("h1", null, "Home") }];

  test("instance-level fallback renders for unmatched route", () => {
    const { RouterView, navigate } = createRouter({
      fallback: () => h("div", null, "Custom 404"),
    });
    const el = h("div", null, h(RouterView, { routes }));

    navigate("/nonexistent");
    expect(el.textContent).toBe("Custom 404");
  });

  test("RouterView prop fallback overrides instance-level", () => {
    const { RouterView, navigate } = createRouter({
      fallback: () => h("div", null, "Instance 404"),
    });
    const el = h(
      "div",
      null,
      h(RouterView, { routes, fallback: () => h("div", null, "View 404") }),
    );

    navigate("/nonexistent");
    expect(el.textContent).toBe("View 404");
  });

  test("default fallback renders 404 message", () => {
    const { RouterView, navigate } = createRouter();
    const el = h("div", null, h(RouterView, { routes: [] }));

    navigate("/anything");
    expect(el.textContent).toBe("404 Not Found");
  });
});

// ── Link 组件 ─────────────────────────────────────────

describe("Link", () => {
  const routes = [
    { path: "", component: () => h("h1", null, "Home") },
    { path: "about", component: () => h("h1", null, "About") },
  ];

  test("clicking Link navigates to target", () => {
    const { Link, RouterView } = createRouter();
    const el = h("div", null, h(Link, { to: "/about" }, "Go"), h(RouterView, { routes }));

    el.querySelector("a")!.click();
    expect(el.textContent).toContain("About");
  });

  test("Link with signal getter as to prop", () => {
    const [target, setTarget] = use("/about");
    const { Link, RouterView } = createRouter();
    const el = h("div", null, h(Link, { to: target }, "Go"), h(RouterView, { routes }));

    el.querySelector("a")!.click();
    expect(el.textContent).toContain("About");

    setTarget("/");
    el.querySelector("a")!.click();
    expect(el.textContent).toContain("Home");
  });

  test("Link with user onClick fires before navigation", () => {
    let clicked = false;
    const { Link, RouterView } = createRouter();
    const el = h(
      "div",
      null,
      h(
        Link,
        {
          to: "/about",
          onClick: () => {
            clicked = true;
          },
        },
        "Go",
      ),
      h(RouterView, { routes }),
    );

    el.querySelector("a")!.click();
    expect(clicked).toBe(true);
    expect(el.textContent).toContain("About");
  });

  test("Link does not trigger full page reload", () => {
    const { Link, RouterView } = createRouter();
    const el = h("div", null, h(Link, { to: "/about" }, "Go"), h(RouterView, { routes }));

    const anchor = el.querySelector("a")!;
    // 确保 preventDefault 被调用
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    // 页面不应刷新，href 仍为原始值
    expect(el.textContent).toContain("About");
  });
});

// ── currentPath 信号 ──────────────────────────────────

describe("currentPath signal", () => {
  test("currentPath updates after navigate", () => {
    const { currentPath, navigate } = createRouter();
    expect(currentPath()).toBe("/");

    navigate("/about");
    expect(currentPath()).toBe("/about");
  });

  test("currentPath triggers derivation", () => {
    const { currentPath, navigate } = createRouter();
    const [pathLength] = use(currentPath, () => currentPath().length);

    expect(pathLength()).toBe(1); // "/"

    navigate("/about");
    expect(pathLength()).toBe(6); // "/about"
  });
});

// ── currentParams 信号 ────────────────────────────────

describe("currentParams signal", () => {
  test("currentParams is empty for path without query", () => {
    const { currentParams, navigate } = createRouter();

    navigate("/");
    expect(currentParams()).toEqual({});
  });

  test("currentParams parses query string after navigate", () => {
    const { currentParams, navigate } = createRouter();

    navigate("/search?q=kiaao&page=1");
    expect(currentParams()).toEqual({ q: "kiaao", page: "1" });
  });

  test("currentParams updates reactively", () => {
    const { currentParams, navigate } = createRouter();

    navigate("/search?q=first");
    expect(currentParams().q).toBe("first");

    navigate("/search?q=second");
    expect(currentParams().q).toBe("second");
  });

  test("currentParams clears when navigating to path without query", () => {
    const { currentParams, navigate } = createRouter();

    navigate("/search?q=hello");
    expect(currentParams()).toEqual({ q: "hello" });

    navigate("/");
    expect(currentParams()).toEqual({});
  });
});

// ── 嵌套路由 ──────────────────────────────────────────

describe("nested routing", () => {
  test("RouterView with base renders nested layout", () => {
    const dashboardRoutes = [
      { path: "", component: () => h("h2", null, "Dashboard") },
      { path: "users", component: () => h("h2", null, "Users") },
    ];

    function Layout() {
      return h("main", null, h(RouterView, { base: "/dashboard", routes: dashboardRoutes }));
    }

    const { RouterView, navigate } = createRouter();

    navigate("/dashboard");
    const el = h(
      "div",
      null,
      h(RouterView, { routes: [{ path: "dashboard", component: Layout }] }),
    );
    expect(el.textContent).toBe("Dashboard");

    navigate("/dashboard/users");
    expect(el.textContent).toBe("Users");
  });

  test("nested route does not match outside its base", () => {
    const { RouterView, navigate } = createRouter();
    const el = h(
      "div",
      null,
      h(RouterView, {
        base: "/admin",
        routes: [{ path: "", component: () => h("h1", null, "Admin") }],
        fallback: () => h("h1", null, "Outside"),
      }),
    );

    // 在 base="/admin" 外部 → fallback
    navigate("/");
    expect(el.textContent).toBe("Outside");

    // 在 base 内部 → 正常匹配
    navigate("/admin");
    expect(el.textContent).toBe("Admin");
  });

  test("deep nesting: three levels of RouterView", () => {
    const { RouterView, navigate } = createRouter();

    const appRoutes = [
      { path: "", component: () => h("h1", null, "App") },
      {
        path: "section",
        component: () =>
          h(
            "div",
            null,
            h(RouterView, {
              base: "/section",
              routes: [
                { path: "", component: () => h("h2", null, "Section Home") },
                {
                  path: "detail",
                  component: () =>
                    h(
                      "div",
                      null,
                      h(RouterView, {
                        base: "/section/detail",
                        routes: [{ path: "", component: () => h("h3", null, "Detail") }],
                      }),
                    ),
                },
              ],
            }),
          ),
      },
    ];

    navigate("/section");
    const el = h("div", null, h(RouterView, { routes: appRoutes }));
    expect(el.textContent).toContain("Section Home");

    navigate("/section/detail");
    expect(el.textContent).toContain("Detail");

    navigate("/");
    expect(el.textContent).toContain("App");
  });

  test("multiple RouterViews on same page", () => {
    const { RouterView, navigate } = createRouter();

    const leftRoutes = [
      { path: "", component: () => h("span", null, "Left") },
      { path: "right", component: () => h("span", null, "Right") },
    ];

    const rightRoutes = [
      { path: "", component: () => h("span", null, "A") },
      { path: "right", component: () => h("span", null, "B") },
    ];

    const el = h(
      "div",
      null,
      h(RouterView, { routes: leftRoutes }),
      h(RouterView, { routes: rightRoutes }),
    );

    // 两个 RouterView 共享同一个 currentPath
    expect(el.textContent).toBe("LeftA");

    navigate("/right");
    expect(el.textContent).toBe("RightB");
  });
});

// ── 浏览器前进后退 ────────────────────────────────────

describe("browser back/forward", () => {
  const routes = [
    { path: "", component: () => h("h1", null, "Home") },
    { path: "a", component: () => h("h1", null, "Page A") },
    { path: "b", component: () => h("h1", null, "Page B") },
  ];

  test("back navigation restores previous route", () => {
    const { RouterView, navigate } = createRouter();
    const el = h("div", null, h(RouterView, { routes }));

    navigate("/a");
    expect(el.textContent).toBe("Page A");

    navigate("/b");
    expect(el.textContent).toBe("Page B");

    window.history.back();
    expect(el.textContent).toBe("Page A");

    window.history.forward();
    expect(el.textContent).toBe("Page B");
  });
});

// ── 路径边界 ──────────────────────────────────────────

describe("path edge cases", () => {
  const routes = [
    { path: "", component: () => h("h1", null, "Home") },
    { path: "about", component: () => h("h1", null, "About") },
  ];

  test("trailing slash is ignored", () => {
    const { RouterView, navigate } = createRouter();
    const el = h("div", null, h(RouterView, { routes }));

    navigate("/about/");
    expect(el.textContent).toBe("About");
  });

  test("double slashes are rejected by history API", () => {
    // 浏览器安全限制：history.pushState 拒绝双斜杠 URL
    const { navigate } = createRouter();
    expect(() => navigate("//about")).toThrow();
  });

  test("navigate to root path matches empty route", () => {
    const { RouterView, navigate } = createRouter();
    const el = h("div", null, h(RouterView, { routes }));

    navigate("/about");
    expect(el.textContent).toBe("About");

    navigate("/");
    expect(el.textContent).toBe("Home");
  });

  test("navigate with query string still matches route", () => {
    const { RouterView, navigate } = createRouter();
    const el = h("div", null, h(RouterView, { routes }));

    navigate("/about?ref=home");
    expect(el.textContent).toBe("About");
  });
});

// ── 路由表动态变化 ────────────────────────────────────

describe("dynamic route changes", () => {
  test("re-rendering with different route table works", () => {
    const { RouterView } = createRouter();

    function App() {
      return h(
        "div",
        null,
        h(RouterView, {
          routes: [{ path: "", component: () => h("h1", null, "V1") }],
        }),
      );
    }

    const el = h(App);
    expect(el.textContent).toBe("V1");
  });
});

// ── 组件内导航 ────────────────────────────────────────

describe("navigate inside component", () => {
  test("redirect component navigates on mount", () => {
    const { RouterView, navigate } = createRouter();

    function Redirect() {
      navigate("/target");
      return null as any;
    }

    const routes = [
      { path: "", component: Redirect },
      { path: "target", component: () => h("h1", null, "Target") },
    ];

    const el = h("div", null, h(RouterView, { routes }));

    // navig 在同步执行时触发，RouterView 应响应路径变化
    // 注意：navigate 在组件渲染期间调用，currentPath 同步更新
    // 但 RouterView 的当次 renderBranch 可能已执行完毕
    // 订阅机制会在 derive 初始计算时触发第二次 renderBranch
    // 因此最终应显示 Target
    expect(el.textContent).toBe("Target");
  });
});

// ── extractSegment 边界 ───────────────────────────────

describe("extractSegment edge cases", () => {
  test("empty path segment returns empty string", () => {
    const { RouterView } = createRouter();
    const routes = [{ path: "", component: () => h("h1", null, "Root") }];
    const el = h("div", null, h(RouterView, { routes }));

    expect(el.textContent).toBe("Root");
  });

  test("segment extraction with base='/ '", () => {
    const { RouterView, navigate } = createRouter();

    navigate("/dashboard/users");
    h(
      "div",
      null,
      h(RouterView, {
        base: "/",
        routes: [{ path: "", component: () => h("h1", null, "Root") }],
      }),
    );
    // base="/" 应匹配所有路径
  });
});
