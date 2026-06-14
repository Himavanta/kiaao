// @vitest-environment happy-dom
// kiaao — Extreme edge cases for DOM rendering

import { expect, test, describe } from "vite-plus/test";
import { use, isUse, toValue } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";
import { mount, unmount, disposeNode } from "../../src/dom/component.ts";
import { processChildren } from "../../src/dom/process-children.ts";

// ── processChildren extreme cases ────────────────────

describe("processChildren extreme", () => {
  test("handles deeply nested arrays", () => {
    const deep = [[[[["deep"]]]]];
    const result = processChildren(deep);
    expect(result.length).toBe(1);
    expect(result[0].textContent).toBe("deep");
  });

  test("handles mixed nested arrays with multiple leaf nodes", () => {
    const mixed = ["a", ["b", ["c", "d"]], "e"];
    const result = processChildren(mixed);
    expect(result.length).toBe(5);
    expect(result.map((n) => n.textContent)).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("handles Symbol as child", () => {
    const result = processChildren([Symbol("test") as any]);
    expect(result.length).toBe(1);
    expect(result[0].textContent).toBe("Symbol(test)");
  });

  test("handles BigInt as child", () => {
    const result = processChildren([BigInt(9000) as any]);
    expect(result.length).toBe(1);
    expect(result[0].textContent).toBe("9000");
  });

  test("handles extremely large children array without crashing", () => {
    const large = Array.from({ length: 1000 }, (_, i) => String(i));
    const result = processChildren(large);
    expect(result.length).toBe(1000);
  });
});

// ── isUse edge cases ─────────────────────────────────

describe("isUse extreme", () => {
  test("returns false for Proxy", () => {
    const proxy = new Proxy({}, {});
    expect(isUse(proxy)).toBe(false);
  });

  test("returns false for frozen object", () => {
    expect(isUse(Object.freeze({}))).toBe(false);
  });

  test("returns false for class instance", () => {
    class MyClass {}
    expect(isUse(new MyClass())).toBe(false);
  });
});

// ── disposeNode edge cases ──────────────────────────

describe("disposeNode extreme", () => {
  test("disposeNode called twice is idempotent", () => {
    const el = h("div", null, "test");
    document.body.append(el);

    expect(() => {
      disposeNode(el);
      disposeNode(el);
    }).not.toThrow();
    el.remove();
  });

  test("disposeNode on text node is safe", () => {
    const text = document.createTextNode("hello");
    expect(() => disposeNode(text)).not.toThrow();
  });

  test("disposeNode on comment node is safe", () => {
    const comment = document.createComment("test");
    expect(() => disposeNode(comment)).not.toThrow();
  });

  test("disposeNode on document fragment is safe", () => {
    const frag = document.createDocumentFragment();
    expect(() => disposeNode(frag)).not.toThrow();
  });

  test("disposeNode on disconnected node is safe", () => {
    const el = h("div", null, h("span", null, "child"));
    // Node is not connected to DOM
    expect(() => disposeNode(el)).not.toThrow();
  });
});

// ── mount/unmount edge cases ────────────────────────

describe("mount/unmount extreme", () => {
  test("mount then immediate unmount does not crash", () => {
    function Comp() {
      return h("div", null, "hello");
    }
    const el = h(Comp);
    mount(el, document.body);
    expect(() => unmount(el)).not.toThrow();
  });

  test("unmount already unmounted node is safe", () => {
    const el = h("div", null, "test");
    mount(el, document.body);
    unmount(el);
    expect(() => unmount(el)).not.toThrow();
  });

  test("mount to container with existing children warns but works", () => {
    const container = document.createElement("div");
    container.textContent = "existing";
    document.body.append(container);

    const el = h("p", null, "new");
    mount(el, container);

    // Should not crash; existing content preserved
    expect(container.textContent).toContain("existing");
    expect(container.textContent).toContain("new");

    container.remove();
  });
});

// ── h() extreme cases ──────────────────────────────

describe("h() extreme", () => {
  test("h with no tag and no props", () => {
    const el = h(null as any);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("h with undefined tag", () => {
    const el = h(undefined as any);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("h with number as tag", () => {
    const el = h(0 as any);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("h with boolean as tag", () => {
    const el = h(false as any);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("h with Symbol as tag", () => {
    const el = h(Symbol("x") as any);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("h with object as first child", () => {
    const el = h("div", null, { invalid: true } as any);
    expect(el.textContent).toBe("[object Object]");
  });
});

// ── use() extreme cases ────────────────────────────

describe("use() extreme", () => {
  test("use with Symbol initial value", () => {
    const sym = Symbol("test");
    const [val] = use(sym);
    expect(val()).toBe(sym);
  });

  test("use with BigInt initial value", () => {
    const [val] = use(BigInt(42));
    expect(val()).toBe(BigInt(42));
  });

  test("use with function as initial value (stored as-is)", () => {
    const fn = () => 42;
    const [getFn] = use(fn);
    expect(getFn()).toBe(fn);
    expect(getFn()()).toBe(42);
  });

  test("toValue only unwraps one level", () => {
    const [a] = use(42);
    expect(toValue(a)).toBe(42);

    // Nested signal: toValue only does one level
    const [b] = use(a);
    expect(toValue(b)).toBe(42); // b() calls a() which returns 42
  });

  test("setter with undefined value", () => {
    const [val, setVal] = use<number | undefined>(42);
    setVal(undefined);
    expect(val()).toBeUndefined();
  });

  test("setter with null value", () => {
    const [val, setVal] = use<number | null>(42);
    setVal(null);
    expect(val()).toBeNull();
  });
});

// ── Component returns various types ─────────────────

describe("component return types", () => {
  test("component returning null creates comment placeholder", () => {
    function NullComp() {
      return null as any;
    }
    const el = h(NullComp);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("component returning undefined creates comment placeholder", () => {
    function UndefinedComp() {
      return undefined as any;
    }
    const el = h(UndefinedComp);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("component returning number creates comment placeholder", () => {
    function NumComp() {
      return 42 as any;
    }
    const el = h(NumComp);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });
});
