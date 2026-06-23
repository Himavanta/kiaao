// @vitest-environment happy-dom
// kiaao — Browser adapter and props tests

import { expect, test, describe } from "vite-plus/test";
import { setAdapter, removeNode } from "../../src/core/types.ts";
import { browserAdapter } from "../../src/dom/adapter.ts";
import { setProp, setProps, stripPrefix } from "../../src/dom/props.ts";
import { use } from "../../src/core/signal.ts";
import { createOwner, disposeOwner } from "../../src/core/owner.ts";

// Register browser adapter for tests
setAdapter(browserAdapter);

// ── RenderAdapter: Browser Implementation ─────────────

describe("browserAdapter.createElement", () => {
  test("creates HTML elements", () => {
    const el = browserAdapter.createElement("div") as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el instanceof HTMLElement).toBe(true);
  });

  test("creates SVG elements", () => {
    const el = browserAdapter.createElement("circle") as SVGElement;
    expect(el.tagName).toBe("circle");
    expect(el instanceof SVGElement).toBe(true);
  });

  test("creates various HTML tags", () => {
    const tags = ["span", "p", "a", "ul", "li", "table", "input", "button", "h1", "section"];
    for (const tag of tags) {
      const el = browserAdapter.createElement(tag);
      expect((el as HTMLElement).tagName).toBe(tag.toUpperCase());
    }
  });

  test("creates SVG tags from the SVG_TAGS set", () => {
    const svgTags = ["svg", "path", "rect", "text", "g", "defs", "linearGradient"];
    for (const tag of svgTags) {
      const el = browserAdapter.createElement(tag);
      expect(el instanceof SVGElement).toBe(true);
    }
  });
});

describe("browserAdapter.createTextNode", () => {
  test("creates a text node with content", () => {
    const text = browserAdapter.createTextNode("hello") as Text;
    expect(text.textContent).toBe("hello");
    expect(text.nodeType).toBe(Node.TEXT_NODE);
  });

  test("empty text node", () => {
    const text = browserAdapter.createTextNode("") as Text;
    expect(text.textContent).toBe("");
  });
});

describe("browserAdapter.createComment", () => {
  test("creates a comment node with content", () => {
    const comment = browserAdapter.createComment("each-0") as Comment;
    expect(comment.textContent).toBe("each-0");
    expect(comment.nodeType).toBe(Node.COMMENT_NODE);
  });
});

describe("browserAdapter.before", () => {
  test("inserts child before reference node", () => {
    const parent = browserAdapter.createElement("div") as HTMLElement;
    const child1 = browserAdapter.createElement("span") as HTMLElement;
    const child2 = browserAdapter.createElement("p") as HTMLElement;

    parent.append(child1);
    browserAdapter.before(child1, child2);

    expect(parent.children[0]).toBe(child2);
    expect(parent.children[1]).toBe(child1);
  });

  test("inserts at end when no ref", () => {
    const parent = browserAdapter.createElement("div") as HTMLElement;
    const child1 = browserAdapter.createElement("span") as HTMLElement;
    const child2 = browserAdapter.createElement("p") as HTMLElement;

    parent.append(child1);
    browserAdapter.append(parent, child2);

    expect(parent.children[1]).toBe(child2);
  });
});

describe("browserAdapter.remove", () => {
  test("removes element from parent", () => {
    const parent = browserAdapter.createElement("div") as HTMLElement;
    const child = browserAdapter.createElement("span") as HTMLElement;
    parent.appendChild(child);

    expect(parent.children.length).toBe(1);
    browserAdapter.remove(child);
    expect(parent.children.length).toBe(0);
  });

  test("does nothing for already removed element", () => {
    const el = browserAdapter.createElement("div") as HTMLElement;
    // Element was never appended; remove shouldn't throw
    expect(() => browserAdapter.remove(el)).not.toThrow();
  });
});

describe("browserAdapter.replaceWith", () => {
  test("replaces single node", () => {
    const parent = browserAdapter.createElement("div") as HTMLElement;
    const old = browserAdapter.createElement("span") as HTMLElement;
    const replacement = browserAdapter.createElement("p") as HTMLElement;
    parent.appendChild(old);

    browserAdapter.replaceWith(old, replacement);

    expect(parent.children.length).toBe(1);
    expect(parent.children[0].tagName).toBe("P");
  });

  test("replaces with multiple nodes", () => {
    const parent = browserAdapter.createElement("div") as HTMLElement;
    const old = browserAdapter.createElement("span") as HTMLElement;
    const a = browserAdapter.createElement("p") as HTMLElement;
    const b = browserAdapter.createElement("h1") as HTMLElement;
    parent.appendChild(old);

    browserAdapter.replaceWith(old, a, b);

    expect(parent.children.length).toBe(2);
    expect(parent.children[0].tagName).toBe("P");
    expect(parent.children[1].tagName).toBe("H1");
  });
});

describe("browserAdapter.setProp — attribute behavior", () => {
  test("FORCE_ATTRIBUTE goes through setAttribute", () => {
    const el = browserAdapter.createElement("div") as HTMLElement;
    browserAdapter.setProp(el, "class", "box");
    expect(el.getAttribute("class")).toBe("box");
  });

  test("null value removes attribute", () => {
    const el = browserAdapter.createElement("div") as HTMLElement;
    el.setAttribute("class", "box");
    browserAdapter.setProp(el, "class", null);
    expect(el.hasAttribute("class")).toBe(false);
  });

  test("false value removes attribute for FORCE_ATTRIBUTE", () => {
    const el = browserAdapter.createElement("button") as HTMLElement;
    el.setAttribute("disabled", "");
    browserAdapter.setProp(el, "disabled", false);
    expect(el.hasAttribute("disabled")).toBe(false);
  });

  test("true value sets empty attribute for FORCE_ATTRIBUTE", () => {
    const el = browserAdapter.createElement("button") as HTMLElement;
    browserAdapter.setProp(el, "disabled", true);
    expect(el.getAttribute("disabled")).toBe("");
  });
});

describe("browserAdapter.setProp — property behavior", () => {
  test("sets property on element", () => {
    const el = browserAdapter.createElement("input") as HTMLInputElement;
    browserAdapter.setProp(el, "value", "test");
    expect(el.value).toBe("test");
  });

  test("sets custom property", () => {
    const el: any = browserAdapter.createElement("div");
    browserAdapter.setProp(el, "customProp", 42);
    expect(el.customProp).toBe(42);
  });
});

// ── removeNode (core utility) ─────────────────────

describe("removeNode (core utility)", () => {
  test("removes element when adapter is registered", () => {
    const parent = document.createElement("div");
    const child = document.createElement("span");
    parent.appendChild(child);
    expect(parent.children.length).toBe(1);
    removeNode(child);
    expect(parent.children.length).toBe(0);
  });
});

// ── stripPrefix ───────────────────────────────────────

describe("stripPrefix", () => {
  test("detects attr: prefix", () => {
    const result = stripPrefix("attr:value");
    expect(result.prefix).toBe("attr");
    expect(result.key).toBe("value");
  });

  test("detects prop: prefix", () => {
    const result = stripPrefix("prop:value");
    expect(result.prefix).toBe("prop");
    expect(result.key).toBe("value");
  });

  test("returns null prefix for plain keys", () => {
    const result = stripPrefix("class");
    expect(result.prefix).toBe(null);
    expect(result.key).toBe("class");
  });
});

// ── setProp ───────────────────────────────────────────

describe("setProp", () => {
  test("sets FORCE_ATTRIBUTE via setAttribute", () => {
    const el = document.createElement("div");
    setProp(el, "class", "box");
    expect(el.getAttribute("class")).toBe("box");
  });

  test("sets property for non-FORCE_ATTRIBUTE", () => {
    const el = document.createElement("input") as HTMLInputElement;
    setProp(el, "value", "hello");
    expect(el.value).toBe("hello");
  });

  test("binds event via addEventListener", () => {
    const el = document.createElement("button");
    let called = false;
    setProp(el, "onClick", () => {
      called = true;
    });
    el.click();
    expect(called).toBe(true);
  });

  test("handles style as string", () => {
    const el = document.createElement("div");
    setProp(el, "style", "color: red; font-size: 16px");
    expect(el.getAttribute("style")).toBe("color: red; font-size: 16px;");
  });

  test("handles style as object", () => {
    const el = document.createElement("div");
    setProp(el, "style", { color: "red", fontSize: "16px" });
    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("16px");
  });

  test("handles attr: prefix", () => {
    const el = document.createElement("div");
    setProp(el, "attr:data-test", "value");
    expect(el.getAttribute("data-test")).toBe("value");
  });

  test("handles prop: prefix", () => {
    const el = document.createElement("input") as HTMLInputElement;
    setProp(el, "prop:value", "override");
    expect(el.value).toBe("override");
  });

  test("handles aria-* attributes", () => {
    const el = document.createElement("div");
    setProp(el, "aria-label", "close");
    expect(el.getAttribute("aria-label")).toBe("close");
  });

  test("handles data-* attributes", () => {
    const el = document.createElement("div");
    setProp(el, "data-id", "42");
    expect(el.getAttribute("data-id")).toBe("42");
  });

  test("skips null/undefined values", () => {
    const el = document.createElement("div");
    expect(() => setProp(el, "class", null)).not.toThrow();
    expect(() => setProp(el, "class", undefined)).not.toThrow();
  });

  test("boolean FORCE_ATTRIBUTE: true sets empty string", () => {
    const el = document.createElement("button");
    setProp(el, "disabled", true);
    expect(el.getAttribute("disabled")).toBe("");
  });

  test("boolean FORCE_ATTRIBUTE: false removes attribute", () => {
    const el = document.createElement("button");
    el.setAttribute("disabled", "");
    setProp(el, "disabled", false);
    expect(el.hasAttribute("disabled")).toBe(false);
  });
});

// ── setProps ──────────────────────────────────────────

describe("setProps", () => {
  test("sets multiple properties at once", () => {
    const el = document.createElement("div");
    setProps(el, { class: "box", id: "main", title: "hello" });
    expect(el.getAttribute("class")).toBe("box");
    expect(el.getAttribute("id")).toBe("main");
    expect(el.getAttribute("title")).toBe("hello");
  });

  test("skips null/undefined props", () => {
    const el = document.createElement("div");
    expect(() => setProps(el, null)).not.toThrow();
    expect(() => setProps(el, undefined)).not.toThrow();
  });

  test("skips children key", () => {
    const el = document.createElement("div");
    setProps(el, { children: "should_not_set", class: "ok" } as any);
    expect(el.getAttribute("class")).toBe("ok");
    expect(el.hasAttribute("children")).toBe(false);
  });

  test("reactive attribute: creates derived and registers cleanup to Owner", () => {
    const el = document.createElement("div");
    const owner = createOwner();
    const title = use("hello");

    setProps(el, { title }, owner.cleanups);

    expect(el.getAttribute("title")).toBe("hello");

    title("world");
    expect(el.getAttribute("title")).toBe("world");

    // On owner disposal, the cleanup should stop the derived
    disposeOwner(owner);

    // After disposal, setting should not update element
    title("gone");
    expect(el.getAttribute("title")).toBe("world");
  });

  test("reactive attribute: Owner cleanup stops signal binding", () => {
    const el = document.createElement("div");
    const count = use(0);
    const owner = createOwner();

    setProps(el, { "data-count": count }, owner.cleanups);

    expect(el.getAttribute("data-count")).toBe("0");

    count(5);
    expect(el.getAttribute("data-count")).toBe("5");

    // disposeOwner 会执行 owner.cleanups，停止信号绑定
    disposeOwner(owner);

    // After dispose, changing count should not affect the element
    count(10);
    expect(el.getAttribute("data-count")).toBe("5");
  });

  test("setProps with cleanups array collects signal stops", () => {
    const el = document.createElement("div");
    const title = use("a");
    const cleanups: (() => void)[] = [];

    setProps(el, { title }, cleanups);

    expect(cleanups.length).toBe(1);
    expect(typeof cleanups[0]).toBe("function");

    // Signal still works
    expect(el.getAttribute("title")).toBe("a");
    title("b");
    expect(el.getAttribute("title")).toBe("b");
  });

  test("setProps with cleanups — multiple signals each produce a cleanup", () => {
    const el = document.createElement("div");
    const a = use("x");
    const b = use("y");
    const cleanups: (() => void)[] = [];

    setProps(el, { title: a, "data-id": b }, cleanups);

    expect(cleanups.length).toBe(2);
  });

  test("setProps without cleanups still works (backward compat)", () => {
    const el = document.createElement("div");
    const count = use(0);

    // 不传第三个参数，不应报错
    expect(() => setProps(el, { "data-n": count })).not.toThrow();
    expect(el.getAttribute("data-n")).toBe("0");
  });

  test("setProps with empty cleanups does not affect behavior", () => {
    const el = document.createElement("div");
    const cleanups: (() => void)[] = [];

    setProps(el, { class: "box" }, cleanups);
    expect(el.getAttribute("class")).toBe("box");
    expect(cleanups).toEqual([]);
  });
});
