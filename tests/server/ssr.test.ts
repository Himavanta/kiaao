// @vitest-environment happy-dom
// kiaao — SSR rendering tests

import { expect, test, describe } from "vite-plus/test";
import { renderToString } from "../../src/server/index.ts";
import { h } from "../../src/core/h.ts";

describe("renderToString", () => {
  test("renders basic component to HTML string", () => {
    function App() {
      return h("div", { id: "root" }, "Hello");
    }
    const html = renderToString(App);
    expect(html).toBe('<div id="root">Hello</div>');
  });

  test("renders nested elements", () => {
    function App() {
      return h("div", null, h("h1", null, "Title"), h("p", null, "Content"));
    }
    const html = renderToString(App);
    expect(html).toBe("<div><h1>Title</h1><p>Content</p></div>");
  });

  test("renders attributes", () => {
    function App() {
      return h("a", { class: "link", href: "/test" }, "click");
    }
    const html = renderToString(App);
    expect(html).toBe('<a class="link" href="/test">click</a>');
  });

  test("skips event handlers", () => {
    function App() {
      return h("button", { onClick: () => {} }, "click");
    }
    const html = renderToString(App);
    expect(html).toBe("<button>click</button>");
  });

  test("renders void elements correctly", () => {
    function App() {
      return h("div", null, h("br"), h("hr"), h("input", { type: "text" }));
    }
    const html = renderToString(App);
    expect(html).toBe('<div><br /><hr /><input type="text" /></div>');
  });

  test("renders Fragment without extra wrapper", () => {
    function App() {
      return [...(h("span", null, "a") as Node[]), ...(h("span", null, "b") as Node[])];
    }
    const html = renderToString(App);
    expect(html).toBe("<span>a</span><span>b</span>");
  });

  test("handles style object serialization", () => {
    function App() {
      return h("div", { style: { color: "red", fontSize: "16px" } }, "styled");
    }
    const html = renderToString(App);
    expect(html).toContain('style="');
    expect(html).toContain("color: red");
    expect(html).toContain("font-size: 16px");
  });

  test("handles numeric values in text", () => {
    function App() {
      return h("p", null, 42);
    }
    const html = renderToString(App);
    expect(html).toBe("<p>42</p>");
  });

  test("renders with props", () => {
    function App(props: any) {
      return h("div", null, String(props.name));
    }
    const html = renderToString(App, { name: "kiaao" });
    expect(html).toBe("<div>kiaao</div>");
  });

  test("renders with slots", () => {
    function App(_props: any, _context: any) {
      return h("div", null, _props.children);
    }
    const html = renderToString(App, {}, { slots: { default: "slot content" } });
    expect(html).toBe("<div>slot content</div>");
  });
});
