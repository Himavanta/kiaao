// @vitest-environment happy-dom
// kiaao — HResult type tests

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { createOwner } from "../../src/core/owner.ts";
import { HRESULT_SYMBOL, createHResult, isHResult } from "../../src/core/types.ts";
import { browserAdapter } from "../../src/dom/adapter.ts";

setAdapter(browserAdapter);

describe("HResult", () => {
  test("createHResult returns object with HRESULT_SYMBOL", () => {
    const owner = createOwner();
    const nodes = [document.createElement("div")];
    const result = createHResult({ owner, nodes });
    expect(result[HRESULT_SYMBOL]).toBe(true);
    expect(result.owner).toBe(owner);
    expect(result.nodes).toBe(nodes);
    expect(result.cleanups).toEqual([]);
  });

  test("createHResult with cleanups", () => {
    const owner = createOwner();
    const nodes = [document.createElement("span")];
    const cleanups = [() => {}];
    const result = createHResult({ owner, nodes, cleanups });
    expect(result.cleanups).toBe(cleanups);
    expect(result.cleanups!.length).toBe(1);
  });

  test("createHResult with empty cleanups defaults to empty array", () => {
    const result = createHResult({ owner: null, nodes: [document.createElement("div")] });
    expect(result.cleanups).toEqual([]);
  });

  test("createHResult with null owner", () => {
    const result = createHResult({ owner: null, nodes: [document.createElement("p")] });
    expect(result.owner).toBeNull();
  });

  test("isHResult returns true for HResult", () => {
    const result = createHResult({ owner: null, nodes: [] });
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
