// @vitest-environment happy-dom
// kiaao — Fragment 与 setProps 极端测试

import { describe, expect, test } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { Fragment, h, setProps } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

// ── Fragment 极端值 ───────────────────────────────────

describe("Fragment — extreme", () => {
  test("empty Fragment returns nothing", () => {
    const result = h(Fragment);
    expect(result.nodes).toEqual([]);
  });

  test("Fragment with single child unwraps", () => {
    const result = h(Fragment, null, h("span", { class: "only" }));
    expect(result.nodes.length).toBe(1);
    expect((result.nodes[0] as HTMLElement).className).toBe("only");
  });

  test("Fragment with 100 children returns all", () => {
    const children = Array.from({ length: 100 }, (_, i) => h("span", { "data-i": String(i) }));
    const result = h(Fragment, null, ...children);
    expect(result.nodes.length).toBe(100);
  });

  test("Fragment with mixed null/undefined/valid", () => {
    const result = h(
      Fragment,
      null,
      null,
      h("span", { class: "a" }),
      undefined,
      h("span", { class: "b" }),
    );
    expect(result.nodes.length).toBe(2);
  });

  test("Fragment containing Fragment flattens", () => {
    const inner = h(Fragment, null, h("span", { class: "inner1" }), h("span", { class: "inner2" }));
    const outer = h(Fragment, null, h("span", { class: "outer" }), inner);
    expect(outer.nodes.length).toBe(3);
  });
});

// ── setProps 极端值 ───────────────────────────────────

describe("setProps — extreme", () => {
  function setProp(el: HTMLElement, key: string, value: any): void {
    setProps(el, { [key]: value });
  }

  test("null value does not crash", () => {
    const el = browserAdapter.el("div") as HTMLElement;
    expect(() => setProp(el, "class", null)).not.toThrow();
  });

  test("undefined value does not crash", () => {
    const el = browserAdapter.el("div") as HTMLElement;
    expect(() => setProp(el, "id", undefined)).not.toThrow();
  });

  test("symbol value does not crash", () => {
    const el = browserAdapter.el("div") as HTMLElement;
    expect(() => setProp(el, "data-x", Symbol("test") as any)).not.toThrow();
  });

  test("function value (event) binds correctly", () => {
    const el = browserAdapter.el("button") as HTMLElement;
    let called = false;
    setProp(el, "onClick", () => {
      called = true;
    });
    el.click();
    expect(called).toBe(true);
  });

  test("style object applies correctly", () => {
    const el = browserAdapter.el("div") as HTMLElement;
    setProp(el, "style", { color: "red", fontSize: "14px" });
    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("14px");
  });

  test("style string applies correctly", () => {
    const el = browserAdapter.el("div") as HTMLElement;
    setProp(el, "style", "color: blue; font-size: 16px");
    expect(el.style.color).toBe("blue");
    expect(el.style.fontSize).toBe("16px");
  });

  test("class name via setAttribute", () => {
    const el = browserAdapter.el("div") as HTMLElement;
    setProp(el, "class", "foo bar");
    expect(el.className).toBe("foo bar");
    expect(el.getAttribute("class")).toBe("foo bar");
  });

  test("aria-* attribute", () => {
    const el = browserAdapter.el("div") as HTMLElement;
    setProp(el, "aria-label", "close");
    expect(el.getAttribute("aria-label")).toBe("close");
  });

  test("data-* attribute", () => {
    const el = browserAdapter.el("div") as HTMLElement;
    setProp(el, "data-id", "42");
    expect(el.getAttribute("data-id")).toBe("42");
  });

  test("attr: prefix forces setAttribute", () => {
    const el = browserAdapter.el("div") as HTMLElement;
    setProp(el, "attr:data-test", "value");
    expect(el.getAttribute("data-test")).toBe("value");
  });

  test("prop: prefix forces property", () => {
    const el = browserAdapter.el("input") as HTMLInputElement;
    setProp(el, "prop:value", "override");
    expect(el.value).toBe("override");
  });

  test("boolean true on FORCE_ATTRIBUTE sets bare attribute", () => {
    const el = browserAdapter.el("button") as HTMLElement;
    setProp(el, "disabled", true);
    expect(el.getAttribute("disabled")).toBe("");
  });

  test("boolean false on FORCE_ATTRIBUTE removes attribute", () => {
    const el = browserAdapter.el("button") as HTMLElement;
    el.setAttribute("disabled", "");
    setProp(el, "disabled", false);
    expect(el.hasAttribute("disabled")).toBe(false);
  });
});

// ── 样式增量合并 ──────────────────────────────────────

describe("style — incremental merge", () => {
  test("multiple style props merge correctly", () => {
    const el = browserAdapter.el("div") as HTMLElement;

    setProps(el, { style: { color: "red" } });
    setProps(el, { style: { fontSize: "20px" } });

    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("20px");
  });

  test("style object overrides previous values", () => {
    const el = browserAdapter.el("div") as HTMLElement;

    setProps(el, { style: { color: "red", fontSize: "12px" } });
    setProps(el, { style: { color: "blue" } });

    expect(el.style.color).toBe("blue");
    expect(el.style.fontSize).toBe("12px"); // Not overridden
  });
});

// ── 多属性批量设置 ────────────────────────────────────

describe("setProps — batch", () => {
  test("multiple props set at once", () => {
    const el = browserAdapter.el("div") as HTMLElement;

    setProps(el, { class: "box", id: "main", title: "hello" });
    expect(el.className).toBe("box");
    expect(el.id).toBe("main");
    expect(el.getAttribute("title")).toBe("hello");
  });

  test("children key is skipped", () => {
    const el = browserAdapter.el("div") as HTMLElement;

    setProps(el, { children: "should_not_set", class: "ok" });
    expect(el.className).toBe("ok");
    // children should NOT be set as a property
    expect((el as any).children).not.toBe("should_not_set");
  });

  test("null/undefined props object is no-op", () => {
    expect(() => setProps(null as any, null)).not.toThrow();
    expect(() => setProps(null as any, undefined)).not.toThrow();
  });
});
