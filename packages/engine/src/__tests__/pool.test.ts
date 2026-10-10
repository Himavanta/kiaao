// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 实体池的契约
//
// `createPool` 是 `createPool` / `createActorSystem` 两者共同的基础，但此前
// **没有任何测试**（2026-10-08 发现）。它的坑是静默的：
//
// - 装载/卸载不配对 ⇒ `Set<EntityId>` 无界增长（内存泄漏）。
//   **行为上看不出来**：卸载时 `gamePool` 也删了实体，`frame(id)` 返回
//   `undefined`，`?.` 会静默跳过。所以断言「方法不再被调」抓不到它——
//   必须直接观察遍历。
// - 两个池共享同一个 `Set` ⇒ A 系统的实体被 B 系统处理（串池）。
//
// 这些用「副作用次数」断言不可靠，用「遍历到了哪些 id」才直接。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context } from "kiaao";
import { use } from "kiaao";
import { describe, expect, test } from "vite-plus/test";

import { createPool } from "../pool.ts";

/** 最小组件 ctx：onMount / onUnmount 收集回调，供测试手动触发 */
function createTestContext() {
  const mounts: Array<() => void> = [];
  const unmounts: Array<() => void> = [];
  const ctx = {
    use,
    onMount: (fn: () => void) => mounts.push(fn),
    onUnmount: (fn: () => void) => unmounts.push(fn),
    owner: {},
  } as unknown as Context;
  return { ctx, mounts, unmounts };
}

describe("createPool / 池的归属", () => {
  test("两次调用得到两个独立的池与 enter", () => {
    const [poolA, enterA] = createPool();
    const [poolB, enterB] = createPool();

    expect(poolA).not.toBe(poolB);
    expect(enterA).not.toBe(enterB);
  });

  test("只进登记过的池，不进另一个（不串池）", () => {
    const [poolA, enterA] = createPool();
    const [poolB] = createPool();
    const { ctx, mounts } = createTestContext();

    const id = Symbol();
    enterA(id, ctx, {});
    mounts.forEach((fn) => fn());

    expect(poolA.has(id)).toBe(true);
    expect(poolB.has(id)).toBe(false);
  });
});

describe("createPool / 生命周期配对", () => {
  test("装载后进池，卸载后出池（直接观察遍历）", () => {
    const [pool, enter] = createPool();
    const { ctx, mounts, unmounts } = createTestContext();
    const id = Symbol();

    enter(id, ctx, {});
    mounts.forEach((fn) => fn());
    expect(pool.has(id)).toBe(true);

    unmounts.forEach((fn) => fn());
    expect(pool.has(id)).toBe(false);
  });

  test("重复卸载幂等：不抛错，池保持干净", () => {
    const [pool, enter] = createPool();
    const { ctx, mounts, unmounts } = createTestContext();
    const id = Symbol();

    enter(id, ctx, {});
    mounts.forEach((fn) => fn());

    unmounts.forEach((fn) => fn());
    expect(() => unmounts.forEach((fn) => fn())).not.toThrow();
    expect(pool.has(id)).toBe(false);
  });

  test("update 遍历到的正是装载的那些 id（用记录的帧管理器）", () => {
    const [pool, enter] = createPool();
    const { ctx, mounts, unmounts } = createTestContext();

    const a = Symbol();
    const b = Symbol();
    enter(a, ctx, {});
    enter(b, ctx, {});
    mounts.forEach((fn) => fn());

    // 池的契约：`for (const id of pool)` 遍历到装载的 id。
    // 这里直接读 Set 顺序（插入序）——比套一层 update 更直接。
    expect([...pool]).toEqual([a, b]);

    unmounts.forEach((fn) => fn());
    expect([...pool]).toEqual([]);
  });
});
