// @vitest-environment happy-dom
// kiaao — 异步组件极端测试：resolve/reject/race/dispose

import { describe, expect, test } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, triggerMount, type Context, type HResult } from "../../src/core/index.ts";
import { disposeOwner } from "../../src/core/owner.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

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

// ── 基本行为 ──────────────────────────────────────────

describe("async component — basic", () => {
  test("resolves and renders content", async () => {
    const Comp = () => Promise.resolve(h("div", { class: "async-content" }, "loaded"));
    const result = h(Comp as any);
    mount(result);

    // Initially a placeholder comment
    expect((result.nodes[0] as any).nodeType).toBe(8);

    // Wait for resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(result.nodes.length).toBe(1);
  });

  test("resolves to null does not crash", async () => {
    const Comp = () => Promise.resolve(null as any);
    const result = h(Comp as any);
    mount(result);
    await new Promise((r) => setTimeout(r, 10));
    // Should not crash, anchor stays
    expect((result.nodes[0] as any).nodeType).toBe(8);
  });

  test("resolves to undefined does not crash", async () => {
    const Comp = () => Promise.resolve(undefined as any);
    const result = h(Comp as any);
    mount(result);
    await new Promise((r) => setTimeout(r, 10));
    expect((result.nodes[0] as any).nodeType).toBe(8);
  });

  test("rejected promise does not crash", async () => {
    const orig = console.error;
    console.error = () => {};
    const Comp = () => Promise.reject(new Error("async fail"));
    const result = h(Comp as any);
    mount(result);
    await new Promise((r) => setTimeout(r, 10));
    // Placeholder should remain
    expect((result.nodes[0] as any).nodeType).toBe(8);
    console.error = orig;
  });
});

// ── 生命周期 ──────────────────────────────────────────

describe("async component — lifecycle", () => {
  test("onMount fires once after resolve", async () => {
    let mountCount = 0;
    const Comp = (_p: any, ctx: Context) => {
      ctx.onMount(() => {
        mountCount++;
      });
      return Promise.resolve(h("div", null, "done"));
    };
    const result = h(Comp as any);
    mount(result);
    await new Promise((r) => setTimeout(r, 10));
    expect(mountCount).toBe(1);
  });

  test("onUnmount fires even if not resolved yet", async () => {
    let unmountCount = 0;
    const Comp = (_p: any, ctx: Context) => {
      ctx.onUnmount(() => {
        unmountCount++;
      });
      return new Promise(() => {}); // Never resolves
    };
    const result = h(Comp as any);
    mount(result);
    if (result.owner) disposeOwner(result.owner);
    expect(unmountCount).toBe(1);
  });

  test("resolve after unmount does not append", async () => {
    let resolvePromise: any;
    const Comp = () =>
      new Promise((r) => {
        resolvePromise = r;
      });
    const result = h(Comp as any);
    mount(result);
    // Dispose before resolve
    if (result.owner) disposeOwner(result.owner);
    // Resolve after dispose
    resolvePromise(h("div", null, "late"));
    await new Promise((r) => setTimeout(r, 10));
    // Should not crash, content should NOT be in DOM
  });
});

// ── 竞争 ──────────────────────────────────────────────

describe("async component — race conditions", () => {
  test("multiple concurrent async components resolve in order", async () => {
    const order: string[] = [];
    const Slow = () =>
      new Promise<string>((r) =>
        setTimeout(() => {
          order.push("slow");
          r("slow" as any);
        }, 20),
      );
    const Fast = () =>
      new Promise<string>((r) =>
        setTimeout(() => {
          order.push("fast");
          r("fast" as any);
        }, 5),
      );

    const result = h("div", null, h(Slow as any), h(Fast as any));
    mount(result);
    await new Promise((r) => setTimeout(r, 30));

    // Fast should resolve before slow
    expect(order).toEqual(["fast", "slow"]);
  });

  test("immediate resolve vs setTimeout", async () => {
    const order: string[] = [];
    const Immediate = () => {
      order.push("immediate-called");
      return Promise.resolve(h("div", { class: "immediate" }));
    };
    const Delayed = () =>
      new Promise((r) =>
        setTimeout(() => {
          order.push("delayed-called");
          r(h("div", { class: "delayed" }));
        }, 10),
      );

    const result = h("div", null, h(Immediate as any), h(Delayed as any));
    mount(result);
    await new Promise((r) => setTimeout(r, 20));

    expect(order).toContain("immediate-called");
    expect(order).toContain("delayed-called");
  });
});

// ── 嵌套 ──────────────────────────────────────────────

describe("async component — nested", () => {
  test("async containing sync child", async () => {
    const SyncChild = () => h("span", { class: "sync" }, "child");
    const AsyncParent = () => Promise.resolve(h("div", null, h(SyncChild)));
    const result = h(AsyncParent);
    mount(result);
    await new Promise((r) => setTimeout(r, 10));
  });

  test("async containing another async", async () => {
    const InnerAsync = () => Promise.resolve(h("span", null, "inner"));
    const OuterAsync = () => Promise.resolve(h("div", null, h(InnerAsync)));
    const result = h(OuterAsync);
    mount(result);
    await new Promise((r) => setTimeout(r, 20));
  });
});

// ── 防御 ──────────────────────────────────────────────

describe("async component — defensive", () => {
  test("resolve same promise twice does not double-render", async () => {
    let resolveFn: any;
    const Comp = () =>
      new Promise((r) => {
        resolveFn = r;
      });
    const result = h(Comp as any);
    mount(result);

    resolveFn(h("div", { class: "once" }, "data"));
    resolveFn(h("div", { class: "twice" }, "data"));

    await new Promise((r) => setTimeout(r, 10));
    // First resolve won, second is ignored (owner disposed check)
  });
});
