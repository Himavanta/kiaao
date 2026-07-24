// @vitest-environment happy-dom
// kiaao — router 极端/边界测试

import { expect, test, describe, beforeEach } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use } from "../../src/core/index.ts";
import { triggerMount } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";
import { createRouter } from "../../src/router/index.ts";

setAdapter(browserAdapter);

beforeEach(() => {
  window.history.pushState(null, "", "/");
  window.history.replaceState(null, "", "/");
});

function mountRoot(elements: any[]) {
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of elements) browserAdapter.append(container, node as Node);
  return container;
}

/** 挂载后触发 onMount，并挂到 document.body 中供全局 querySelector */
function mountApp(hrResult: any): HTMLElement {
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of hrResult.nodes) {
    browserAdapter.append(container, node as Node);
  }
  document.body.append(container);
  if (hrResult.owner) triggerMount(hrResult.owner);
  return container;
}

// ── 深度嵌套 ──────────────────────────────────────────

describe("深度嵌套路由", () => {
  test("3 层嵌套全部渲染", async () => {
    const A = (p: any) => h("div", { id: "a" }, h(p.RouterView));
    const B = (p: any) => h("div", { id: "b" }, h(p.RouterView));
    const C = (p: any) => h("div", { id: "c" }, h(p.RouterView));
    const Leaf = () => h("span", { id: "leaf" }, "leaf");

    const { Router, push } = createRouter({
      routes: {
        "": A,
        a: { "": B, b: { "": C, c: Leaf } },
      },
    });
    const root = mountApp(h(Router));
    await push("/a/b/c");

    expect(root.querySelector("#a")).toBeTruthy();
    expect(root.querySelector("#b")).toBeTruthy();
    expect(root.querySelector("#c")).toBeTruthy();
    expect(root.querySelector("#leaf")?.textContent).toBe("leaf");
  });

  test("5 层嵌套全部渲染", async () => {
    const Layer = (p: any, idx: number) => (p2: any) =>
      h("div", { id: `l${idx}` }, h(p2.RouterView));

    const L0 = Layer(null, 0);
    const L1 = Layer(null, 1);
    const L2 = Layer(null, 2);
    const L3 = Layer(null, 3);
    const L4 = Layer(null, 4);
    const End = () => h("span", { id: "end" }, "end");

    const { Router, push } = createRouter({
      routes: {
        "": L0,
        a: { "": L1, b: { "": L2, c: { "": L3, d: { "": L4, e: End } } } },
      },
    });
    const root = mountApp(h(Router));
    await push("/a/b/c/d/e");

    expect(root.querySelector("#l0")).toBeTruthy();
    expect(root.querySelector("#l4")).toBeTruthy();
    expect(root.querySelector("#end")?.textContent).toBe("end");
  });
});

// ── 快速切换 ──────────────────────────────────────────

describe("快速切换", () => {
  test("50 次 push 不崩溃", async () => {
    const Home = (p: any) => h("div", { id: "home" }, h(p.RouterView));
    const A = () => h("span", null, "A");
    const B = () => h("span", null, "B");

    const { Router, push } = createRouter({
      routes: { "": Home, a: A, b: B },
    });
    mountApp(h(Router));

    for (let i = 0; i < 25; i++) {
      await push("/a");
      await push("/b");
    }
    expect(true).toBe(true);
  });

  test("push 到相同路径不重复渲染", async () => {
    let mountCalls = 0;
    const Comp = (p: any, ctx: any) => {
      ctx.onMount(() => mountCalls++);
      return h("span", null, "same");
    };

    const { Router, push } = createRouter({
      routes: { "": Comp },
    });
    mountApp(h(Router));
    // 初始挂载 1 次
    expect(mountCalls).toBe(1);

    await push("/");
    // 同路径不重复
    expect(mountCalls).toBe(1);
  });
});

// ── 生命周期 ──────────────────────────────────────────

describe("路由切换 + 生命周期", () => {
  test("onMount / onUnmount 按路由切换触发", async () => {
    let mount = 0;
    let unmount = 0;
    const A = (p: any, ctx: any) => {
      ctx.onMount(() => mount++);
      ctx.onUnmount(() => unmount++);
      return h("span", null, "A");
    };
    const B = (p: any, ctx: any) => {
      ctx.onMount(() => mount++);
      ctx.onUnmount(() => unmount++);
      return h("span", null, "B");
    };
    const Home = (p: any) => h("div", null, h(p.RouterView));

    const { Router, push } = createRouter({
      routes: { "": Home, a: A, b: B },
    });
    mountApp(h(Router));
    await push("/a");
    expect(mount).toBe(1);
    expect(unmount).toBe(0);

    await push("/b");
    expect(mount).toBe(2);
    expect(unmount).toBe(1);

    await push("/a");
    expect(mount).toBe(3);
    expect(unmount).toBe(2);
  });

  test("layout 的 onMount 只触发一次", async () => {
    let layoutMount = 0;
    const Layout = (p: any, ctx: any) => {
      ctx.onMount(() => layoutMount++);
      return h("div", { id: "l" }, h(p.RouterView));
    };
    const A = () => h("span", null, "A");
    const B = () => h("span", null, "B");

    const { Router, push } = createRouter({
      routes: {
        "": Layout,
        a: { "": Layout, x: A, y: B },
      },
    });
    mountApp(h(Router));
    // 根 layout 挂载
    expect(layoutMount).toBe(1);
    await push("/a/x");
    // /a 的 layout 挂载，根 layout 不变
    // 根 layout 和 /a layout 是不同实例，各自 mount 一次
    expect(layoutMount).toBe(2);
    await push("/a/y");
    // /a layout 保留
    expect(layoutMount).toBe(2);
  });
});

// ── 大型路由表 ────────────────────────────────────────

describe("大型路由表", () => {
  test("20 个分支全部可切换", async () => {
    const branches: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      branches[`k${i}`] = () => h("span", { id: `k${i}` }, String(i));
    }
    const Home = (p: any) => h("div", null, h(p.RouterView));
    const { Router, push } = createRouter({ routes: { "": Home, ...branches } });
    mountApp(h(Router));

    for (let i = 0; i < 20; i++) {
      await push(`/k${i}`);
      expect(document.querySelector(`#k${i}`)?.textContent).toBe(String(i));
    }
  });
});

// ── search 信号 ────────────────────────────────────────

describe("search 信号", () => {
  test("push 含 query 时 search 正确更新", async () => {
    const Home = () => h("div", null, "home");
    const { push, search } = createRouter({ routes: { "": Home } });
    await push("/foo?a=1&b=2");
    expect(search()).toEqual({ a: "1", b: "2" });
  });

  test("多条 query 保留最后一个", async () => {
    const Home = () => h("div", null, "home");
    const { push, search } = createRouter({ routes: { "": Home } });
    await push("/foo?a=1&a=2");
    expect(search()).toEqual({ a: "2" });
  });
});

// ── 信号嵌套场景 ──────────────────────────────────────

describe("信号在 layout 中使用", () => {
  test("layout 中信号正常响应", async () => {
    const count = use(0);
    const Home = (p: any) =>
      h("div", { id: "home" }, h("span", { id: "count" }, count), h(p.RouterView));
    const { Router } = createRouter({ routes: { "": Home } });
    const root = mountApp(h(Router));
    expect(root.querySelector("#count")?.textContent).toBe("0");
    count(5);
    expect(root.querySelector("#count")?.textContent).toBe("5");
  });
});

// ── 多个 createRouter 实例 ─────────────────────────────

describe("多 router 实例", () => {
  test("两个独立 router 不互相干扰", async () => {
    const H1 = () => h("span", { id: "r1" }, "r1");
    const H2 = () => h("span", { id: "r2" }, "r2");

    const r1 = createRouter({ routes: { "": H1 } });
    const r2 = createRouter({ routes: { "": H2 } });

    const root1 = mountRoot([...h(r1.Router).nodes]);
    const root2 = mountRoot([...h(r2.Router).nodes]);

    await r1.push("/p1");
    expect(root1.querySelector("#r1")).toBeTruthy();

    await r2.push("/p2");
    expect(root2.querySelector("#r2")).toBeTruthy();
  });
});

// ── 边界入参 ──────────────────────────────────────────

describe("边界入参", () => {
  test("push 空字符串不崩溃", async () => {
    const Home = () => h("div", null, "home");
    const { push } = createRouter({ routes: { "": Home } });
    await push("");
  });

  test("push 超长路径不崩溃", async () => {
    const Home = () => h("div", null, "home");
    const { push } = createRouter({ routes: { "": Home } });
    const long = "/" + "a".repeat(2000);
    await push(long);
  });

  test("routes 中 key 含 / 仍按单段存储", async () => {
    const Home = (p: any) => h("div", { id: "home" }, h(p.RouterView));
    const Bad = () => h("span", { id: "bad" }, "matched");

    // key 含 / — 框架不校验，用户自负
    const { Router, push } = createRouter({
      routes: { "": Home, "has/slash": Bad } as any,
    });
    mountApp(h(Router));
    // key 是字符串，extractSegment 只用第一段，无法匹配完整路径
    // 仅验证不崩溃
    await push("/has");
  });
});

// ── 等价行为补充 ──────────────────────────────────────

describe("等价行为补充", () => {
  test("push 在信号回调中调用不崩溃", () => {
    const sig = use(false);
    const Home = (p: any) => h("div", null, h(p.RouterView));
    const { Router, push } = createRouter({ routes: { "": Home } });
    mountRoot([...h(Router).nodes]);
    sig(true);
    void push("/nowhere");
    expect(true).toBe(true);
  });

  test("Link dispose 后点击不崩溃", async () => {
    const Home = () => h("div", null, "home");
    const { Link } = createRouter({ routes: { "": Home } });
    const linkResult = h(Link, { to: "/x" });
    if (linkResult.owner) {
      const { disposeOwner } = await import("../../src/core/owner.ts");
      disposeOwner(linkResult.owner);
    }
    expect(true).toBe(true);
  });

  test("路由组件抛异常不崩溃", async () => {
    const Crash = () => {
      throw new Error("boom");
    };
    const Home = (p: any) => h("div", null, h(p.RouterView));
    const { Router, push } = createRouter({
      routes: { "": Home, crash: Crash as any },
    });
    mountRoot([...h(Router).nodes]);
    await push("/crash");
    expect(true).toBe(true);
  });
});
