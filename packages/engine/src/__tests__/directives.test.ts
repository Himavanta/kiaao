// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StyleMemo：style 属性级细粒度更新
//
// 这组用例的由来：saboteur 迁移到本包的 StyleMemo 时，发现它**没有**
// 实现自己文档里写的「null/undefined 时清除该属性」——
//
//   (style as any)[key] = v;          // 写 null 不生效
//
// 实测：`style.left = null` 静默忽略（保留旧值），`style.zIndex = null`
// 则会把字面量写进去（`z-index: null;`）。而 saboteur 自己的版本写的是
// `v ?? ""`，是真的清除。替换后就变成了行为回退。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use, type Signal } from "kiaao";
import { describe, expect, test } from "vite-plus/test";

import { StyleMemo } from "../directives.ts";

/** 建一个被 StyleMemo 包裹的元素，返回包裹元素（指令作用于它） */
function mountStyleMemo(value: Record<string, unknown>) {
  const host = document.createElement("div");
  const target = document.createElement("div");
  host.appendChild(target);

  // direct 指令形如 (el, props, ctx)，此处直接调用其核心逻辑：
  // 需要 ctx.use 才能建立订阅（生命周期钩子本用例用不到，补空实现）
  StyleMemo(
    target as never,
    { value } as never,
    {
      use: use as never,
      onMount: () => {},
      onUnmount: () => {},
    } as never,
  );

  document.body.appendChild(target);
  return target as HTMLElement;
}

describe("StyleMemo", () => {
  test("静态值在挂载时写入", () => {
    const el = mountStyleMemo({ left: "5px", zIndex: 3 });
    expect(el.style.left).toBe("5px");
    expect(el.style.zIndex).toBe("3");
  });

  test("静态 null 不写入", () => {
    const el = mountStyleMemo({ left: null, top: undefined });
    expect(el.style.left).toBe("");
    expect(el.style.top).toBe("");
  });

  test("信号值变化时只更新该属性", () => {
    const left = use("5px");
    const top = use("7px");
    const el = mountStyleMemo({ left, top });

    expect(el.style.left).toBe("5px");
    expect(el.style.top).toBe("7px");

    left("9px");
    expect(el.style.left).toBe("9px");
    // 未变化的属性不被触碰
    expect(el.style.top).toBe("7px");
  });

  test("信号置 null 会清除该属性（而不是保留旧值）", () => {
    const left = use<unknown>("5px");
    const zIndex = use<unknown>("3");
    const el = mountStyleMemo({ left, zIndex });

    expect(el.style.left).toBe("5px");
    expect(el.style.zIndex).toBe("3");

    (left as Signal<unknown>)(null);
    (zIndex as Signal<unknown>)(null);

    // 直接写 null 的话：left 会保留 "5px"、zIndex 会变成 "null"
    expect(el.style.left).toBe("");
    expect(el.style.zIndex).toBe("");
  });

  test("信号置 undefined 也会清除", () => {
    const left = use<unknown>("5px");
    const el = mountStyleMemo({ left });

    (left as Signal<unknown>)(undefined);
    expect(el.style.left).toBe("");
  });

  test("数值 0 不被当作空值清除", () => {
    const zIndex = use<number | string>(5);
    const el = mountStyleMemo({ zIndex });

    zIndex(0);
    expect(el.style.zIndex).toBe("0");
  });
});
