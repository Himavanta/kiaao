// @vitest-environment happy-dom
// kiaao — SSR adapter 调用边界测试：renderToString 极端输入

import { expect, test, describe, afterAll } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";
import { ssrAdapter } from "../../src/server/adapter.ts";
import { renderToString } from "../../src/server/index.ts";

// SSR adapter 直接调用边界测试
describe("SSR adapter — direct API", () => {
  test("before does not crash on any input", () => {
    expect(() => ssrAdapter.before(null as any, null as any)).not.toThrow();
    expect(() => ssrAdapter.before(undefined as any, {} as any)).not.toThrow();
    expect(() => ssrAdapter.before({}, [])).not.toThrow();
  });

  test("append builds SSR node tree", () => {
    const parent: any = ssrAdapter.el("div");
    const child: any = ssrAdapter.el("span");
    ssrAdapter.append(parent, child);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].tag).toBe("span");
  });

  test("remove is no-op on any input", () => {
    expect(() => ssrAdapter.remove(null as any)).not.toThrow();
    expect(() => ssrAdapter.remove(undefined as any)).not.toThrow();
    expect(() => ssrAdapter.remove({})).not.toThrow();
  });

  test("clear is no-op on any type", () => {
    expect(() => ssrAdapter.clear(ssrAdapter.el("div"))).not.toThrow();
    expect(() => ssrAdapter.clear(ssrAdapter.text("hi"))).not.toThrow();
    expect(() => ssrAdapter.clear(ssrAdapter.comment("x"))).not.toThrow();
    expect(() => ssrAdapter.clear(null as any)).not.toThrow();
  });

  test("on/off is no-op", () => {
    expect(() => ssrAdapter.on({} as any, "click", () => {})).not.toThrow();
    expect(() => ssrAdapter.off({} as any, "click", () => {})).not.toThrow();
  });

  test("replace is no-op", () => {
    expect(() => ssrAdapter.replace(ssrAdapter.el("span"), ssrAdapter.el("em"))).not.toThrow();
  });

  test("isNode identifies SSR nodes", () => {
    expect(ssrAdapter.isNode(ssrAdapter.el("div"))).toBe(true);
    expect(ssrAdapter.isNode(ssrAdapter.text("hi"))).toBe(true);
    expect(ssrAdapter.isNode(ssrAdapter.comment("x"))).toBe(true);
    expect(ssrAdapter.isNode(null)).toBe(false);
    expect(ssrAdapter.isNode(undefined)).toBe(false);
    expect(ssrAdapter.isNode("string")).toBe(false);
    expect(ssrAdapter.isNode(42)).toBe(false);
  });

  test("prevSibling returns null", () => {
    expect(ssrAdapter.prevSibling({} as any)).toBeNull();
  });
});

// renderToString 边界测试
describe("renderToString — edge cases", () => {
  test("special characters in text are escaped", () => {
    const html = renderToString(() => h("div", null, 'hello <world> & "escaped"'));
    expect(html).toContain("&lt;world&gt;");
    expect(html).toContain("&amp;");
  });

  test("special characters in attribute are escaped", () => {
    renderToString(() => h("div", { title: 'hello "world"' }));
  });

  test("void elements render as self-closing", () => {
    expect(renderToString(() => h("br"))).toBe("<br />");
    expect(renderToString(() => h("hr"))).toBe("<hr />");
    expect(renderToString(() => h("img", { src: "a.png" }))).toContain("/>");
  });

  test("boolean attributes: true = bare, false = skip", () => {
    const html = renderToString(() => h("input", { disabled: true, readonly: false }));
    expect(html).toContain("disabled");
    expect(html).not.toContain("readonly");
  });

  test("signal renders initial value", () => {
    const name = use("SSR");
    const html = renderToString(() => h("div", null, "Hello ", name));
    expect(html).toBe("<div>Hello SSR</div>");
  });

  test("null/undefined children are skipped in SSR", () => {
    const html = renderToString(() => h("div", null, null, undefined, "ok"));
    expect(html).toBe("<div>ok</div>");
  });

  test("zero and empty string render in SSR", () => {
    const html = renderToString(() => h("div", null, 0, "", "end"));
    expect(html).toBe("<div>0end</div>");
  });

  test("deeply nested elements render", () => {
    function deep(tag: string, depth: number): any {
      if (depth <= 0) return h(tag);
      return h(tag, null, deep(tag, depth - 1));
    }
    const html = renderToString(() => deep("div", 20));
    expect(html).toBeTruthy();
    // Should have 20 levels of nested divs
    expect((html.match(/<div>/g) || []).length).toBe(21);
  });

  test("event handler props are skipped in SSR", () => {
    const html = renderToString(() => h("button", { onClick: () => {}, type: "submit" }, "click"));
    expect(html).toContain('type="submit"');
    expect(html).not.toContain("onClick");
    expect(html).not.toContain("onclick");
  });
});

// 当前 adapter 还原
afterAll(() => {
  setAdapter(browserAdapter);
});
