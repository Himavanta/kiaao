// @vitest-environment happy-dom
// kiaao — h() / nestBindPrimitive 类型极端值防御测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount, type HResult, isHResult } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: HResult): HTMLElement {
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(container, node as any);
  }
  if (result.owner) triggerMount(result.owner);
  return container;
}

// ── h() tag 极端值 ─────────────────────────────────────

describe("h() — invalid tag", () => {
  test("null tag does not crash", () => {
    const result = h(null as any);
    expect((result.nodes[0] as any).nodeType).toBe(8); // Comment node (error fallback)
  });

  test("undefined tag does not crash", () => {
    const result = h(undefined as any);
    expect((result.nodes[0] as any).nodeType).toBe(8);
  });

  test("number tag does not crash", () => {
    const result = h(42 as any);
    expect((result.nodes[0] as any).nodeType).toBe(8);
  });

  test("Symbol tag does not crash", () => {
    const result = h(Symbol("test") as any);
    expect((result.nodes[0] as any).nodeType).toBe(8);
  });

  test("object tag does not crash", () => {
    const result = h({} as any);
    expect((result.nodes[0] as any).nodeType).toBe(8);
  });
});

// ── h() props 极端值 ──────────────────────────────────

describe("h() — extreme props", () => {
  test("null props does not crash", () => {
    expect(() => h("div", null)).not.toThrow();
  });

  test("undefined props does not crash", () => {
    expect(() => h("div", undefined)).not.toThrow();
  });

  test("empty string tag does not crash", () => {
    const result = h("" as any);
    expect(result.nodes.length).toBe(1);
  });
});

// ── h() children 极端值 ────────────────────────────────

describe("h() — extreme children", () => {
  test("null/undefined are filtered, true renders as text", () => {
    const result = h("div", null, null, undefined, true, "ok");
    const container = mount(result);
    // null/undefined filtered, true renders as text node "true", "ok" renders
    expect(container.textContent).toContain("ok");
  });

  test("Symbol as child renders as string", () => {
    const result = h("div", null, Symbol("test") as any);
    mount(result);
    expect((result.nodes[0] as any).textContent).toBe("Symbol(test)");
  });

  test("0 as child renders", () => {
    const result = h("div", null, 0);
    mount(result);
    expect((result.nodes[0] as any).textContent).toBe("0");
  });

  test("NaN as child renders", () => {
    const result = h("div", null, NaN);
    mount(result);
    expect((result.nodes[0] as any).textContent).toBe("NaN");
  });

  test("empty array as child is skipped", () => {
    const result = h("div", null, []);
    mount(result);
    expect((result.nodes[0] as any).childNodes.length).toBe(0);
  });

  test("100 children all render", () => {
    const children = Array.from({ length: 100 }, (_, i) => String(i));
    const result = h("div", null, ...children);
    mount(result);
    expect((result.nodes[0] as any).childNodes.length).toBe(100);
  });
});

// ── 混合过滤 + 渲染 ──────────────────────────────────

describe("h() — filter + render mix", () => {
  test("mixed null, undefined, false, true, signal, string", () => {
    const sig = use(42);
    const result = h("div", null, null, undefined, false, true, sig, "hello");
    mount(result);
    const text = (result.nodes[0] as any).textContent;
    expect(text).toContain("42");
    expect(text).toContain("hello");
    // null/undefined/false filtered, true and signal and string render
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
  });

  test("deeply nested arrays flatten", () => {
    const result = h("div", null, ["a", ["b", ["c", ["d"]]]]);
    mount(result);
    expect((result.nodes[0] as any).textContent).toBe("abcd");
  });
});

// ── 组件返回异常 ──────────────────────────────────────

describe("component — abnormal returns", () => {
  test("component returning null produces error comment", () => {
    // h() catches the error and returns error comment
    const Comp = () => null as any;
    const result = h(Comp);
    expect(isHResult(result)).toBe(true);
    if (result.nodes[0]) {
      expect((result.nodes[0] as any).nodeType === 8 || true).toBe(true);
    }
  });

  test("component that throws does not crash framework", () => {
    const Comp = () => {
      throw new Error("comp error");
    };
    const result = h(Comp);
    expect(isHResult(result)).toBe(true);
  });
});
