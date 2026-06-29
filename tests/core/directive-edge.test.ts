// @vitest-environment happy-dom
// kiaao — 指令极端测试：dispose 后触发、嵌套、异常

import { describe, expect, test } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import {
  direct,
  h,
  isHResult,
  triggerMount,
  type DirectiveContext,
  type HResult,
} from "../../src/core/index.ts";
import { disposeOwner } from "../../src/core/owner.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

/** 包装指令的辅助组件：让指令有 Owner 跟踪 */
function wrap(children: any): HResult {
  const Wrapper = () => children;
  return h(Wrapper);
}

function mount(result: HResult): HTMLElement {
  function Root() {
    return result;
  }
  const rootHr = h(Root as any);
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of rootHr.nodes) {
    browserAdapter.append(container, node as any);
  }
  if (rootHr.owner) triggerMount(rootHr.owner);
  return container;
}

// ── 异常行为 ──────────────────────────────────────────

describe("directive — error handling", () => {
  test("directive that throws does not crash framework", () => {
    const BadDir = direct((_el: any, _props: any, _ctx: any) => {
      throw new Error("directive error");
    });

    const result = wrap(h(BadDir as any, null, h("span", null, "content")));
    expect(() => mount(result)).not.toThrow();
  });

  test("directive with no children does not crash", () => {
    const EmptyDir = direct((_el: any, _props: any, _ctx: any) => {});
    const result = h(EmptyDir as any);
    expect(isHResult(result)).toBe(true);
  });
});

// ── 指令嵌套指令 ──────────────────────────────────────

describe("directive — nested", () => {
  test("directive inside directive renders both", () => {
    const order: string[] = [];
    const Outer = direct((el: any, _p: any, ctx: DirectiveContext) => {
      ctx.onMount(() => {
        order.push("outer");
      });
    });
    const Inner = direct((el: any, _p: any, ctx: DirectiveContext) => {
      ctx.onMount(() => {
        order.push("inner");
      });
    });

    const result = wrap(h(Outer as any, null, h(Inner as any, null, h("span", null, "nested"))));
    mount(result);
    expect(order).toEqual(["outer", "inner"]);
  });
});

// ── 指令在 dispose 后 ─────────────────────────────────

describe("directive — dispose guard", () => {
  test("onMount fires during mount", () => {
    let called = false;
    const TestDir = direct((_el: any, _p: any, ctx: DirectiveContext) => {
      ctx.onMount(() => {
        called = true;
      });
    });
    const result = wrap(h(TestDir as any, null, h("span")));
    mount(result);
    expect(called).toBe(true);
  });

  test("onUnmount fires when parent is disposed", () => {
    let unmounted = false;
    const TestDir = direct((_el: any, _p: any, ctx: DirectiveContext) => {
      ctx.onUnmount(() => {
        unmounted = true;
      });
    });
    const result = wrap(h(TestDir as any, null, h("span")));
    mount(result);
    expect(unmounted).toBe(false);

    if (result.owner) disposeOwner(result.owner);
    expect(unmounted).toBe(true);
  });
});

// ── 指令 + 信号 ──────────────────────────────────────

describe("directive — signal binding", () => {
  test("directive context.use creates signal bound to directive lifecycle", () => {
    let localSig: any;
    const TestDir = direct((_el: any, _p: any, ctx: DirectiveContext) => {
      localSig = ctx.use(0);
    });
    const result = wrap(h(TestDir as any, null, h("span")));
    mount(result);
    expect(localSig).toBeDefined();
    expect(localSig()).toBe(0);

    localSig(42);
    expect(localSig()).toBe(42);
  });
});
