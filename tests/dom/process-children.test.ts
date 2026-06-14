// @vitest-environment happy-dom
// kiaao — processChildren 极限测试

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { processChildren } from "../../src/dom/process-children.ts";
import { LOCAL_EFFECTS } from "../../src/reactive/types.ts";

// ── 空/跳过 ─────────────────────────────────────────

describe("processChildren — skip values", () => {
  test("empty array returns empty result", () => {
    expect(processChildren([])).toEqual([]);
  });

  test("null is skipped", () => {
    const result = processChildren([null]);
    expect(result.length).toBe(0);
  });

  test("undefined is skipped", () => {
    const result = processChildren([undefined]);
    expect(result.length).toBe(0);
  });

  test("false is skipped", () => {
    const result = processChildren([false]);
    expect(result.length).toBe(0);
  });

  test("true is skipped", () => {
    const result = processChildren([true]);
    expect(result.length).toBe(0);
  });
});

// ── 静态子节点 ──────────────────────────────────────

describe("processChildren — static nodes", () => {
  test("string creates text node", () => {
    const result = processChildren(["hello"]);
    expect(result.length).toBe(1);
    expect(result[0].nodeType).toBe(Node.TEXT_NODE);
    expect(result[0].textContent).toBe("hello");
  });

  test("number creates text node", () => {
    const result = processChildren([42]);
    expect(result[0].textContent).toBe("42");
  });

  test("Element node passes through", () => {
    const span = document.createElement("span");
    const result = processChildren([span]);
    expect(result[0]).toBe(span);
  });

  test("Comment node passes through", () => {
    const comment = document.createComment("test");
    const result = processChildren([comment]);
    expect(result[0]).toBe(comment);
  });

  test("DocumentFragment passes through", () => {
    const frag = document.createDocumentFragment();
    const result = processChildren([frag]);
    expect(result[0]).toBe(frag);
  });
});

// ── 信号子节点 ──────────────────────────────────────

describe("processChildren — signal children", () => {
  test("signal creates text node with initial value", () => {
    const [count] = use(42);
    const result = processChildren([count]);
    expect(result.length).toBe(1);
    expect(result[0].nodeType).toBe(Node.TEXT_NODE);
    expect(result[0].textContent).toBe("42");
  });

  test("signal text node updates on change", () => {
    const [count, setCount] = use(0);
    const result = processChildren([count]);
    expect(result[0].textContent).toBe("0");

    setCount(99);
    expect(result[0].textContent).toBe("99");
  });

  test("signal text node has LOCAL_EFFECTS registered", () => {
    const [count] = use(0);
    const result = processChildren([count]);
    expect((result[0] as any)[LOCAL_EFFECTS]).toBeDefined();
  });

  test("signal with null value displays 'null'", () => {
    const [val] = use(null);
    const result = processChildren([val]);
    expect(result[0].textContent).toBe("null");
  });

  test("signal with undefined value displays 'undefined'", () => {
    const [val] = use(undefined);
    const result = processChildren([val]);
    expect(result[0].textContent).toBe("undefined");
  });

  test("signal with object value displays '[object Object]'", () => {
    const [val] = use({ a: 1 });
    const result = processChildren([val]);
    expect(result[0].textContent).toBe("[object Object]");
  });
});

// ── 嵌套数组 ────────────────────────────────────────

describe("processChildren — nested arrays", () => {
  test("flattens one level of nesting", () => {
    const a = document.createElement("span");
    const b = document.createElement("span");
    const result = processChildren([[a, b]]);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
  });

  test("flattens deeply nested arrays", () => {
    const a = document.createElement("span");
    const b = document.createElement("span");
    const result = processChildren([[[a]], [[b]]]);
    expect(result.length).toBe(2);
  });

  test("nested arrays with mixed types", () => {
    const [sig] = use("sig");
    const el = document.createElement("div");
    const result = processChildren([["text", sig, [el]]]);
    expect(result.length).toBe(3);
    expect(result[0].textContent).toBe("text");
    expect(result[1].textContent).toBe("sig");
    expect(result[2]).toBe(el);
  });

  test("nested array with skips", () => {
    const result = processChildren([["a", null, "b", [undefined, "c"]]]);
    expect(result.length).toBe(3);
    expect(result.map((n) => n.textContent)).toEqual(["a", "b", "c"]);
  });
});

// ── 混合输入 ────────────────────────────────────────

describe("processChildren — mixed input", () => {
  test("multiple types in one array", () => {
    const [sig] = use("signal");
    const el = document.createElement("span");
    el.textContent = "node";
    const result = processChildren(["text", 42, sig, el]);
    expect(result.length).toBe(4);
  });

  test("order is preserved", () => {
    const result = processChildren(["a", ["b", "c"], "d"]);
    expect(result.map((n) => n.textContent)).toEqual(["a", "b", "c", "d"]);
  });
});

// ── 特殊值 ──────────────────────────────────────────

describe("processChildren — special values", () => {
  test("Symbol creates text node", () => {
    const result = processChildren([Symbol("x") as any]);
    expect(result[0].textContent).toBe("Symbol(x)");
  });

  test("BigInt creates text node", () => {
    const result = processChildren([BigInt(42) as any]);
    expect(result[0].textContent).toBe("42");
  });

  test("0 (number) creates text node", () => {
    const result = processChildren([0]);
    expect(result[0].textContent).toBe("0");
  });

  test("empty string creates text node", () => {
    const result = processChildren([""]);
    expect(result[0].textContent).toBe("");
  });
});
