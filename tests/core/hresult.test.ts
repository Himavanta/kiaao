// @vitest-environment happy-dom
// kiaao — HResult type + processChildren result tests

import { expect, test, describe } from "vite-plus/test";
import { HRESULT_SYMBOL, createHResult, isHResult } from "../../src/core/types.ts";
import { processChildren } from "../../src/core/process-children.ts";
import { setAdapter } from "../../src/core/types.ts";
import { browserAdapter } from "../../src/dom/adapter.ts";
import { use } from "../../src/core/signal.ts";
import { createOwner } from "../../src/core/owner.ts";

setAdapter(browserAdapter);

// ── HResult ──────────────────────────────────────────────

describe("HResult", () => {
  test("createHResult returns object with HRESULT_SYMBOL", () => {
    const owner = createOwner();
    const nodes = [document.createElement("div")];
    const result = createHResult(owner, nodes);
    expect(result[HRESULT_SYMBOL]).toBe(true);
    expect(result.owner).toBe(owner);
    expect(result.nodes).toBe(nodes);
    expect(result.cleanups).toBeUndefined();
  });

  test("createHResult with cleanups", () => {
    const owner = createOwner();
    const nodes = [document.createElement("span")];
    const cleanups = [() => {}];
    const result = createHResult(owner, nodes, cleanups);
    expect(result.cleanups).toBe(cleanups);
    expect(result.cleanups!.length).toBe(1);
  });

  test("createHResult with empty cleanups omits the field", () => {
    const result = createHResult(null, [document.createElement("div")], []);
    expect(result.cleanups).toBeUndefined();
  });

  test("createHResult with null owner", () => {
    const result = createHResult(null, [document.createElement("p")]);
    expect(result.owner).toBeNull();
  });

  test("isHResult returns true for HResult", () => {
    const result = createHResult(null, []);
    expect(isHResult(result)).toBe(true);
  });

  test("isHResult returns false for plain object", () => {
    expect(isHResult({})).toBe(false);
  });

  test("isHResult returns false for null", () => {
    expect(isHResult(null)).toBe(false);
  });

  test("isHResult returns false for undefined", () => {
    expect(isHResult(undefined)).toBe(false);
  });

  test("isHResult returns false for Node", () => {
    expect(isHResult(document.createElement("div"))).toBe(false);
  });

  test("isHResult returns false for array", () => {
    expect(isHResult([document.createElement("div")])).toBe(false);
  });
});

// ── processChildren Result ─────────────────────────────

describe("processChildren — result format", () => {
  test("returns ProcessChildrenResult with nodes and cleanups", () => {
    const result = processChildren([]);
    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("cleanups");
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.cleanups)).toBe(true);
  });

  test("empty input returns empty arrays", () => {
    const result = processChildren([]);
    expect(result.nodes).toEqual([]);
    expect(result.cleanups).toEqual([]);
  });

  test("static text produces nodes but no cleanups", () => {
    const result = processChildren(["hello"]);
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].textContent).toBe("hello");
    expect(result.cleanups).toEqual([]);
  });

  test("multiple static strings produce multiple nodes", () => {
    const result = processChildren(["a", "b", "c"]);
    expect(result.nodes.length).toBe(3);
    expect(result.cleanups).toEqual([]);
  });

  test("signal binding produces node + cleanup", () => {
    const count = use(42);
    const result = processChildren([count]);
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].textContent).toBe("42");
    expect(result.cleanups.length).toBe(1);
    expect(typeof result.cleanups[0]).toBe("function");
  });

  test("mixed static and signal children", () => {
    const count = use(0);
    const result = processChildren(["prefix", count, "suffix"]);
    expect(result.nodes.length).toBe(3);
    expect(result.cleanups.length).toBe(1);
  });

  test("nested arrays are flattened", () => {
    const count = use(0);
    const result = processChildren(["a", ["b", [count]], "c"]);
    expect(result.nodes.length).toBe(4);
    expect(result.nodes.map((n) => n.textContent)).toEqual(["a", "b", "0", "c"]);
    expect(result.cleanups.length).toBe(1);
  });

  test("null and boolean are skipped", () => {
    const result = processChildren([null, false, true, "ok"]);
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].textContent).toBe("ok");
    expect(result.cleanups).toEqual([]);
  });

  test("Node children are passed through", () => {
    const span = document.createElement("span");
    const result = processChildren([span]);
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]).toBe(span);
  });

  test("HResult child extracts nodes and cleanups", () => {
    const hresult = createHResult(null, [document.createElement("hr")], [() => {}]);
    const result = processChildren([hresult]);
    expect(result.nodes.length).toBe(1);
    expect((result.nodes[0] as HTMLElement).tagName).toBe("HR");
    expect(result.cleanups.length).toBe(1);
  });

  test("mixed node, signal, string, HResult", () => {
    const signal = use(0);
    const span = document.createElement("span");
    const hr = createHResult(null, [document.createElement("hr")]);
    const result = processChildren([span, signal, "text", hr]);
    expect(result.nodes.length).toBe(4);
    expect(result.cleanups.length).toBe(1);
  });
});

// ── SSR Node passthrough ──────────────────────────────

describe("processChildren — SSR node passthrough", () => {
  test("passes through SSR node objects", () => {
    const ssrNode = { type: "element", tag: "div", attrs: {}, children: [] };
    const result = processChildren([ssrNode]);
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]).toBe(ssrNode);
    expect(result.cleanups).toEqual([]);
  });
});
