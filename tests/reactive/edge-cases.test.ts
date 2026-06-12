// @vitest-environment node
// kiaao v4 — Reactive core edge cases & stress tests

import { expect, test, describe } from "vite-plus/test";
import {
  use,
  isUse,
  toUse,
  toValue,
  setRenderMode,
  getRenderMode,
} from "../../src/reactive/core.ts";

// ── Deep Derivation Chain ─────────────────────────────

describe("deep derivation chain", () => {
  test("chain of 10 derivations propagates correctly", () => {
    const [root, setRoot] = use(0);
    let prev = root;

    for (let i = 0; i < 10; i++) {
      // 每次迭代创建新的块级变量，闭包捕获当前值
      const cur = prev;
      const [next] = use(cur, () => cur() + 1);
      prev = next;
    }

    expect(prev()).toBe(10);

    setRoot(5);
    expect(prev()).toBe(15);
  });
});

// ── Circular / Self-referencing ───────────────────────

describe("edge cases — argument handling", () => {
  test("use() with no arguments does not crash", () => {
    // 0 参数 → derivationMode → func 为 undefined → 警告 + 返回 definitionMode(undefined)
    const [val] = (use as any)();
    expect(val()).toBeUndefined();
  });

  test("use with one non-function argument works as definition mode", () => {
    const [val, setVal] = use(42 as any);
    expect(val()).toBe(42);
    setVal(100);
    expect(val()).toBe(100);
  });

  test("derivation mode with non-function last arg falls back", () => {
    const [val] = (use as any)(() => 1, "not-a-function");
    expect(val()).toBeUndefined();
  });

  test("derivation with zero valid deps computes once", () => {
    let callCount = 0;
    const [val] = (use as any)("not-a-signal", () => {
      callCount++;
      return 99;
    });
    // 依赖被过滤掉，但初始计算仍执行一次
    expect(callCount).toBe(1);
    expect(val()).toBe(99);
  });

  test("setter on derivation with zero deps still triggers compute", () => {
    let callCount = 0;
    const [val, setVal] = (use as any)("not-a-signal", () => {
      callCount++;
      return callCount;
    });
    expect(callCount).toBe(1);
    expect(val()).toBe(1);

    setVal(undefined);
    expect(callCount).toBe(2);
    expect(val()).toBe(2);
  });
});

// ── Null / Undefined as signal values ─────────────────

describe("null/undefined signal values", () => {
  test("signal with null initial value", () => {
    const [val] = use(null);
    expect(val()).toBeNull();
  });

  test("signal with undefined initial value", () => {
    const [val] = use(undefined);
    expect(val()).toBeUndefined();
  });

  test("setter with null updates correctly", () => {
    const [val, setVal] = use<number | null>(0);
    setVal(null);
    expect(val()).toBeNull();
  });

  test("derivation resolving to null propagates", () => {
    const [flag, setFlag] = use(true);
    const [val] = use(flag, () => (flag() ? "hello" : null));
    expect(val()).toBe("hello");

    setFlag(false);
    expect(val()).toBeNull();
  });
});

// ── toUse / toValue edge cases ──────────────────────────

describe("toUse / toValue edge cases", () => {
  test("toUse on signal multiple times returns same getter", () => {
    const [count] = use(0);
    const [a] = toUse(count);
    const [b] = toUse(count);
    expect(a).toBe(b);
    expect(a).toBe(count);
  });

  test("toUse on non-signal creates independent copies", () => {
    const [a] = toUse(42);
    const [b] = toUse(42);
    expect(a).not.toBe(b);
    expect(a()).toBe(42);
    expect(b()).toBe(42);
  });

  test("toUse same non-signal value creates different signals", () => {
    const [x] = toUse(10);
    const [y] = toUse(10);
    expect(x).not.toBe(y);
  });

  test("toValue on signal getter returns current value", () => {
    const [count, setCount] = use(42);
    expect(toValue(count)).toBe(42);
    setCount(100);
    expect(toValue(count)).toBe(100);
  });

  test("toValue on non-signal returns as-is", () => {
    expect(toValue(null)).toBeNull();
    expect(toValue(undefined)).toBeUndefined();
    expect(toValue(false)).toBe(false);
    expect(toValue(0)).toBe(0);
    expect(toValue("hello")).toBe("hello");
    const obj = {};
    expect(toValue(obj)).toBe(obj);
  });

  test("toValue on derivation getter returns cached value without recomputing", () => {
    let computeCalls = 0;
    const [count] = use(5);
    const [double] = use(count, () => {
      computeCalls++;
      return count() * 2;
    });

    expect(computeCalls).toBe(1);
    expect(toValue(double)).toBe(10);
    expect(computeCalls).toBe(1); // 不会重新计算
  });
});

// ── isUse edge cases ──────────────────────────────────

describe("isUse edge cases", () => {
  test("isUse on frozen object", () => {
    const frozen = Object.freeze({});
    expect(isUse(frozen)).toBe(false);
  });

  test("isUse on sealed object", () => {
    const sealed = Object.seal({});
    expect(isUse(sealed)).toBe(false);
  });

  test("isUse on proxy", () => {
    const proxy = new Proxy({}, {});
    expect(isUse(proxy)).toBe(false);
  });

  test("isUse on signal with custom property", () => {
    const [count] = use(0);
    expect(isUse(count)).toBe(true);
    // 删除 REACTIVE 标记
    delete (count as any)[Symbol.for("reactive")]; // 不会找到
    expect(isUse(count)).toBe(true); // REACTIVE 是局部 Symbol
  });

  test("isUse on class instance", () => {
    class Foo {}
    expect(isUse(new Foo())).toBe(false);
  });

  test("isUse on function with REACTIVE-like property", () => {
    const fn = () => {};
    (fn as any)[Symbol("reactive")] = true;
    // 不是同一个 Symbol
    expect(isUse(fn)).toBe(false);
  });

  test("isUse on arrow function", () => {
    expect(isUse(() => {})).toBe(false);
  });
});

// ── SSR Mode ──────────────────────────────────────────

describe("SSR mode", () => {
  test("derivation in SSR mode computes once", () => {
    const prev = getRenderMode();

    setRenderMode("ssr");
    const [count, setCount] = use(0);
    const [double] = use(count, () => count() * 2);

    expect(double()).toBe(0);

    setCount(5);
    expect(double()).toBe(0); // 不会更新

    setRenderMode(prev);
  });

  test("SSR mode restores after change", () => {
    const prev = getRenderMode();

    setRenderMode("ssr");
    expect(getRenderMode()).toBe("ssr");

    setRenderMode("dom");
    expect(getRenderMode()).toBe("dom");

    setRenderMode(prev);
  });
});
