// kiaao — Signal system tests (Signal<T> API)

import { describe, expect, test } from "vite-plus/test";

import { setAdapter, setRenderMode } from "../../src/adapter/index.ts";
import { isUse, toValue, use } from "../../src/core/signal.ts";
import { REACTIVE } from "../../src/core/types.ts";
import { browserAdapter } from "../../src/dom/index.ts";
import { ssrAdapter } from "../../src/server/adapter.ts";

setAdapter(browserAdapter);

// ── Helpers ───────────────────────────────────────────
describe("use — definition mode", () => {
  test("creates a writable signal", () => {
    const count = use(0);
    expect(count()).toBe(0);
    count(5);
    expect(count()).toBe(5);
  });

  test("supports updater function", () => {
    const count = use(0);
    count(count() + 1);
    expect(count()).toBe(1);
  });

  test("supports objects as values", () => {
    const state = use({ a: 1 });
    state({ a: 2 });
    expect(state()).toEqual({ a: 2 });
  });

  test("stores function as value (does not call it)", () => {
    const fn = () => 42;
    const sig = use(fn);
    expect(typeof sig()).toBe("function");
  });

  test("signals are referentially stable", () => {
    const a = use(0);
    const b = use(0);
    expect(a).not.toBe(b);
    const a2 = use(a);
    expect(a2).toBe(a);
  });

  test("deep nested derivation chain", () => {
    const a = use(1);
    const b = use(a, () => a() * 2);
    const c = use(b, () => b() + 3);
    const d = use(c, () => c() * 4);
    const e = use(d, () => d() + 5);
    const f = use(e, () => e() * 6);
    const g = use(f, () => f() + 7);
    const h = use(g, () => g() * 8);
    const i = use(h, () => h() + 9);
    const j = use(i, () => i() * 10);

    const expected = ((((1 * 2 + 3) * 4 + 5) * 6 + 7) * 8 + 9) * 10;
    expect(j()).toBe(expected);

    a(2);
    const expected2 = ((((2 * 2 + 3) * 4 + 5) * 6 + 7) * 8 + 9) * 10;
    expect(j()).toBe(expected2);
  });
});

describe("use — derivation mode", () => {
  test("basic derivation", () => {
    const count = use(0);
    const double = use(count, () => count() * 2);
    expect(double()).toBe(0);
    count(5);
    expect(double()).toBe(10);
  });

  test("setter triggers recomputation", () => {
    const count = use(0);
    const double = use(count, () => count() * 2);

    count(10);
    expect(double()).toBe(20);

    count(3);
    expect(double()).toBe(6);
  });

  test("derivation with setter parameter", () => {
    const count = use(0);
    const withDefault = use(count, () => count());
    expect(withDefault()).toBe(0);

    count(10);
    expect(withDefault()).toBe(10);
  });

  test("short-circuit on equal value", () => {
    const count = use(0);
    let recomputeCount = 0;
    use(count, (v: number) => {
      recomputeCount++;
      return v * 2;
    });
    recomputeCount = 0;

    count(0); // same value, no recompute
    expect(recomputeCount).toBe(0);
  });

  test("derivation updates can be chained", () => {
    const a = use(1);
    const b = use(a, () => a() * 2);
    const c = use(b, () => b() + 3);
    expect(c()).toBe(5);

    a(5);
    expect(b()).toBe(10);
    expect(c()).toBe(13);
  });
});

describe("isUse", () => {
  test("returns true for definition signal", () => {
    const sig = use(0);
    expect(isUse(sig)).toBe(true);
  });

  test("returns true for derivation signal", () => {
    const count = use(0);
    const double = use(count, () => count() * 2);
    expect(isUse(double)).toBe(true);
  });

  test("returns false for plain function", () => {
    expect(isUse(() => {})).toBe(false);
  });

  test("returns false for plain object", () => {
    expect(isUse({})).toBe(false);
  });

  test("returns false for null", () => {
    expect(isUse(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isUse(undefined)).toBe(false);
  });
});

describe("toValue", () => {
  test("unwraps signal", () => {
    const sig = use(42);
    expect(toValue(sig)).toBe(42);
  });

  test("passes through non-signal", () => {
    expect(toValue(42)).toBe(42);
    expect(toValue("hello")).toBe("hello");
    expect(toValue(null)).toBe(null);
  });
});

describe("RenderMode", () => {
  test("derivation in SSR mode computes once", () => {
    setAdapter(ssrAdapter);
    setRenderMode("ssr");
    const count = use(0);
    const double = use(count, () => count() * 2);
    expect(double()).toBe(0);
    count(5);
    // In SSR mode, createStaticDerived skips dependency tracking
    expect(double()).toBe(0);
    setRenderMode("dom");
    setAdapter(browserAdapter);
  });
});

describe("REACTIVE symbol", () => {
  test("is attached to signal", () => {
    const count = use(0);
    expect((count as any)[REACTIVE]).toBeDefined();
    expect((count as any)[REACTIVE].value).toBe(0);
  });
});
