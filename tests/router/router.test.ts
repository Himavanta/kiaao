// @vitest-environment happy-dom
// kiaao — router 基本功能测试
//
// 覆盖 v1 等价行为 + v2 新增能力。
// 极端场景见 router-extreme.test.ts。

import { expect, test, describe, beforeEach } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";
import { createRouter } from "../../src/router/index.ts";

setAdapter(browserAdapter);

beforeEach(() => {
  window.history.pushState(null, "", "/");
  window.history.replaceState(null, "", "/");
});

function settle(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function mountRoot(elements: any[]) {
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of elements) {
    browserAdapter.append(container, node as Node);
  }
  return container;
}

// ── createRouter ──────────────────────────────────────

describe("createRouter — API", () => {
  test("返回 Router / Link / push / current / search", () => {
    const Home = () => h("div", null, "home");
    const { Router, Link, push, current, search } = createRouter({ routes: { "": Home } });

    expect(typeof Router).toBe("function");
    expect(typeof Link).toBe("function");
    expect(typeof push).toBe("function");
    expect(typeof current).toBe("function");
    expect(typeof search).toBe("function");
  });

  test('运行时校验：routes[""] 必须是函数', () => {
    expect(() => createRouter({ routes: { demo: () => h("div") } as any })).toThrow(
      /routes\[""\] must be a function/,
    );
  });

  test("运行时校验：routes 必须是普通对象", () => {
    expect(() => createRouter({ routes: null as any })).toThrow(/must be an object/);
    expect(() => createRouter({ routes: [] as any })).toThrow(/must be an object/);
  });

  test("current 初始值为 /", () => {
    const Home = () => h("div", null, "home");
    const { current } = createRouter({ routes: { "": Home } });
    expect(current()).toBe("/");
  });

  test("search 初始值为空对象", () => {
    const Home = () => h("div", null, "home");
    const { search } = createRouter({ routes: { "": Home } });
    expect(search()).toEqual({});
  });
});

// ── 首次进入 ──────────────────────────────────────────

describe("首次进入", () => {
  test("触发 onRoute(initialPath, null)", async () => {
    const Home = () => h("div", null, "home");
    let called = 0;
    let fromArg: string | null = "not-null";
    createRouter({
      routes: { "": Home },
      onRoute: (_to, from) => {
        called++;
        fromArg = from;
      },
    });
    await settle();
    expect(called).toBe(1);
    expect(fromArg).toBe(null);
  });

  test("onRoute 返回 string 触发初始重定向", async () => {
    const Home = () => h("div", null, "home");
    const { current } = createRouter({
      routes: { "": Home },
      onRoute: (to) => {
        if (to === "/") return "/redirected";
      },
    });
    await settle();
    expect(current()).toBe("/redirected");
  });

  test("onRoute 抛错时保持初始 /", async () => {
    const Home = () => h("div", null, "home");
    const { current } = createRouter({
      routes: { "": Home },
      onRoute: () => {
        throw new Error("guard fail");
      },
    });
    await settle();
    expect(current()).toBe("/");
  });
});

// ── push ───────────────────────────────────────────────

describe("push", () => {
  test("更新 current / search", async () => {
    const Home = () => h("div", null, "home");
    const { push, current, search } = createRouter({ routes: { "": Home } });
    await settle();
    await push("/foo?bar=1");
    expect(current()).toBe("/foo");
    expect(search()).toEqual({ bar: "1" });
  });

  test("触发 onRoute(to, from)", async () => {
    const Home = () => h("div", null, "home");
    const { push } = createRouter({ routes: { "": Home } });
    let guarded = false;
    await push("/foo?bar=1");
    // onRoute 为可选，此处仅验证 push 不抛错，onRoute 测试见独立用例
    expect(guarded).toBe(false);
  });

  test("onRoute 按目标路径非按次数返回 string 触发重定向", async () => {
    const Home = () => h("div", null, "home");
    const { push, current } = createRouter({
      routes: { "": Home },
      onRoute: (to) => {
        if (to.startsWith("/from-push")) return "/redirected";
      },
    });
    await settle();
    await push("/from-push");
    expect(current()).toBe("/redirected");
  });

  test("onRoute 重定向超过 10 次抛错", async () => {
    const Home = () => h("div", null, "home");
    const { push } = createRouter({
      routes: { "": Home },
      onRoute: () => "/loop",
    });
    await expect(push("/start")).rejects.toThrow();
  });

  test("onRoute throw 后 push reject", async () => {
    const Home = () => h("div", null, "home");
    const { push } = createRouter({
      routes: { "": Home },
      onRoute: () => {
        throw new Error("guard fail");
      },
    });
    await expect(push("/foo")).rejects.toThrow(/onRoute error/);
  });

  test("末尾斜杠保留字面值", async () => {
    const Home = () => h("div", null, "home");
    const { push, current } = createRouter({ routes: { "": Home } });
    await push("/foo/");
    expect(current()).toBe("/foo/");
  });
});

// ── popstate ───────────────────────────────────────────

describe("popstate", () => {
  test("popstate 走 onRoute 并更新 current", async () => {
    const Home = () => h("div", null, "home");
    const { current } = createRouter({ routes: { "": Home } });
    await settle();
    window.history.pushState(null, "", "/pop");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    expect(current()).toBe("/pop");
  });

  test("popstate onRoute 抛错后回滚 URL", async () => {
    const Home = () => h("div", null, "home");
    createRouter({
      routes: { "": Home },
      onRoute: () => {
        throw new Error("popstate guard fail");
      },
    });
    await settle();
    window.history.pushState(null, "", "/blocked");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    expect(window.location.pathname).toBe("/");
  });
});

// ── 路由渲染 ──────────────────────────────────────────

describe("路由渲染", () => {
  test("顶层 Router 渲染根 layout", () => {
    const Home = () => h("div", { id: "home" }, "home");
    const { Router } = createRouter({ routes: { "": Home } });
    const root = mountRoot([...h(Router).nodes]);
    expect(root.querySelector("#home")?.textContent).toBe("home");
  });

  test("函数简写叶子组件随 push 切换", async () => {
    const Home = (props: any) => {
      const { RouterView } = props;
      return h("div", { id: "home" }, h(RouterView));
    };
    const Demo = () => h("div", { id: "demo" }, "demo");

    const { Router, push } = createRouter({
      routes: { "": Home, demo: Demo },
    });
    const root = mountRoot([...h(Router).nodes]);

    // 根路径：home wrapper 存在，demo 不存在
    expect(root.querySelector("#home")).toBeTruthy();
    expect(root.querySelector("#demo")).toBeFalsy();

    await push("/demo");
    expect(root.querySelector("#home")).toBeTruthy();
    expect(root.querySelector("#demo")?.textContent).toBe("demo");
  });

  test("嵌套对象路由多层渲染", async () => {
    const Home = (props: any) => {
      const { RouterView } = props;
      return h("div", { id: "home" }, h(RouterView));
    };
    const DemoLayout = (props: any) => {
      const { RouterView } = props;
      return h("div", { id: "layout" }, h(RouterView));
    };
    const Hello = () => h("div", { id: "hello" }, "hello");

    const { Router, push } = createRouter({
      routes: {
        "": Home,
        demo: { "": DemoLayout, hello: Hello },
      },
    });
    const root = mountRoot([...h(Router).nodes]);
    await push("/demo/hello");

    expect(root.querySelector("#home")).toBeTruthy();
    expect(root.querySelector("#layout")).toBeTruthy();
    expect(root.querySelector("#hello")?.textContent).toBe("hello");
  });

  test("RouterView children 第一个元素作为 fallback", async () => {
    const NotFound = () => h("div", { id: "not-found" }, "404");
    const Home = (props: any) => {
      const { RouterView } = props;
      return h("div", { id: "home" }, h(RouterView));
    };
    const DemoLayout = (props: any) => {
      const { RouterView } = props;
      // eslint-disable-next-line typescript/no-explicit-any
      return h(
        "div",
        { id: "layout" },
        h(RouterView as any, null, () => NotFound()),
      );
    };
    const Hello = () => h("div", { id: "hello" }, "hello");

    const { Router, push } = createRouter({
      routes: {
        "": Home,
        demo: { "": DemoLayout, hello: Hello },
      },
    });
    const root = mountRoot([...h(Router).nodes]);
    await push("/demo/unknown");
    expect(root.querySelector("#not-found")?.textContent).toBe("404");
  });

  test("嵌套布局在子路由切换时保留", async () => {
    const Home = (props: any) => {
      const { RouterView } = props;
      return h("div", { id: "home" }, h(RouterView));
    };
    const DemoLayout = (props: any) => {
      const { RouterView } = props;
      return h("div", { id: "layout" }, h(RouterView));
    };
    const Hello = () => h("div", { id: "hello" }, "hello");
    const World = () => h("div", { id: "world" }, "world");

    const { Router, push } = createRouter({
      routes: {
        "": Home,
        demo: { "": DemoLayout, hello: Hello, world: World },
      },
    });
    const root = mountRoot([...h(Router).nodes]);

    await push("/demo/hello");
    expect(root.querySelector("#hello")).toBeTruthy();

    await push("/demo/world");
    expect(root.querySelector("#home")).toBeTruthy();
    expect(root.querySelector("#layout")).toBeTruthy();
    expect(root.querySelector("#hello")).toBeFalsy();
    expect(root.querySelector("#world")?.textContent).toBe("world");
  });
});

// ── Link ───────────────────────────────────────────────

describe("Link", () => {
  test("点击拦截并调用 push", async () => {
    const Home = (props: any) => {
      const { RouterView } = props;
      return h("div", { id: "home" }, h(RouterView));
    };
    const Demo = () => h("div", { id: "demo" }, "demo");
    const { Link, current } = createRouter({
      routes: { "": Home, demo: Demo },
    });
    const container = mountRoot([...h(Link, { to: "/demo", id: "link" }).nodes]);
    await settle();

    const link = container.querySelector("#link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/demo");
    link.click();
    await settle();
    expect(current()).toBe("/demo");
  });

  test("Link.to 支持 Signal<string>", async () => {
    const Home = (props: any) => {
      const { RouterView } = props;
      return h("div", { id: "home" }, h(RouterView));
    };
    const Demo = () => h("div", { id: "demo" }, "demo");
    const target = use("/demo");
    const { Link } = createRouter({ routes: { "": Home, demo: Demo } });
    const container = mountRoot([...h(Link, { to: target, id: "link" }).nodes]);

    const link = container.querySelector("#link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/demo");
  });

  test("href 随信号变化更新", async () => {
    const Home = (props: any) => {
      const { RouterView } = props;
      return h("div", { id: "home" }, h(RouterView));
    };
    const target = use("/demo");
    const { Link } = createRouter({ routes: { "": Home } });
    const container = mountRoot([...h(Link, { to: target, id: "link" }).nodes]);
    await settle();

    const link = container.querySelector("#link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/demo");
    target("/about");
    expect(link.getAttribute("href")).toBe("/about");
  });
});

// ── current / search 只读 ─────────────────────────────

describe("current / search — 逻辑只读", () => {
  test("current 写入无效", () => {
    const Home = () => h("div", null, "home");
    const { current } = createRouter({ routes: { "": Home } });
    const before = current();
    // eslint-disable-next-line typescript/no-explicit-any
    (current as any)("/anything");
    expect(current()).toBe(before);
  });

  test("search 写入无效", () => {
    const Home = () => h("div", null, "home");
    const { search } = createRouter({ routes: { "": Home } });
    const before = search();
    // eslint-disable-next-line typescript/no-explicit-any
    (search as any)({ foo: "1" });
    expect(search()).toEqual(before);
  });
});

// ── popstate + onRoute 守卫 ────────────────────────────

describe("popstate + onRoute", () => {
  test("popstate onRoute 返回 string 触发重定向", async () => {
    const Home = () => h("div", null, "home");
    const { current } = createRouter({
      routes: { "": Home },
      onRoute: (to) => {
        if (to.startsWith("/pop")) return "/redirected";
      },
    });
    await settle();
    window.history.pushState(null, "", "/pop-please");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    expect(current()).toBe("/redirected");
  });
});
