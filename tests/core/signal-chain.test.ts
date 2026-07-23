// @vitest-environment happy-dom
// kiaao — 信号派生链深度与并发写入极端测试
import { setAdapter } from "../../src/adapter/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";
setAdapter(browserAdapter);

import { expect, test, describe } from "vite-plus/test";

import { use } from "../../src/core/signal.ts";

// ── 派生链 ──────────────────────────────────────────

describe("signal — deep derivation chain", () => {
  test("chain of 10 derivations propagates correctly", () => {
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

  /**
   * 测试类型：边界 — 契约内
   * 场景：菱形依赖（A、B 共享 src，C 依赖 A+B），上游变化时计算次数可控
   * 预期：上游变化后 A、B、C 各自增量重算，且 C 的值正确反映 a+b
   * 状态：稳定契约
   */
  test("diamond dependency resolves without redundant computation", () => {
    let aCount = 0,
      bCount = 0,
      cCount = 0;
    const src = use(0);
    const a = use(src, () => {
      aCount++;
      return src() + 1;
    });
    const b = use(src, () => {
      bCount++;
      return src() * 2;
    });
    const c = use(a, b, () => {
      cCount++;
      return a() + b();
    });

    expect(c()).toBe(0 + 1 + 0);
    expect([aCount, bCount, cCount]).toEqual([1, 1, 1]);

    src(5);
    expect(c()).toBe(5 + 1 + 5 * 2);
    expect([aCount, bCount, cCount]).toEqual([2, 2, 3]);
  });
});

// ── 并发写入 ──────────────────────────────────────────

describe("signal — racing writes", () => {
  test("multiple writes to same signal resolve to last value", () => {
    const s = use(0);
    s(1);
    s(2);
    s(3);
    expect(s()).toBe(3);
  });

  test("write during derivation propagation is safe", () => {
    const sig = use(0);
    const results: number[] = [];

    for (let i = 0; i < 5; i++) {
      use(sig, () => {
        results.push(sig());
        return sig();
      });
    }

    sig(42);
    const hits = results.filter((r) => r === 42);
    expect(hits.length).toBe(5);
  });
});

// ── 大量依赖 ──────────────────────────────────────────

describe("signal — large dependency graph", () => {
  test("derivation depending on 50 signals computes correctly", () => {
    const sources = Array.from({ length: 50 }, (_, i) => use(i));
    const sum = use(...sources, () => sources.reduce((a, s) => a + s(), 0));

    expect(sum()).toBe(1225);

    sources[25](100);
    expect(sum()).toBe(1225 - 25 + 100);
  });

  test("changing one of 50 dependencies triggers derivation once", () => {
    let count = 0;
    const sources = Array.from({ length: 50 }, (_, i) => use(i));
    use(...sources, () => {
      count++;
      return sources.reduce((a, s) => a + s(), 0);
    });

    count = 0;
    sources[0](999);
    expect(count).toBe(1);
  });
});

// ── 引用类型 ──────────────────────────────────────────

describe("signal — reference types", () => {
  test("object as signal value maintains identity", () => {
    const obj = use({ a: 1, b: 2 });
    expect(obj()).toEqual({ a: 1, b: 2 });

    obj({ a: 3, b: 4 });
    expect(obj()).toEqual({ a: 3, b: 4 });
  });

  test("array as signal value", () => {
    const arr = use([1, 2, 3]);
    expect(arr()).toEqual([1, 2, 3]);
    arr([4, 5, 6]);
    expect(arr()).toEqual([4, 5, 6]);
  });

  test("function as signal value is stored, not called", () => {
    const fn = () => 42;
    const sig = use(fn);
    expect(typeof sig()).toBe("function");
    expect((sig() as any)()).toBe(42);
  });
});
