// @vitest-environment happy-dom
// kiaao — 嵌套控制流极端测试：Show 套 Show、Each 套 Each、Case + Show 混合

import { describe, expect, test } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { Case, Each, h, Show, triggerMount, use, type HResult } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: HResult): HTMLElement {
  function Root() {
    return result;
  }
  const rootHr = h(Root as any);
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of rootHr.nodes) {
    browserAdapter.append(container, node as any);
  }
  if (rootHr.owner) triggerMount(rootHr.owner);
  return container;
}

function query(container: HTMLElement, sel: string): number {
  return container.querySelectorAll(sel).length;
}

// ── Show 嵌套 Show ────────────────────────────────────

describe("nested — Show inside Show", () => {
  test("outer and inner both true renders inner content", () => {
    const outer = use(true);
    const inner = use(true);
    const result = h(Show as any, { value: outer }, () =>
      h(
        "div",
        { class: "outer" },
        h(Show as any, { value: inner }, () => h("span", { class: "inner" }, "deep")),
      ),
    );
    const container = mount(result);
    expect(query(container, ".outer")).toBe(1);
    expect(query(container, ".inner")).toBe(1);
  });

  test("outer true, inner false shows only outer wrapper", () => {
    const outer = use(true);
    const inner = use(false);
    const result = h(Show as any, { value: outer }, () =>
      h(
        "div",
        { class: "outer" },
        h(
          Show as any,
          { value: inner },
          () => h("span", { class: "inner" }),
          () => h("em", { class: "fallback" }),
        ),
      ),
    );
    const container = mount(result);
    expect(query(container, ".outer")).toBe(1);
    expect(query(container, ".inner")).toBe(0);
    expect(query(container, ".fallback")).toBe(1);
  });

  test("outer false bypasses inner completely", () => {
    const outer = use(false);
    const inner = use(true);
    const result = h(
      Show as any,
      { value: outer },
      () =>
        h(
          "div",
          { class: "outer" },
          h(Show as any, { value: inner }, () => h("span", { class: "inner" })),
        ),
      () => h("div", { class: "fallback" }),
    );
    const container = mount(result);
    expect(query(container, ".outer")).toBe(0);
    expect(query(container, ".inner")).toBe(0);
    expect(query(container, ".fallback")).toBe(1);
  });

  test("signals propagate correctly across two levels", () => {
    const outer = use(false);
    const inner = use(false);
    const result = h(Show as any, { value: outer }, () =>
      h(
        "div",
        { class: "outer" },
        h(Show as any, { value: inner }, () => h("span", { class: "inner" })),
      ),
    );
    const container = mount(result);
    expect(query(container, ".outer")).toBe(0);

    outer(true);
    expect(query(container, ".outer")).toBe(1);
    expect(query(container, ".inner")).toBe(0);

    inner(true);
    expect(query(container, ".inner")).toBe(1);

    inner(false);
    expect(query(container, ".inner")).toBe(0);

    outer(false);
    expect(query(container, ".outer")).toBe(0);
  });
});

// ── Each 嵌套 Each ────────────────────────────────────

describe("nested — Each inside Each", () => {
  function Row({ item, index }: any) {
    return h("li", { class: "row", "data-index": String(index) }, String(item().name));
  }

  function Group({ item }: any) {
    return h(
      "div",
      { class: "group" },
      h("span", { class: "group-name" }, String(item().name)),
      h(Each as any, { value: item().items, keyed: (v: any) => v.id }, Row),
    );
  }

  test("nested Each renders all levels", () => {
    const data = use([
      {
        id: 1,
        name: "A",
        items: [
          { id: 10, name: "A1" },
          { id: 11, name: "A2" },
        ],
      },
      { id: 2, name: "B", items: [{ id: 20, name: "B1" }] },
    ]);
    const result = h(Each as any, { value: data, keyed: (v: any) => v.id }, Group);
    const container = mount(result);

    expect(query(container, ".group")).toBe(2);
    expect(query(container, ".row")).toBe(3);
  });

  test("nested Each updates on outer change", () => {
    const data = use([{ id: 1, name: "A", items: [{ id: 10, name: "A1" }] }]);
    const result = h(Each as any, { value: data, keyed: (v: any) => v.id }, Group);
    const container = mount(result);

    expect(query(container, ".row")).toBe(1);

    data([
      {
        id: 1,
        name: "A",
        items: [
          { id: 10, name: "A1" },
          { id: 11, name: "A2" },
        ],
      },
    ]);
    expect(query(container, ".row")).toBe(2);
  });
});

// ── Case + Show 混合 ──────────────────────────────────

describe("nested — Case + Show mix", () => {
  test("Case switches Show inside each branch", () => {
    const route = use("home");
    const showFlag = use(true);
    const pages = {
      home: () =>
        h(
          "div",
          { class: "page-home" },
          h(Show as any, { value: showFlag }, () => h("span", { class: "detail" }, "details")),
        ),
      about: () => h("div", { class: "page-about" }, h("span", null, "about content")),
    };
    const result = h(Case as any, { value: route }, pages);
    const container = mount(result);

    expect(query(container, ".page-home")).toBe(1);
    expect(query(container, ".detail")).toBe(1);
    expect(query(container, ".page-about")).toBe(0);

    route("about");
    expect(query(container, ".page-home")).toBe(0);
    expect(query(container, ".page-about")).toBe(1);

    route("home");
    showFlag(false);
    expect(query(container, ".page-home")).toBe(1);
    expect(query(container, ".detail")).toBe(0);
  });
});

// ── 大型映射表 ─────────────────────────────────────────

describe("Case — large mapping table", () => {
  test("50 branches rendered from signal changes", () => {
    const sel = use("k0");
    const branches: Record<string, any> = {};
    for (let i = 0; i < 50; i++) {
      const key = `k${i}`;
      const val = i;
      branches[key] = () => h("div", { "data-key": key }, String(val));
    }
    const result = h(Case as any, { value: sel }, branches);
    const container = mount(result);

    for (let i = 0; i < 50; i++) {
      const key = `k${i}`;
      sel(key);
      expect(query(container, `[data-key="${key}"]`)).toBe(1);
    }
  });
});

// ── 条件 + 列表混合 ──────────────────────────────────

describe("nested — condition + list", () => {
  test("Each items with conditional visibility inside", () => {
    const items = use([
      { id: 1, text: "show", visible: true },
      { id: 2, text: "hide", visible: false },
    ]);
    const Comp = ({ item }: any) => {
      return h(
        "li",
        { class: "entry" },
        h(Show as any, { value: item().visible }, () =>
          h("span", { class: "visible-text" }, String(item().text)),
        ),
      );
    };
    const result = h(Each as any, { value: items, keyed: (v: any) => v.id }, Comp);
    const container = mount(result);

    expect(query(container, ".entry")).toBe(2);
    expect(query(container, ".visible-text")).toBe(1);
    expect(container.textContent).toContain("show");
    expect(container.textContent).not.toContain("hide");
  });
});
