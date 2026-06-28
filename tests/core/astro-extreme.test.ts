// @vitest-environment happy-dom
// kiaao — Astro 集成极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter, setRenderMode } from "../../src/adapter/index.ts";
import astroClient from "../../src/astro/client.ts";
import astroServer from "../../src/astro/server.ts";
import { h } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

describe("Astro — server 端", () => {
  test("check 函数判断组件", () => {
    expect(astroServer.check(() => h("div"))).toBe(true);
    expect(astroServer.check("string")).toBe(false);
    expect(astroServer.check(null)).toBe(false);
    expect(astroServer.check(42)).toBe(false);
  });

  test("renderToStaticMarkup 输出 HTML", async () => {
    const fn = () => h("div", { id: "astro" }, "hello");
    const { html } = await astroServer.renderToStaticMarkup(fn, {}, {});
    expect(html).toContain("hello");
    expect(html).toContain("<div");
    expect(html).toContain('id="astro"');
  });

  test("renderToStaticMarkup 含 children", async () => {
    const fn = (_props: any) => h("div", null, "root");
    const { html } = await astroServer.renderToStaticMarkup(fn, {}, { default: "child-content" });
    expect(html).toBeTruthy();
  });

  test("renderToStaticMarkup 含 slots", async () => {
    const fn = (_props: any) => h("div", null, "with-slots");
    const { html } = await astroServer.renderToStaticMarkup(fn, {}, { slotA: "a", slotB: "b" });
    expect(html).toBeTruthy();
  });
});

describe("Astro — client 端", () => {
  test("client 默认导出函数", () => {
    expect(typeof astroClient).toBe("function");
  });

  test("client 初始化返回 async 函数", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const init = astroClient(container);
    expect(typeof init).toBe("function");
  });

  test("client:only 渲染组件", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const init = astroClient(container);

    function TestComp() {
      return h("span", null, "astro-client");
    }
    await init(TestComp, {}, {}, { client: "only" });

    // 等待微任务让 createApp.mount 执行
    await new Promise((r) => setTimeout(r, 5));
    expect(container.textContent).toBe("astro-client");
  });

  test("client:only 后 unmount 清理", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const init = astroClient(container);

    function TestComp() {
      return h("span", null, "cleanup");
    }
    await init(TestComp, {}, {}, { client: "only" });
    await new Promise((r) => setTimeout(r, 5));
    expect(container.children.length).toBeGreaterThan(0);

    // 触发 astro:unmount
    container.dispatchEvent(new CustomEvent("astro:unmount"));
    // 需要微任务让 unmount 执行
    await new Promise((r) => setTimeout(r, 5));
    expect(container.children.length).toBe(0);
  });
});

describe("Astro — SSR 模式", () => {
  test("非 DOM 模式下 renderToString 可用", () => {
    setRenderMode("ssr");
    const fn = () => h("div", null, "ssr-mode");
    const result = astroServer.renderToStaticMarkup(fn, {}, {});
    expect(result).toBeTruthy();
    setRenderMode("dom");
  });
});
