// @vitest-environment happy-dom
// kiaao — 大量 DOM 操作极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount, Each } from "../../src/core/index.ts";
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

describe("大量 DOM — 创建", () => {
  test("5000 个 span 同时创建挂载", () => {
    const spans = [];
    for (let i = 0; i < 5000; i++) {
      spans.push(h("span", { key: i }, String(i)));
    }
    const result = h("div", null, ...spans);
    const container = mount(result);
    expect(container.querySelectorAll("span").length).toBe(5000);
  });
});

describe("大量 DOM — 信号更新", () => {
  test("100 个信号绑定更新不崩溃", () => {
    const signals: Array<ReturnType<typeof use<number>>> = [];
    const spans = [];
    for (let i = 0; i < 100; i++) {
      const sig = use(i);
      signals.push(sig);
      spans.push(h("span", null, sig));
    }
    const result = h("div", null, ...spans);
    const container = mount(result);

    for (let i = 0; i < 100; i++) {
      signals[i](i * 10);
    }
    const allSpans = container.querySelectorAll("span");
    expect(allSpans.length).toBe(100);
    expect(allSpans[50].textContent).toBe("500");
  });
});

describe("大量 DOM — Each 渲染", () => {
  function ItemRow({ item }: { item: () => any }) {
    return h("span", null, item().label);
  }

  test("100 项 Each 渲染", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i, label: "n-" + i }));
    const data = use(items);

    const result = h(Each as any, { value: data, keyed: (i: any) => i.id }, ItemRow);
    const container = mount(result);
    expect(container.querySelectorAll("span").length).toBe(100);
  });

  test("100 项 Each 重排", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i, label: "n-" + i }));
    const data = use(items);

    const result = h(Each as any, { value: data, keyed: (i: any) => i.id }, ItemRow);
    const container = mount(result);

    data(Array.from({ length: 100 }, (_, i) => ({ id: 99 - i, label: "n-" + (99 - i) })));
    expect(container.querySelectorAll("span").length).toBe(100);
  });
});
