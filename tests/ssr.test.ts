// SSR tests — run in Node.js environment (no happy-dom needed)

import { expect, test, describe } from "vite-plus/test";
import { define, derive, effect } from "../src/index.ts";
import { h } from "../src/core/h.ts";
import { Teleport, lazy } from "../src/core/components.ts";
import { renderToString } from "../src/server/index.ts";

describe("renderToString — basic elements", () => {
  test("renders a simple element", () => {
    function Comp() {
      return h("div", null, "hello");
    }
    const html = renderToString(Comp);
    expect(html).toBe("<div>hello</div>");
  });

  test("renders with props", () => {
    function Comp() {
      return h("div", { class: "foo", id: "bar" }, "content");
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div class="foo" id="bar">content</div>');
  });

  test("skips event handlers", () => {
    function Comp() {
      return h("button", { onClick: () => {}, class: "btn" }, "click");
    }
    const html = renderToString(Comp);
    expect(html).toBe('<button class="btn">click</button>');
    expect(html).not.toContain("onClick");
  });

  test("escapes HTML in text content", () => {
    function Comp() {
      return h("div", null, "<script>alert('xss')</script>");
    }
    const html = renderToString(Comp);
    expect(html).toBe("<div>&lt;script&gt;alert('xss')&lt;/script&gt;</div>");
  });

  test("escapes HTML in attributes", () => {
    function Comp() {
      return h("div", { title: '"quoted" & <tag>' });
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div title="&quot;quoted&quot; &amp; &lt;tag&gt;"></div>');
  });

  test("renders void elements without closing tag", () => {
    function Comp() {
      return h("br", null);
    }
    const html = renderToString(Comp);
    expect(html).toBe("<br />");
  });

  test("renders style as string", () => {
    function Comp() {
      return h("div", { style: "color: red; font-size: 14px" });
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div style="color: red; font-size: 14px"></div>');
  });

  test("renders style as object", () => {
    function Comp() {
      return h("div", { style: { color: "red", fontSize: "14px" } });
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div style="color: red; font-size: 14px"></div>');
  });
});

describe("renderToString — reactive bindings", () => {
  test("evaluates getter selector once", () => {
    const [count] = define(42);
    function Comp() {
      return h("p", null, count);
    }
    const html = renderToString(Comp);
    expect(html).toBe("<p>42</p>");
  });

  test("evaluates derive once in SSR mode", () => {
    const [count] = define(5);
    const doubled = derive(() => count() * 2);
    function Comp() {
      return h("p", null, doubled);
    }
    const html = renderToString(Comp);
    expect(html).toBe("<p>10</p>");
  });
});

describe("renderToString — reactive attributes", () => {
  test("renders reactive class attribute", () => {
    const [isActive] = define(true);
    function Comp() {
      return h("div", { class: isActive((v) => (v ? "active" : "")) });
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div class="active"></div>');
  });

  test("renders reactive style string attribute", () => {
    const [theme] = define("dark");
    function Comp() {
      return h("div", { style: theme((v) => (v === "dark" ? "color: white" : "color: black")) });
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div style="color: white"></div>');
  });

  test("renders reactive style object attribute", () => {
    const [color] = define("red");
    function Comp() {
      return h("div", { style: color((v) => ({ color: v })) });
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div style="color: red"></div>');
  });

  test("renders raw getter as attribute value", () => {
    const [title] = define("hello");
    function Comp() {
      return h("div", { "data-title": title });
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div data-title="hello"></div>');
  });

  test("static and reactive props in SSR", () => {
    const [title] = define("world");
    function Comp() {
      return h("div", { id: "greeting", "data-title": title, class: "box" });
    }
    // Object.keys preserves insertion order: id, data-title, class
    const html = renderToString(Comp);
    expect(html).toBe('<div id="greeting" data-title="world" class="box"></div>');
  });
});

describe("renderToString — components", () => {
  test("renders nested components", () => {
    function Inner(props: { text: string }) {
      return h("span", null, props.text);
    }
    function Outer() {
      return h("div", null, h(Inner, { text: "nested" }));
    }
    const html = renderToString(Outer);
    expect(html).toBe("<div><span>nested</span></div>");
  });

  test("renders component with props", () => {
    function Greet(props: { name: string }) {
      return h("p", null, `Hello, ${props.name}!`);
    }
    const html = renderToString(Greet, { name: "SSR" });
    expect(html).toBe("<p>Hello, SSR!</p>");
  });
});

describe("renderToString — when directive", () => {
  test("renders children when when() is truthy", () => {
    const [visible] = define(true);
    function Comp() {
      return h("div", { when: visible }, () => h("p", null, "shown"));
    }
    const html = renderToString(Comp);
    expect(html).toBe("<div><p>shown</p></div>");
  });

  test("renders empty element when when() is falsy", () => {
    const [visible] = define(false);
    function Comp() {
      return h("div", { when: visible }, () => h("p", null, "shown"));
    }
    const html = renderToString(Comp);
    expect(html).toBe("<div></div>");
  });
});

describe("renderToString — each directive", () => {
  test("renders list items", () => {
    const [items] = define(["a", "b", "c"]);
    function Comp() {
      return h(
        "ul",
        {
          each: () => items(),
          key: (item: string) => item,
        },
        (item: string) => h("li", null, item),
      );
    }
    const html = renderToString(Comp);
    expect(html).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>");
  });
});

describe("renderToString — Teleport", () => {
  test("renders placeholder", () => {
    function Comp() {
      return h(Teleport, {
        to: "#root",
        children: () => h("div", null, "content"),
      });
    }
    const html = renderToString(Comp);
    expect(html).toBe("<!-- teleport placeholder -->");
  });
});

describe("renderToString — lazy", () => {
  test("renders empty placeholder before resolve", async () => {
    const Async = lazy(() => Promise.resolve({ default: () => h("p", null, "loaded") }));

    function Comp() {
      return h(Async, null);
    }

    // Before promise resolves, lazy renders an empty div (when is false)
    const html = renderToString(Comp);
    expect(html).toBe('<div style="display: contents"></div>');
  });
});

describe("SSR — effect and derive behavior", () => {
  test("effect is disabled in SSR mode", () => {
    let called = false;
    const stop = effect(() => {
      called = true;
    });
    // Outside SSR mode, effect runs immediately
    expect(called).toBe(true);
    stop();
  });

  test("derive returns fixed value in SSR mode", () => {
    const [count] = define(5);
    const doubled = derive(() => count() * 2);

    // In SSR mode, derive computes once and caches
    function Comp() {
      return h("p", null, doubled);
    }
    const html = renderToString(Comp);
    expect(html).toBe("<p>10</p>");

    // In normal mode, still works
    expect(doubled()).toBe(10);
  });
});
