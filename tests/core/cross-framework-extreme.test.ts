// @vitest-environment happy-dom
// kiaao — 跨框架互操作极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount } from "../../src/core/index.ts";
import { browserAdapter, createApp } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

describe("跨框架 — 原生 Web Component", () => {
  test("custom element connectedCallback 触发", () => {
    customElements.define(
      "x-conn",
      class extends HTMLElement {
        connectedCallback() {
          this.textContent = "connected";
        }
      },
    );

    const result = h("div", null, h("x-conn"));
    const container = document.createElement("div");
    document.body.append(container);
    for (const node of result.nodes) {
      browserAdapter.append(container, node);
    }
    if (result.owner) triggerMount(result.owner);

    expect(container.querySelector("x-conn")?.textContent).toBe("connected");
  });

  test("自定义元素标签可正常创建", () => {
    const el = h("x-custom");
    const container = browserAdapter.el("div") as HTMLElement;
    for (const node of el.nodes) {
      browserAdapter.append(container, node);
    }
    if (el.owner) triggerMount(el.owner);

    const wc = container.querySelector("x-custom");
    expect(wc).toBeTruthy();
  });
});

describe("跨框架 — 原生 DOM 操作", () => {
  test("kiaao 组件渲染原生 DOM 节点", () => {
    const nativeSpan = document.createElement("span");
    nativeSpan.textContent = "native";

    const el = h("div", null, nativeSpan);
    const container = browserAdapter.el("div") as HTMLElement;
    for (const node of el.nodes) {
      browserAdapter.append(container, node);
    }
    if (el.owner) triggerMount(el.owner);

    expect(container.querySelector("span")?.textContent).toBe("native");
  });

  test("createApp 到任意容器", () => {
    function App() {
      return h("p", null, "app-content");
    }

    const container = document.createElement("section");
    container.id = "app-root";
    document.body.append(container);

    const app = createApp(App);
    app.mount(container);

    expect(container.querySelector("p")?.textContent).toBe("app-content");
    app.unmount();
  });
});

describe("跨框架 — 多 createApp 实例", () => {
  test("两个 createApp 实例共存", () => {
    function AppA() {
      return h("span", null, "A");
    }
    function AppB() {
      return h("span", null, "B");
    }

    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    document.body.append(c1, c2);

    const app1 = createApp(AppA);
    const app2 = createApp(AppB);
    app1.mount(c1);
    app2.mount(c2);

    expect(c1.textContent).toBe("A");
    expect(c2.textContent).toBe("B");

    app1.unmount();
    expect(c1.children.length).toBe(0);
    expect(c2.children.length).toBe(1);
  });

  test("实例间信号隔离", () => {
    const sig1 = use("from-1");
    const sig2 = use("from-2");

    function CompA() {
      return h("p", null, sig1);
    }
    function CompB() {
      return h("p", null, sig2);
    }

    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    const app1 = createApp(CompA);
    const app2 = createApp(CompB);
    app1.mount(c1);
    app2.mount(c2);

    expect(c1.textContent).toBe("from-1");
    expect(c2.textContent).toBe("from-2");

    sig1("changed");
    expect(c1.textContent).toBe("changed");
    expect(c2.textContent).toBe("from-2");
  });
});
