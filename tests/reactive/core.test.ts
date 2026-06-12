// kiaao v4 — Reactive core tests
// Platform-agnostic: No DOM environment needed.

import { expect, test, describe } from "vite-plus/test";
import { use, isUse, toValue, setRenderMode, getRenderMode } from "../../src/reactive/core.ts";
import { REACTIVE } from "../../src/reactive/types.ts";

// ── Helpers ───────────────────────────────────────────

/**
 * 收集一个信号在多次 setter 调用过程中其依赖被通知的次数。
 * 通过创建一个派生信号来间接检测。
 */
function trackNotifications(signal: ReturnType<typeof use>[0]): { count: number } {
  const result = { count: 0 };
  use(signal, () => {
    signal();
    result.count++;
  });
  return result;
}

// ── use: Definition Mode ──────────────────────────────

describe("use — definition mode", () => {
  test("create signal with initial value", () => {
    const [count] = use(42);
    expect(count()).toBe(42);
  });

  test("setter updates value with direct new value", () => {
    const [count, setCount] = use(0);
    setCount(10);
    expect(count()).toBe(10);
  });

  test("setter accepts updater function", () => {
    const [count, setCount] = use(0);
    setCount((prev) => prev + 1);
    expect(count()).toBe(1);
  });

  test("setter returns the new value", () => {
    const [_, setCount] = use(0);
    const ret = setCount(5);
    expect(ret).toBe(5);
  });

  test("setter with updater returns the new value", () => {
    const [_, setCount] = use(0);
    const ret = setCount((prev) => prev + 2);
    expect(ret).toBe(2);
  });

  test("setter with same value does not trigger re-computation", () => {
    const [count, setCount] = use(42);
    const tracker = trackNotifications(count);
    expect(tracker.count).toBe(1); // initial effect run

    setCount(42); // same value
    expect(tracker.count).toBe(1); // should NOT re-run
  });

  test("setter with different value triggers re-computation", () => {
    const [count, setCount] = use(0);
    const tracker = trackNotifications(count);
    expect(tracker.count).toBe(1);

    setCount(1);
    expect(tracker.count).toBe(2);
  });

  test("multiple setter calls trigger multiple re-computations", () => {
    const [count, setCount] = use(0);
    const tracker = trackNotifications(count);

    setCount(1);
    setCount(2);
    setCount(3);
    expect(tracker.count).toBe(4); // initial + 3 updates
  });

  test("signal with object value", () => {
    const [user, setUser] = use({ name: "tom", age: 18 });
    expect(user()).toEqual({ name: "tom", age: 18 });

    setUser((prev) => ({ ...prev, age: 19 }));
    expect(user()).toEqual({ name: "tom", age: 19 });
  });

  test("signal with array value", () => {
    const [items, setItems] = use([1, 2, 3]);
    expect(items()).toEqual([1, 2, 3]);

    setItems([4, 5]);
    expect(items()).toEqual([4, 5]);
  });

  test("signal with function as value", () => {
    const fn = () => 42;
    const [getFn] = use(fn);
    expect(getFn()).toBe(fn);
    expect(getFn()()).toBe(42);
  });

  test("signal with null initial value", () => {
    const [val] = use(null);
    expect(val()).toBeNull();
  });

  test("signal with undefined initial value", () => {
    const [val] = use(undefined);
    expect(val()).toBeUndefined();
  });

  test("signal REACTIVE state structure", () => {
    const [count, setCount] = use(10);
    const state = (count as any)[REACTIVE];

    expect(state).toBeDefined();
    expect(typeof state.value).toBe("number");
    expect(state.value).toBe(10);
    expect(state.subs).toBeInstanceOf(Set);
    expect(typeof state.set).toBe("function");
    expect(state.set).toBe(setCount);
  });
});

// ── use: Derivation Mode ─────────────────────────────

describe("use — derivation mode", () => {
  test("compute derived value at creation", () => {
    const [count] = use(5);
    const [double] = use(count, () => count() * 2);
    expect(double()).toBe(10);
  });

  test("recomputes when upstream changes", () => {
    const [count, setCount] = use(3);
    const [double] = use(count, () => count() * 2);
    expect(double()).toBe(6);

    setCount(4);
    expect(double()).toBe(8);
  });

  test("does NOT propagate when result is same (===)", () => {
    const [count, setCount] = use(5);
    const [isBig] = use(count, () => count() >= 3);
    const downstream = trackNotifications(isBig);

    // Initial: isBig = true, downstream notified once
    expect(downstream.count).toBe(1);

    setCount(10); // 10 >= 3 → true, same as before
    expect(downstream.count).toBe(1); // should NOT be notified again

    setCount(0); // 0 >= 3 → false, different
    expect(downstream.count).toBe(2);
  });

  test("setter triggers recomputation with provided value", () => {
    const [base] = use(10);
    const [result, setResult] = use(base, (v: number | undefined) => {
      const multiplier = v ?? 2;
      return base() * multiplier;
    });

    expect(result()).toBe(20); // initial: 10 * 2

    setResult(3);
    expect(result()).toBe(30); // 10 * 3
  });

  test("setter with value that produces same result is short-circuited", () => {
    const [base] = use(10);
    const [result, setResult] = use(base, (v: number | undefined) => {
      return v ?? base();
    });

    expect(result()).toBe(10); // initial: undefined → base() = 10

    const tracker = trackNotifications(result);
    setResult(10); // v = 10 → returns 10, same as cached
    expect(tracker.count).toBe(1); // NOT notified
  });

  test("multiple upstream dependencies", () => {
    const [a, setA] = use(1);
    const [b, setB] = use(2);
    const [sum] = use(a, b, () => a() + b());

    expect(sum()).toBe(3);

    setA(10);
    expect(sum()).toBe(12);

    setB(20);
    expect(sum()).toBe(30);
  });

  test("nested derivations (chain)", () => {
    const [count, setCount] = use(2);
    const [double] = use(count, () => count() * 2);
    const [quadruple] = use(double, () => double() * 2);

    expect(quadruple()).toBe(8);

    setCount(3);
    expect(double()).toBe(6);
    expect(quadruple()).toBe(12);
  });

  test("derivation can depend on another derivation", () => {
    const [a, setA] = use(1);
    const [b] = use(a, () => a() + 1);
    const [c] = use(b, () => b() + 1);

    expect(c()).toBe(3); // a=1 → b=2 → c=3

    setA(5);
    expect(b()).toBe(6); // a=5 → b=6
    expect(c()).toBe(7); // b=6 → c=7
  });

  test("derivation getter returns current cached value without re-computation", () => {
    const [count] = use(5);
    let computeCalls = 0;
    const [double] = use(count, () => {
      computeCalls++;
      return count() * 2;
    });

    expect(computeCalls).toBe(1); // initial
    expect(double()).toBe(10);
    expect(double()).toBe(10); // no extra call
    expect(computeCalls).toBe(1);
  });

  test("create with undefined-returning computeFn (aka 'effect')", () => {
    let sideEffect = 0;
    const [count, setCount] = use(0);
    use(count, () => {
      sideEffect++;
    });

    expect(sideEffect).toBe(1);

    setCount(1);
    expect(sideEffect).toBe(2);
  });

  test("derivation REACTIVE state contains setter and stop", () => {
    const [count] = use(5);
    const [double] = use(count, () => count() * 2);

    const state = (double as any)[REACTIVE];
    expect(state).toBeDefined();
    expect(typeof state.cachedValue).toBe("number");
    expect(state.deps).toBeInstanceOf(Set);
    expect(state.subs).toBeInstanceOf(Set);
    expect(typeof state.computeFn).toBe("function");
    expect(typeof state.set).toBe("function");
    expect(typeof state.stop).toBe("function");
  });
});

// ── isUse ─────────────────────────────────────────────

describe("isUse", () => {
  test("returns true for definition signal getter", () => {
    const [count] = use(0);
    expect(isUse(count)).toBe(true);
  });

  test("returns true for derivation signal getter", () => {
    const [count] = use(0);
    const [double] = use(count, () => count() * 2);
    expect(isUse(double)).toBe(true);
  });

  test("returns false for plain function", () => {
    const fn = () => 42;
    expect(isUse(fn)).toBe(false);
  });

  test("returns false for number", () => {
    expect(isUse(42)).toBe(false);
  });

  test("returns false for string", () => {
    expect(isUse("hello")).toBe(false);
  });

  test("returns false for object", () => {
    expect(isUse({})).toBe(false);
  });

  test("returns false for null", () => {
    expect(isUse(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isUse(undefined)).toBe(false);
  });

  test("returns false for boolean", () => {
    expect(isUse(true)).toBe(false);
    expect(isUse(false)).toBe(false);
  });

  test("returns false for array", () => {
    expect(isUse([1, 2, 3])).toBe(false);
  });
});

// ── use ─────────────────────────────────────────────

describe("use", () => {
  test("non-signal value creates a new signal", () => {
    const [val, setVal] = use(42);
    expect(val()).toBe(42);
    expect(isUse(val)).toBe(true);

    setVal(100);
    expect(val()).toBe(100);
  });

  test("existing definition signal returns same getter and its setter", () => {
    const [count, setCount] = use(0);
    const [val, setVal] = use(count);

    expect(val).toBe(count); // same getter
    expect(setVal).toBe(setCount); // same setter

    setVal(10);
    expect(count()).toBe(10);
    expect(val()).toBe(10);
  });

  test("existing derivation signal returns same getter and its setter", () => {
    const [count] = use(5);
    const [double, setDouble] = use(count, () => count() * 2);
    const [val, setVal] = use(double);

    expect(val).toBe(double);
    expect(setVal).toBe(setDouble);
  });

  test("string value creates signal", () => {
    const [val, setVal] = use("hello");
    expect(val()).toBe("hello");
    setVal("world");
    expect(val()).toBe("world");
  });

  test("object value creates signal", () => {
    const obj = { a: 1 };
    const [val] = use(obj);
    expect(val()).toBe(obj);
  });
});

// ── toValue ─────────────────────────────────────────────

describe("toValue", () => {
  test("signal returns its current value", () => {
    const [count] = use(42);
    expect(toValue(count)).toBe(42);
  });

  test("derivation returns its current cached value", () => {
    const [count] = use(5);
    const [double] = use(count, () => count() * 2);
    expect(toValue(double)).toBe(10);
  });

  test("non-signal value is returned as-is", () => {
    expect(toValue(42)).toBe(42);
    expect(toValue("hello")).toBe("hello");
    expect(toValue(null)).toBeNull();
    expect(toValue(undefined)).toBeUndefined();
    expect(toValue(true)).toBe(true);
    const obj = { a: 1 };
    expect(toValue(obj)).toBe(obj);
  });

  test("does not unwrap function values from signals", () => {
    const fn = () => 42;
    const [getFn] = use(fn);
    const result = toValue(getFn);
    expect(result).toBe(fn); // function itself, not its return value
    expect(result()).toBe(42);
  });
});

// ── Render Mode ───────────────────────────────────────

describe("render mode", () => {
  test("default mode is dom", () => {
    expect(getRenderMode()).toBe("dom");
  });

  test("setRenderMode updates mode", () => {
    setRenderMode("ssr");
    expect(getRenderMode()).toBe("ssr");

    setRenderMode("hydrate");
    expect(getRenderMode()).toBe("hydrate");

    setRenderMode("dom");
    expect(getRenderMode()).toBe("dom");
  });

  test("SSR mode: derivation does one-time computation and is non-reactive", () => {
    setRenderMode("ssr");
    const [count, setCount] = use(0);
    const [double] = use(count, () => count() * 2);

    expect(double()).toBe(0);

    setCount(5);
    expect(double()).toBe(0); // not updated — one-time
    setRenderMode("dom");
  });
});

// ── Edge Cases ────────────────────────────────────────

describe("edge cases", () => {
  test("derivation with zero valid dependencies filters and warns", () => {
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warns.push(msg);

    const [val] = use(42 as any, () => 99);

    console.warn = origWarn;

    // Should have warned about non-signal deps
    expect(warns.length).toBeGreaterThan(0);
    expect(warns.some((w) => w.includes("dependencies must be signals"))).toBe(true);
    // Still works — computes once
    expect(val()).toBe(99);
  });

  test("derivation setter return value is the cached value", () => {
    const [count] = use(10);
    const [_double, setDouble] = use(count, (v: number | undefined) => {
      return (v ?? 1) * count();
    });

    const ret = setDouble(3);
    expect(ret).toBe(30);
  });

  test("derivation chain with setter on middle node", () => {
    const [base, setBase] = use(1);
    const [mid, setMid] = use(base, (v: number | undefined) => v ?? base());
    const [final] = use(mid, () => mid() + 1);

    expect(final()).toBe(2);

    setMid(10);
    expect(mid()).toBe(10);
    expect(final()).toBe(11);

    setBase(5);
    expect(mid()).toBe(5);
    expect(final()).toBe(6);
  });

  test("use with non-signal followed by signal returns correct setter", () => {
    // use(42) creates a signal, then use on it returns same setter
    const [v1, s1] = use(42);
    const [v2, s2] = use(v1);

    expect(v1).toBe(v2);
    expect(s1).toBe(s2);
  });

  test("isUse returns false after getter is garbage-collected (conceptual)", () => {
    // This test verifies that isUse depends on the REACTIVE marker,
    // not on some global registry
    const [count] = use(0);
    expect(isUse(count)).toBe(true);

    // Remove the marker manually to simulate corruption
    delete (count as any)[REACTIVE];
    expect(isUse(count)).toBe(false);
  });
});
