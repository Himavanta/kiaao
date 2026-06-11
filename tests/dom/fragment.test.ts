// @vitest-environment happy-dom
// kiaao v4 — Fragment 组件测试

import { expect, test, describe } from "vite-plus/test";
import { h, Fragment } from "../../src/index.ts";

describe("Fragment", () => {
  test("wraps children in div with display:contents", () => {
    const el = h(Fragment, null, h("span", null, "a"), h("span", null, "b"));
    expect(el.tagName).toBe("DIV");
    expect((el as HTMLElement).style.display).toBe("contents");
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("a");
    expect(el.children[1].textContent).toBe("b");
  });

  test("works with single child", () => {
    const el = h(Fragment, null, h("p", null, "hello"));
    expect(el.tagName).toBe("DIV");
    expect(el.children.length).toBe(1);
    expect(el.textContent).toBe("hello");
  });

  test("works with no children", () => {
    const el = h(Fragment, null);
    expect(el.tagName).toBe("DIV");
    expect(el.children.length).toBe(0);
  });

  test("nested fragments flatten content", () => {
    const inner = h(Fragment, null, h("span", null, "inner"));
    const outer = h(Fragment, null, h("b", null, "before"), inner, h("i", null, "after"));
    expect(outer.children.length).toBe(3);
    expect(outer.children[0].textContent).toBe("before");
    expect(outer.children[1].textContent).toBe("inner");
    expect(outer.children[2].textContent).toBe("after");
  });

  test("works in component return", () => {
    function Comp() {
      return h(Fragment, null, h("h1", null, "Title"), h("p", null, "Content"));
    }
    const el = h(Comp);
    expect(el.tagName).toBe("DIV");
    expect(el.children.length).toBe(2);
  });
});
