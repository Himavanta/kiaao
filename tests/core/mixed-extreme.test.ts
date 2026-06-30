// @vitest-environment happy-dom
// kiaao — 多层次混合嵌套极端测试
// 验证组件、控制流、异步组件、指令、Portal 的组合场景

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, Show, Each, use, triggerMount } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: import("../../src/core/types.ts").HResult): HTMLElement {
  function Root() {
    return result;
  }
  const rootHr = h(Root as any);
  const c = browserAdapter.el("div") as HTMLElement;
  for (const node of rootHr.nodes) browserAdapter.append(c, node as any);
  if (rootHr.owner) triggerMount(rootHr.owner);
  return c;
}

// ── 场景 1：Show + Async ─────────────────────────────

describe("Show + Async", () => {
  test("Show 内 Async 组件首次渲染显示 placeholder", async () => {
    const visible = use(true);
    const AsyncComp = () =>
      new Promise<import("../../src/core/types.ts").HResult>((r) =>
        setTimeout(() => r(h("span", { class: "loaded" }, "done")), 10),
      );

    const result = h(
      "div",
      null,
      h(
        Show as any,
        { value: visible },
        () => h(AsyncComp as any),
        () => h("span", null, "fallback"),
      ),
    );
    const container = mount(result);

    // Initial: async not resolved → placeholder (comment anchor)
    expect(container.querySelector("span")).toBeFalsy();

    // Wait for resolve
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector(".loaded")?.textContent).toBe("done");
  });

  test("Show 切到 fallback 时 Async 未 resolve 不崩溃", async () => {
    const visible = use(true);
    let resolveAsync!: (v: any) => void;
    const AsyncComp = () =>
      new Promise((r) => {
        resolveAsync = r;
      });

    const result = h(
      "div",
      null,
      h(
        Show as any,
        { value: visible },
        () => h(AsyncComp as any),
        () => h("span", { class: "fb" }, "fallback"),
      ),
    );
    const container = mount(result);

    // Switch to fallback before async resolves
    visible(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(container.querySelector(".fb")?.textContent).toBe("fallback");

    // Async resolves later — should be no-op (Owner already disposed)
    resolveAsync?.(h("span", null, "late"));
    await new Promise((r) => setTimeout(r, 5));
    expect(container.querySelector(".fb")?.textContent).toBe("fallback");
  });

  test("Show toggle back to primary creates new Async", async () => {
    const visible = use(true);
    let callCount = 0;
    const AsyncComp = () => {
      callCount++;
      return new Promise<import("../../src/core/types.ts").HResult>((r) =>
        setTimeout(() => r(h("span", { class: "a" }, `call-${callCount}`)), 10),
      );
    };

    const result = h(
      "div",
      null,
      h(
        Show as any,
        { value: visible },
        () => h(AsyncComp as any),
        () => h("span", null, "fb"),
      ),
    );
    const container = mount(result);

    await new Promise((r) => setTimeout(r, 15));
    expect(container.querySelector(".a")?.textContent).toBe("call-1");

    // Toggle off then on again
    visible(false);
    await new Promise((r) => setTimeout(r, 5));
    visible(true);
    await new Promise((r) => setTimeout(r, 15));
    expect(container.querySelector(".a")?.textContent).toBe("call-2");
  });
});

// ── 场景 2：Each + Show ──────────────────────────────

describe("Each + Show", () => {
  function ItemRow({ item }: { item: () => { id: number; text: string; active: boolean } }) {
    const show = use(item, () => item().active);
    return h(
      Show as any,
      { value: show },
      () => h("span", { class: "active", "data-id": String(item().id) }, item().text),
      () => h("span", { class: "inactive", "data-id": String(item().id) }, item().text),
    );
  }

  test("列表项内条件渲染每项独立", () => {
    const items = use([
      { id: 1, text: "A", active: true },
      { id: 2, text: "B", active: false },
    ]);

    const result = h(
      "div",
      null,
      h(Each as any, { value: items, keyed: (i: any) => i.id }, ItemRow),
    );
    const container = mount(result);

    const actives = container.querySelectorAll(".active");
    const inactives = container.querySelectorAll(".inactive");
    expect(actives.length).toBe(1);
    expect(inactives.length).toBe(1);
    expect(actives[0]?.textContent).toBe("A");
    expect(inactives[0]?.textContent).toBe("B");
  });

  test("信号驱动每项切换", () => {
    const items = use([
      { id: 1, text: "A", active: true },
      { id: 2, text: "B", active: false },
    ]);

    const result = h(
      "div",
      null,
      h(Each as any, { value: items, keyed: (i: any) => i.id }, ItemRow),
    );
    const container = mount(result);

    // Toggle both
    items([
      { id: 1, text: "A", active: false },
      { id: 2, text: "B", active: true },
    ]);

    const actives = container.querySelectorAll(".active");
    const inactives = container.querySelectorAll(".inactive");
    expect(actives.length).toBe(1);
    expect(inactives.length).toBe(1);
    expect(actives[0]?.textContent).toBe("B");
    expect(inactives[0]?.textContent).toBe("A");
  });

  test("列表重排时条件状态保持", () => {
    const items = use([
      { id: 1, text: "A", active: true },
      { id: 2, text: "B", active: false },
      { id: 3, text: "C", active: true },
    ]);

    const result = h(
      "div",
      null,
      h(Each as any, { value: items, keyed: (i: any) => i.id }, ItemRow),
    );
    const container = mount(result);

    expect(container.querySelectorAll(".active").length).toBe(2);

    // Reorder
    items([
      { id: 3, text: "C", active: true },
      { id: 1, text: "A", active: true },
      { id: 2, text: "B", active: false },
    ]);

    expect(container.querySelectorAll(".active").length).toBe(2);
    expect(container.querySelectorAll(".inactive").length).toBe(1);
  });
});
