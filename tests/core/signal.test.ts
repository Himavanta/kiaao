// kiaao — Signal system migration tests
// Verifies that src/core/signal.ts is a correct migration from src/reactive/core.ts

import { expect, test, describe } from "vite-plus/test";
import { use, isUse, toValue, setRenderMode, getRenderMode } from "../../src/core/signal.ts";
import { REACTIVE } from "../../src/core/types.ts";

describe("use — definition mode", () => {
  test("creates a writable signal", () => {
    const [count, setCount] = use(0);
    expect(count()).toBe(0);
    setCount(5);
    expect(count()).toBe(5);
  });

  test("supports updater function", () => {
    const [count, setCount] = use(0);
    setCount((p: number) => p + 1);
    expect(count()).toBe(1);
  });

  test("supports objects as values", () => {
    const [user, setUser] = use({ name: "tom" });
    expect(user().name).toBe("tom");
    setUser({ name: "jerry" });
    expect(user().name).toBe("jerry");
  });

  test("stores function as value (does not call it)", () => {
    const fn = () => 42;
    const [fnSignal] = use(fn);
    expect(fnSignal()).toBe(fn);
    expect(fnSignal()()).toBe(42);
  });
});

describe("use — signal referencing", () => {
  test("returns existing signal's [getter, setter]", () => {
    const [count, _setCount] = use(0);
    const [same, sameSet] = use(count);
    expect(same).toBe(count);
    sameSet(10);
    expect(count()).toBe(10);
  });
});

describe("use — derivation mode", () => {
  test("basic derivation", () => {
    const [count, setCount] = use(1);
    const [double] = use(count, () => count() * 2);
    expect(double()).toBe(2);
    setCount(5);
    expect(double()).toBe(10);
  });

  test("setter triggers recomputation", () => {
    const [count, setCount] = use(1);
    const [next, setNext] = use(count, (_v: any) => count() + 1);
    expect(next()).toBe(2);
    setCount(5);
    expect(next()).toBe(6);
    setNext(100);
    expect(next()).toBe(6); // value unchanged → short-circuit
  });

  test("derivation with setter parameter", () => {
    const [base] = use(10);
    const [scaled, setScaled] = use(base, (factor = 2) => base() * factor);
    expect(scaled()).toBe(20);
    setScaled(3);
    expect(scaled()).toBe(30);
  });

  test("short-circuit on equal value", () => {
    const [count] = use(5);
    const [result] = use(count, () => count() - count() + 5);
    expect(result()).toBe(5);
    let callCount = 0;
    use(result, () => {
      callCount++;
    });
    expect(callCount).toBe(1);
  });
});

describe("isUse", () => {
  test("returns true for signal getters", () => {
    const [count] = use(0);
    expect(isUse(count)).toBe(true);
  });

  test("returns true for derivation getters", () => {
    const [count] = use(0);
    const [double] = use(count, () => count() * 2);
    expect(isUse(double)).toBe(true);
  });

  test("returns false for non-signals", () => {
    expect(isUse(null)).toBe(false);
    expect(isUse(undefined)).toBe(false);
    expect(isUse(42)).toBe(false);
    expect(isUse("hello")).toBe(false);
    expect(isUse({})).toBe(false);
    expect(isUse(() => {})).toBe(false);
  });
});

describe("toValue", () => {
  test("unwraps signal to its value", () => {
    const [count] = use(42);
    expect(toValue(count)).toBe(42);
  });

  test("returns non-signal as-is", () => {
    expect(toValue(42)).toBe(42);
    expect(toValue("hello")).toBe("hello");
    expect(toValue(null)).toBe(null);
  });
});

describe("RenderMode", () => {
  test("default mode is dom", () => {
    expect(getRenderMode()).toBe("dom");
  });

  test("setRenderMode changes mode", () => {
    const prev = getRenderMode();
    setRenderMode("ssr");
    expect(getRenderMode()).toBe("ssr");
    setRenderMode(prev);
  });

  test("derivation in SSR mode computes once", () => {
    setRenderMode("ssr");
    const [count, setCount] = use(0);
    const [double] = use(count, () => count() * 2);
    expect(double()).toBe(0);
    setCount(5);
    // In SSR mode, derivations are one-shot - won't update on signal change
    expect(double()).toBe(0);
    setRenderMode("dom");
  });
});

describe("REACTIVE symbol", () => {
  test("is attached to signal getter", () => {
    const [count] = use(0);
    expect((count as any)[REACTIVE]).toBeDefined();
    expect((count as any)[REACTIVE].value).toBe(0);
  });

  test("state contains set function", () => {
    const [count, setCount] = use(0);
    const state = (count as any)[REACTIVE];
    expect(state.set).toBe(setCount);
  });
});
