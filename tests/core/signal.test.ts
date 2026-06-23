// kiaao — Signal system tests (Signal<T> API)

import { expect, test, describe } from "vite-plus/test";
import { use, isUse, toValue, setRenderMode, getRenderMode } from "../../src/core/signal.ts";
import { REACTIVE } from "../../src/core/types.ts";

describe("use — definition mode", () => {
  test("creates a writable signal", () => {
    const count = use(0);
    expect(count()).toBe(0);
    count(5);
    expect(count()).toBe(5);
  });

  test("supports updater function", () => {
    const count = use(0);
    count((p: number) => p + 1);
    expect(count()).toBe(1);
  });

  test("supports objects as values", () => {
    const user = use({ name: "tom" });
    expect(user().name).toBe("tom");
    user({ name: "jerry" });
    expect(user().name).toBe("jerry");
  });

  test("stores function as value (does not call it)", () => {
    const fn = () => 42;
    const fnSignal = use(fn);
    expect(fnSignal()).toBe(fn);
    expect((fnSignal() as unknown as () => number)()).toBe(42);
  });

  test("signal() reads, signal(v) writes", () => {
    const count = use(10);
    expect(count()).toBe(10);
    count(20);
    expect(count()).toBe(20);
    expect(count()).toBe(20); // 再次读取确认
  });

  test("signal(undefined) writes undefined", () => {
    const count = use<number | undefined>(0);
    count(undefined);
    expect(count()).toBeUndefined();
  });
});

describe("use — signal referencing", () => {
  test("use(signal) returns the same signal", () => {
    const count = use(0);
    const same = use(count);
    expect(same).toBe(count);
    same(10);
    expect(count()).toBe(10);
  });
});

describe("use — derivation mode", () => {
  test("basic derivation", () => {
    const count = use(1);
    const double = use(count, () => count() * 2);
    expect(double()).toBe(2);
    count(5);
    expect(double()).toBe(10);
  });

  test("setter triggers recomputation", () => {
    const count = use(1);
    const next = use(count, (_v: any) => count() + 1);
    expect(next()).toBe(2);
    count(5);
    expect(next()).toBe(6);
    next(100);
    expect(next()).toBe(6); // value unchanged → short-circuit
  });

  test("derivation with setter parameter", () => {
    const base = use(10);
    const scaled = use(base, (factor = 2) => base() * factor);
    expect(scaled()).toBe(20);
    scaled(3);
    expect(scaled()).toBe(30);
  });

  test("short-circuit on equal value", () => {
    const count = use(5);
    const result = use(count, () => count() - count() + 5);
    expect(result()).toBe(5);
    let callCount = 0;
    use(result, () => {
      callCount++;
    });
    expect(callCount).toBe(1);
  });
});

describe("isUse", () => {
  test("returns true for signal", () => {
    const count = use(0);
    expect(isUse(count)).toBe(true);
  });

  test("returns true for derivation signal", () => {
    const count = use(0);
    const double = use(count, () => count() * 2);
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
    const count = use(42);
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
    const count = use(0);
    const double = use(count, () => count() * 2);
    expect(double()).toBe(0);
    count(5);
    expect(double()).toBe(0);
    setRenderMode("dom");
  });
});

describe("REACTIVE symbol", () => {
  test("is attached to signal", () => {
    const count = use(0);
    expect((count as any)[REACTIVE]).toBeDefined();
    expect((count as any)[REACTIVE].value).toBe(0);
  });

  test("state contains stop function", () => {
    const count = use(0);
    const state = (count as any)[REACTIVE];
    expect(typeof state.stop).toBe("function");
    expect(state.value).toBe(0);
  });
});
