// @vitest-environment happy-dom
// kiaao — Show/Case/Each toggle 循环与极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, Show, Case, Each, use, triggerMount, type HResult } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: HResult): HTMLElement {
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(container, node as any);
  }
  if (result.owner) triggerMount(result.owner);
  return container;
}

function query(container: HTMLElement, sel: string): number {
  return container.querySelectorAll(sel).length;
}

// ── Show: 快速切换 ─────────────────────────────────────

describe("Show — toggle cycle", () => {
  test("rapid toggle 100 times does not crash or accumulate", () => {
    const visible = use(false);
    const result = h(Show as any, { value: visible }, () => h("div", { class: "box" }, "Hello"));
    const container = mount(result);

    for (let i = 0; i < 100; i++) {
      visible(true);
      expect(query(container, ".box")).toBe(1);
      visible(false);
      expect(query(container, ".box")).toBe(0);
    }
  });

  test("toggle when value starts as true", () => {
    const visible = use(true);
    const result = h(
      Show as any,
      { value: visible },
      () => h("div", { class: "box" }, "Hello"),
      () => h("div", { class: "fallback" }, "Empty"),
    );
    const container = mount(result);

    expect(query(container, ".box")).toBe(1);
    expect(query(container, ".fallback")).toBe(0);

    visible(false);
    expect(query(container, ".box")).toBe(0);
    expect(query(container, ".fallback")).toBe(1);
  });

  test("toggle with signal that changes multiple times per frame", () => {
    const visible = use(false);
    const result = h(Show as any, { value: visible }, () => h("div", { class: "box" }, "Hello"));
    const container = mount(result);

    // Multiple rapid changes — should only end up in final state
    visible(true);
    visible(false);
    visible(true);
    visible(false);
    expect(query(container, ".box")).toBe(0);

    visible(true);
    expect(query(container, ".box")).toBe(1);
  });

  test("value signal disposed during toggle does not crash", () => {
    const visible = use(false);
    const result = h(Show as any, { value: visible }, () => h("div", { class: "box" }, "Hello"));
    const container = mount(result);

    visible(true);
    expect(query(container, ".box")).toBe(1);

    // Dispose the show owner while signal is active
    if (result.owner) {
      const { disposeOwner } = require("../../src/core/owner.ts");
      disposeOwner(result.owner);
    }

    // Signal change after dispose should not crash
    visible(false);
    expect(query(container, ".box")).toBe(1); // Still in DOM (anchor+content removed on dispose)
  });
});

// ── Case: 快速切换 ─────────────────────────────────────

describe("Case — toggle cycle", () => {
  test("rapid switching across 3 branches 50 times", () => {
    const status = use("a");
    const map = {
      a: () => h("div", { "data-test": "a" }, "A"),
      b: () => h("div", { "data-test": "b" }, "B"),
      c: () => h("div", { "data-test": "c" }, "C"),
    };
    const result = h(Case as any, { value: status }, map);
    const container = mount(result);

    for (let i = 0; i < 50; i++) {
      const branch = ["a", "b", "c"][i % 3];
      status(branch);
      expect(query(container, `[data-test="${branch}"]`)).toBe(1);
    }
  });

  test("switching to same key does not re-render", () => {
    let renderCount = 0;
    const status = use("a");
    const map = {
      a: () => {
        renderCount++;
        return h("div", { "data-test": "a" }, "A");
      },
    };
    const result = h(Case as any, { value: status }, map);
    mount(result);
    renderCount = 0;

    status("a");
    expect(renderCount).toBe(0);
  });
});

// ── Each: 快速更新 ─────────────────────────────────────

describe("Each — rapid updates", () => {
  function Item({ item, index }: any) {
    return h("li", { "data-index": String(index) }, String(item().text));
  }

  function Empty() {
    return h("li", { "data-test": "empty" }, "No items");
  }

  test("rapid replace 50 times does not accumulate", () => {
    const items = use([
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ]);
    const result = h(
      Each as any,
      {
        value: items,
        keyed: (v: any) => v.id,
      },
      Item,
      Empty,
    );
    const container = mount(result);

    for (let i = 0; i < 50; i++) {
      items([
        { id: 1, text: "A" },
        { id: 2, text: "B" },
        { id: 3, text: String(i) },
      ]);
      expect(query(container, "li")).toBe(3);
    }
  });

  test("empty array shows fallback", () => {
    const items = use([{ id: 1, text: "A" }]);
    const result = h(Each as any, { value: items, keyed: (v: any) => v.id }, Item, Empty);
    const container = mount(result);

    expect(query(container, "[data-test='empty']")).toBe(0);
    expect(query(container, "li")).toBe(1);

    items([]);
    expect(query(container, "[data-test='empty']")).toBe(1);
    expect(query(container, "li")).toBe(1); // The fallback li

    items([{ id: 2, text: "B" }]);
    expect(query(container, "[data-test='empty']")).toBe(0);
    expect(query(container, "li")).toBe(1);
  });

  test("1000 items renders without crash", () => {
    const bigList = Array.from({ length: 1000 }, (_, i) => ({ id: i, text: String(i) }));
    const items = use(bigList);
    const result = h(Each as any, { value: items, keyed: (v: any) => v.id }, Item);
    const container = mount(result);

    expect(query(container, "li")).toBe(1000);
  });
});

// ── 极端 children ──────────────────────────────────────

describe("Show — extreme children", () => {
  test("primary component throws is caught", () => {
    const visible = use(true);
    const result = h(Show as any, { value: visible }, () => {
      throw new Error("boom");
    });
    const container = mount(result);
    // Should not crash the framework — produce an error comment
    expect(container.querySelectorAll("[class]").length).toBe(0);
  });

  test("value prop is static true", () => {
    const result = h(Show as any, { value: true }, () => h("div", { class: "box" }, "Hello"));
    const container = mount(result);
    expect(query(container, ".box")).toBe(1);
  });

  test("value prop is static false with fallback", () => {
    const result = h(
      Show as any,
      { value: false },
      () => h("div", { class: "box" }, "Hello"),
      () => h("div", { class: "fb" }, "Fallback"),
    );
    const container = mount(result);
    expect(query(container, ".fb")).toBe(1);
    expect(query(container, ".box")).toBe(0);
  });
});
