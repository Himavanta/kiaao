// @vitest-environment happy-dom
// Router 极端测试

import { expect, test, describe, beforeEach } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount, disposeOwner } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";
import { createRouter } from "../../src/router/index.ts";

setAdapter(browserAdapter);

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function mount(result: import("../../src/core/types.ts").HResult): HTMLElement {
  function Root() {
    return result;
  }
  const rootHr = h(Root as any);
  const c = browserAdapter.el("div") as HTMLElement;
  for (const node of rootHr.nodes) {
    browserAdapter.append(c, node as any);
  }
  if (rootHr.owner) triggerMount(rootHr.owner);
  return c;
}

describe("Router — 嵌套路由", () => {
  test("嵌套 RouterView 带 base", () => {
    const { RouterView } = createRouter();

    const el = h(
      "div",
      null,
      h(RouterView as any, {
        routes: [
          { path: "", component: () => h("span", null, "root") },
          {
            path: "dashboard",
            component: () =>
              h(RouterView as any, {
                base: "/dashboard",
                routes: [
                  { path: "", component: () => h("span", null, "dash-home") },
                  { path: "users", component: () => h("span", null, "users") },
                ],
              }),
          },
        ],
      }),
    );
    const container = mount(el);
    expect(container.textContent).toBe("root");

    window.history.pushState(null, "", "/dashboard");
    // RouterView 不自动监听 popstate，需手动触发
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(container.textContent).toBe("dash-home");
  });

  test("路由切换触发 onMount/onUnmount", () => {
    let mountCalls = 0;
    let unmountCalls = 0;

    function PageA(_: any, ctx: any) {
      ctx.onMount(() => mountCalls++);
      ctx.onUnmount(() => unmountCalls++);
      return h("span", null, "A");
    }
    function PageB(_: any, ctx: any) {
      ctx.onMount(() => mountCalls++);
      ctx.onUnmount(() => unmountCalls++);
      return h("span", null, "B");
    }

    const { RouterView, navigate } = createRouter();
    mount(
      h(
        "div",
        null,
        h(RouterView as any, {
          routes: [
            { path: "", component: PageA },
            { path: "b", component: PageB },
          ],
        }),
      ),
    );

    expect(mountCalls).toBe(1);
    expect(unmountCalls).toBe(0);

    navigate("/b");
    expect(mountCalls).toBe(2);
    expect(unmountCalls).toBe(1);

    navigate("/");
    expect(mountCalls).toBe(3);
    expect(unmountCalls).toBe(2);
  });
});

describe("Router — 极端切换", () => {
  test("50 次路由快速切换不崩溃", () => {
    function PageA() {
      return h("span", null, "A");
    }
    function PageB() {
      return h("span", null, "B");
    }
    function PageC() {
      return h("span", null, "C");
    }

    const { RouterView, navigate } = createRouter();
    mount(
      h(
        "div",
        null,
        h(RouterView as any, {
          routes: [
            { path: "", component: PageA },
            { path: "b", component: PageB },
            { path: "c", component: PageC },
          ],
        }),
      ),
    );

    for (let i = 0; i < 50; i++) {
      navigate(i % 2 === 0 ? "/b" : "/c");
    }
    expect(true).toBe(true);
  });

  test("navigate 到相同路径不重复触发", () => {
    let mountCalls = 0;
    function Page(_: any, ctx: any) {
      ctx.onMount(() => mountCalls++);
      return h("span", null, "same");
    }

    const { RouterView, navigate } = createRouter();
    mount(
      h(
        "div",
        null,
        h(RouterView as any, {
          routes: [{ path: "", component: Page }],
        }),
      ),
    );

    expect(mountCalls).toBe(1);
    navigate("/");
    // 应跳过，路径未变
    expect(mountCalls).toBe(1);
  });

  test("navigate 在信号回调中调用不崩溃", () => {
    const { RouterView, navigate } = createRouter();
    const sig = use(false);

    // 信号变化时导航
    const LazyNav = () => {
      const v = sig();
      if (v) navigate("/other");
      return h("span", null, v ? "navigated" : "idle");
    };
    mount(
      h(
        "div",
        null,
        h(RouterView as any, {
          routes: [{ path: "", component: LazyNav }],
        }),
      ),
    );

    sig(true);
    expect(true).toBe(true);
  });
});

describe("Router — currentPath / currentParams", () => {
  test("navigate 更新 currentPath", () => {
    const { navigate, currentPath } = createRouter();
    use(currentPath());

    navigate("/test-page");
    expect(currentPath()).toBe("/test-page");
  });

  test("popstate 更新 currentPath", () => {
    const { currentPath } = createRouter();

    window.history.pushState(null, "", "/pop");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(currentPath()).toBe("/pop");
  });
});

describe("Router — Link 组件", () => {
  test("Link dispose 后点击不崩溃", () => {
    const { Link, RouterView } = createRouter();
    function Home() {
      return h("span", null, "home");
    }

    function TestApp() {
      return h(
        "div",
        null,
        h(Link as any, { to: "/about" }, "link"),
        h(RouterView as any, { routes: [{ path: "", component: Home }] }),
      );
    }
    const el = h(TestApp);
    const container = mount(el);

    const a = container.querySelector("a")!;
    if (el.owner) disposeOwner(el.owner);
    // dispose 后点击不应触发 navigate
    a.click();
    expect(true).toBe(true);
  });

  test("Link href 正确", () => {
    const { RouterView, Link } = createRouter();
    const el = h(
      "div",
      null,
      h(Link as any, { to: "/test" }, "link"),
      h(RouterView as any, { routes: [{ path: "", component: () => h("span") }] }),
    );
    const container = mount(el);

    const a = container.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("/test");
  });
});

describe("Router — edge cases", () => {
  test("空路由表不崩溃", () => {
    const { RouterView } = createRouter();
    const el = h("div", null, h(RouterView as any, { routes: [] }));
    const container = mount(el);
    expect(container.textContent).toBe("404 Not Found");
  });

  test("多个 RouterView 实例独立", () => {
    const r1 = createRouter({ fallback: () => h("span", null, "R1 fallback") });
    const r2 = createRouter({ fallback: () => h("span", null, "R2 fallback") });

    const c1 = mount(h("div", null, h(r1.RouterView as any, { routes: [] })));
    const c2 = mount(h("div", null, h(r2.RouterView as any, { routes: [] })));

    expect(c1.textContent).toBe("R1 fallback");
    expect(c2.textContent).toBe("R2 fallback");
  });

  test("路由组件抛异常不崩溃", () => {
    const orig = console.error;
    console.error = () => {};

    const { RouterView, navigate } = createRouter();
    function Crash() {
      throw new Error("router crash");
    }
    function Safe() {
      return h("span", null, "safe");
    }

    mount(
      h(
        "div",
        null,
        h(RouterView as any, {
          routes: [
            { path: "", component: Safe },
            { path: "crash", component: Crash },
          ],
        }),
      ),
    );

    navigate("/crash");
    expect(true).toBe(true);
    console.error = orig;
  });
});
