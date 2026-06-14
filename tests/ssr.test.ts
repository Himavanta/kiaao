// kiaao — SSR tests (run in Node.js environment, no happy-dom needed)

import { expect, test, describe } from "vite-plus/test";
import { use, getRenderMode } from "../src/reactive/core.ts";
import { h } from "../src/dom/h.ts";
import { Portal } from "../src/dom/portal.ts";
import { lazy } from "../src/dom/lazy.ts";
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
  test("evaluates signal once in SSR mode", () => {
    const [count] = use(42);
    function Comp() {
      return h("p", null, count);
    }
    const html = renderToString(Comp);
    expect(html).toBe("<p>42</p>");
  });

  test("evaluates derive once in SSR mode", () => {
    const [count] = use(5);
    const [doubled] = use(count, () => count() * 2);
    function Comp() {
      return h("p", null, doubled);
    }
    const html = renderToString(Comp);
    expect(html).toBe("<p>10</p>");
  });
});

describe("renderToString — reactive attributes", () => {
  test("renders reactive class attribute", () => {
    const [isActive] = use(true);
    const [className] = use(isActive, () => (isActive() ? "active" : ""));
    function Comp() {
      return h("div", { class: className });
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div class="active"></div>');
  });

  test("renders raw getter as attribute value", () => {
    const [title] = use("hello");
    function Comp() {
      return h("div", { "data-title": title });
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div data-title="hello"></div>');
  });

  test("static and reactive props in SSR", () => {
    const [title] = use("world");
    function Comp() {
      return h("div", { id: "greeting", "data-title": title, class: "box" });
    }
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
    const [visible] = use(true);
    function Comp() {
      return h("div", { when: visible }, () => h("p", null, "shown"));
    }
    const html = renderToString(Comp);
    expect(html).toBe("<div><p>shown</p></div>");
  });

  test("renders empty element when when() is falsy", () => {
    const [visible] = use(false);
    function Comp() {
      return h("div", { when: visible }, () => h("p", null, "shown"));
    }
    const html = renderToString(Comp);
    expect(html).toBe("<div></div>");
  });

  test("renders else when when() is falsy", () => {
    const [visible] = use(false);
    function Comp() {
      return h("div", { when: visible, else: () => h("p", null, "fallback") }, () =>
        h("p", null, "shown"),
      );
    }
    const html = renderToString(Comp);
    expect(html).toBe("<div><p>fallback</p></div>");
  });

  test("renders primary when when() is truthy with else", () => {
    const [visible] = use(true);
    function Comp() {
      return h("div", { when: visible, else: () => h("p", null, "fallback") }, () =>
        h("p", null, "shown"),
      );
    }
    const html = renderToString(Comp);
    expect(html).toBe("<div><p>shown</p></div>");
  });
});

describe("renderToString — when directive mapping table mode", () => {
  test("renders branch matching the key", () => {
    const [status] = use("loading");
    function Comp() {
      return h(
        "div",
        { when: status },
        {
          loading: () => h("p", null, "加载中"),
          error: () => h("p", null, "出错了"),
        },
      );
    }
    const html = renderToString(Comp);
    expect(html).toBe("<div><p>加载中</p></div>");
  });

  test("renders else when key not found", () => {
    const [status] = use("unknown");
    function Comp() {
      return h(
        "div",
        { when: status, else: () => h("p", null, "默认") },
        {
          loading: () => h("p", null, "加载中"),
        },
      );
    }
    const html = renderToString(Comp);
    expect(html).toBe("<div><p>默认</p></div>");
  });
});

describe("renderToString — each directive", () => {
  test("renders list items", () => {
    const [items] = use(["a", "b", "c"]);
    function Comp() {
      return h("ul", { each: items, key: (item: string) => item }, (item: () => string) =>
        h("li", null, item),
      );
    }
    const html = renderToString(Comp);
    expect(html).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>");
  });
});

describe("renderToString — Portal", () => {
  test("renders placeholder", () => {
    function Comp() {
      return h(Portal, {
        to: "#root",
        children: () => h("div", null, "content"),
      });
    }
    const html = renderToString(Comp);
    expect(html).toBe("<!-- portal placeholder -->");
  });
});

describe("renderToString — lazy", () => {
  test("throws in SSR mode", async () => {
    const Async = lazy(() => Promise.resolve({ default: () => h("p", null, "loaded") }));

    function Comp() {
      return h(Async, null);
    }

    expect(() => renderToString(Comp)).toThrow("Async components are not supported in SSR");
  });
});

describe("SSR — derive as one-time computation", () => {
  test("use derivation computes once in SSR mode", () => {
    const [count] = use(5);
    const [doubled] = use(count, () => count() * 2);

    function Comp() {
      return h("p", null, doubled);
    }
    const html = renderToString(Comp);
    expect(html).toBe("<p>10</p>");

    expect(doubled()).toBe(10);
  });
});

describe("SSR — FORCE_ATTRIBUTE filtering", () => {
  test("FORCE_ATTRIBUTE (class, id) outputs in SSR", () => {
    function Comp() {
      return h("div", { class: "box", id: "main" }, "content");
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div class="box" id="main">content</div>');
  });

  test("non-FORCE_ATTRIBUTE (value, checked) does NOT output in SSR", () => {
    function Comp() {
      return h("input", { value: "secret", checked: true });
    }
    const html = renderToString(Comp);
    expect(html).toBe("<input />");
    expect(html).not.toContain("value");
    expect(html).not.toContain("checked");
  });

  test("disabled FORCE_ATTRIBUTE outputs boolean attribute", () => {
    function Comp() {
      return h("button", { disabled: true }, "click");
    }
    const html = renderToString(Comp);
    expect(html).toBe("<button disabled>click</button>");
  });

  test("disabled false does NOT output", () => {
    function Comp() {
      return h("button", { disabled: false }, "click");
    }
    const html = renderToString(Comp);
    expect(html).toBe("<button>click</button>");
  });

  test("aria-* outputs in SSR", () => {
    function Comp() {
      return h("div", { "aria-label": "Close", "aria-hidden": "true" }, "X");
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div aria-label="Close" aria-hidden="true">X</div>');
  });

  test("data-* outputs in SSR", () => {
    function Comp() {
      return h("div", { "data-id": "123", "data-custom": "val" }, "content");
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div data-id="123" data-custom="val">content</div>');
  });
});

describe("SSR — attr: / prop: prefix", () => {
  test("attr:value outputs in SSR (overrides default skip)", () => {
    function Comp() {
      return h("input", { "attr:value": "initial" });
    }
    const html = renderToString(Comp);
    expect(html).toBe('<input value="initial" />');
  });

  test("prop:disabled does NOT output in SSR", () => {
    function Comp() {
      return h("button", { "prop:disabled": true }, "click");
    }
    const html = renderToString(Comp);
    expect(html).toBe("<button>click</button>");
    expect(html).not.toContain("disabled");
  });

  test("attr:class outputs as class attribute", () => {
    function Comp() {
      return h("div", { "attr:class": "box" }, "content");
    }
    const html = renderToString(Comp);
    expect(html).toBe('<div class="box">content</div>');
  });

  test("unprefixed value does NOT output (regression check)", () => {
    function Comp() {
      return h("input", { value: "should-not-appear" });
    }
    const html = renderToString(Comp);
    expect(html).toBe("<input />");
    expect(html).not.toContain("value");
  });
});

describe("SSR — render mode", () => {
  test("renderToString sets SSR mode internally and restores it", () => {
    const prev = getRenderMode();
    expect(prev).toBe("dom");

    function Comp() {
      const [x] = use(10);
      return h("p", null, x);
    }
    const html = renderToString(Comp);
    expect(html).toBe("<p>10</p>");

    expect(getRenderMode()).toBe("dom");
  });
});
