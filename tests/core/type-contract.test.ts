// @vitest-environment happy-dom
// kiaao — TypeScript 类型合约测试（编译期检查）
// 验证核心类型能正确推导和约束

import { expect, test } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);
import type { HResult } from "../../src/core/index.ts";
import { use, type Signal } from "../../src/core/index.ts";

test("type contract — compile check", () => {
  // ── h() 泛型推导 ─────────────────────────────────
  function CompWithProps(props: { name: string; age: number }) {
    return h("div", null, props.name, String(props.age));
  }
  void h(CompWithProps, { name: "test", age: 25 });

  // ── 组件返回值 ───────────────────────────────────
  function CompA(_p: any, _ctx: any) {
    return h("div");
  }
  const _t: HResult = h(CompA);
  void _t;

  // ── 普通元素 ─────────────────────────────────────
  void h("div");
  void h("span", { id: "test" }, "text");
  void h("div", null, "a", "b", "c");
  void h("div", null);
  void h("div", undefined);

  // ── 信号类型 ─────────────────────────────────────
  const sig: Signal<number> = use(0);
  void sig();
  sig(42);
  sig((prev) => prev + 1);

  expect(true).toBe(true);
});
