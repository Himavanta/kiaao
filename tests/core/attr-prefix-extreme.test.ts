// @vitest-environment happy-dom
// kiaao — 属性前缀 attr:/prop: 极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter, getAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: import("../../src/core/types.ts").HResult): HTMLElement {
  const c = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(c, node as any);
  }
  if (result.owner) triggerMount(result.owner);
  return c;
}

describe("attr: 前缀", () => {
  test("attr: 强制 setAttribute", () => {
    const el = h("div", { "attr:data-custom": "hello" });
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    expect(div.getAttribute("data-custom")).toBe("hello");
  });

  test("attr: 与普通属性不冲突", () => {
    const el = h("div", { id: "normal", "attr:data-x": "attr-val" });
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    expect(div.id).toBe("normal");
    expect(div.getAttribute("data-x")).toBe("attr-val");
  });

  test("attr: 在 SVG 元素上", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const adapter = getAdapter();
    adapter.setProp(svg, "attr:viewBox", "0 0 100 100");
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 100");
  });

  test("attr: 信号绑定更新", () => {
    const val = use("first");
    const el = h("div", { "attr:data-dyn": val });
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    expect(div.getAttribute("data-dyn")).toBe("first");

    val("second");
    expect(div.getAttribute("data-dyn")).toBe("second");
  });
});

describe("prop: 前缀", () => {
  test("prop: 强制 property 赋值", () => {
    const input = h("input", { "prop:value": "hello" });
    const container = mount(input);
    const inp = container.querySelector("input") as HTMLInputElement;
    expect(inp.value).toBe("hello");
  });

  test("prop: 设置复杂对象", () => {
    const div = document.createElement("div");
    const adapter = getAdapter();
    const obj = { nested: { key: "val" } };
    adapter.setProp(div, "prop:__test", obj);
    expect((div as any).__test).toBe(obj);
  });

  test("prop: 与普通属性覆盖规则", () => {
    const adapter = getAdapter();
    const div = document.createElement("div");
    // value 通常走 el.value = ...，prop:value 显式强调走 property
    adapter.setProp(div, "prop:id", "from-prop");
    expect(div.id).toBe("from-prop");
  });
});
