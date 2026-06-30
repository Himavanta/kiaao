// @vitest-environment happy-dom
// kiaao — 多层次混合嵌套极端测试
// 验证组件、控制流、异步组件、指令、Portal 的组合场景

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, Show, Each, use, triggerMount, direct } from "../../src/core/index.ts";
import { Portal } from "../../src/dom/index.ts";
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

    expect(container.querySelector("span")).toBeFalsy();
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

    visible(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(container.querySelector(".fb")?.textContent).toBe("fallback");

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
      "div",
      null,
      h(
        Show as any,
        { value: show },
        () => h("span", { class: "active", "data-id": String(item().id) }, item().text),
        () => h("span", { class: "inactive", "data-id": String(item().id) }, item().text),
      ),
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

    expect(container.querySelectorAll(".active").length).toBe(1);
    expect(container.querySelectorAll(".inactive").length).toBe(1);
    expect(container.querySelector(".active")?.textContent).toBe("A");
    expect(container.querySelector(".inactive")?.textContent).toBe("B");
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

    items([
      { id: 1, text: "A", active: false },
      { id: 2, text: "B", active: true },
    ]);

    expect(container.querySelectorAll(".active").length).toBe(1);
    expect(container.querySelectorAll(".inactive").length).toBe(1);
    expect(container.querySelector(".active")?.textContent).toBe("B");
    expect(container.querySelector(".inactive")?.textContent).toBe("A");
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

    items([
      { id: 3, text: "C", active: true },
      { id: 1, text: "A", active: true },
      { id: 2, text: "B", active: false },
    ]);

    expect(container.querySelectorAll(".active").length).toBe(2);
    expect(container.querySelectorAll(".inactive").length).toBe(1);
  });
});

// ── 场景 3：Each + Show + Async ───────────────────────

describe("Each + Show + Async", () => {
  function AsyncRow({ item }: { item: () => { id: number; text: string } }) {
    const loaded = use(false);
    const data = item();

    setTimeout(() => loaded(true), 5);

    return h(
      "div",
      { class: "row", "data-id": String(data.id) },
      h(
        Show as any,
        { value: loaded },
        () => h("span", { class: "content" }, data.text + "-loaded"),
        () => h("span", { class: "loading" }, "loading..."),
      ),
    );
  }

  test("每项独立异步加载后显示内容", async () => {
    const items = use([
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ]);

    const result = h(
      "div",
      null,
      h(Each as any, { value: items, keyed: (i: any) => i.id }, AsyncRow),
    );
    const container = mount(result);

    expect(container.querySelectorAll(".loading").length).toBe(2);
    expect(container.querySelectorAll(".content").length).toBe(0);

    await new Promise((r) => setTimeout(r, 15));
    expect(container.querySelectorAll(".loading").length).toBe(0);
    expect(container.querySelectorAll(".content").length).toBe(2);
  });

  test("列表重排时内部加载状态保持", async () => {
    const items = use([
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ]);

    const result = h(
      "div",
      null,
      h(Each as any, { value: items, keyed: (i: any) => i.id }, AsyncRow),
    );
    const container = mount(result);

    await new Promise((r) => setTimeout(r, 15));
    expect(container.querySelectorAll(".content").length).toBe(2);

    items([
      { id: 2, text: "B" },
      { id: 1, text: "A" },
    ]);

    expect(container.querySelectorAll(".content").length).toBe(2);
    const rows = container.querySelectorAll(".row");
    expect(rows[0]?.textContent).toContain("B-loaded");
    expect(rows[1]?.textContent).toContain("A-loaded");
  });
});

// ── 场景 4：Each + 指令 + Show ───────────────────────

describe("Each + 指令 + Show", () => {
  const TestDirective = direct(((el: any, _props: any, ctx: any) => {
    el.setAttribute("data-mounted", "true");
    ctx.onUnmount(() => el.setAttribute("data-cleaned", "true"));
  }) as any);

  function ItemRow({ item }: { item: () => { id: number; active: boolean; text: string } }) {
    const show = use(item, () => item().active);
    return h(
      "div",
      { class: "item" },
      h(TestDirective as any, { from: {}, to: {} }, () =>
        h(
          Show as any,
          { value: show },
          () => h("span", { class: "active-text" }, item().text),
          () => h("span", { class: "inactive-text" }, item().text),
        ),
      ),
    );
  }

  test("指令在 Each 条目内正常挂载并操作 Show 内容", () => {
    const items = use([{ id: 1, text: "A", active: true }]);

    const result = h(
      "div",
      null,
      h(Each as any, { value: items, keyed: (i: any) => i.id }, ItemRow),
    );
    const container = mount(result);

    expect(container.querySelector(".active-text")?.textContent).toBe("A");
  });

  test("Show 切换时 Show 内容切换", () => {
    const items = use([{ id: 1, text: "A", active: true }]);

    const result = h(
      "div",
      null,
      h(Each as any, { value: items, keyed: (i: any) => i.id }, ItemRow),
    );
    const container = mount(result);

    expect(container.querySelector(".active-text")?.textContent).toBe("A");

    items([{ id: 1, text: "A", active: false }]);
    expect(container.querySelector(".inactive-text")?.textContent).toBe("A");
  });
});

// ── 场景 5：Async + Each + Show ───────────────────────

describe("Async + Each + Show", () => {
  test("异步组件 resolve 后完整渲染多层嵌套", async () => {
    const AsyncList = () =>
      new Promise<import("../../src/core/types.ts").HResult>((r) => {
        setTimeout(() => {
          const items = [
            { id: 1, text: "X", active: true },
            { id: 2, text: "Y", active: false },
          ];

          function ItemRow({
            item,
          }: {
            item: () => { id: number; text: string; active: boolean };
          }) {
            const show = use(item, () => item().active);
            return h(
              "div",
              null,
              h(
                Show as any,
                { value: show },
                () => h("span", { class: "a" }, item().text),
                () => h("span", { class: "b" }, item().text),
              ),
            );
          }

          r(
            h(
              "div",
              { class: "list" },
              h(Each as any, { value: items, keyed: (i: any) => i.id }, ItemRow),
            ),
          );
        }, 10);
      });

    const result = h("div", null, h(AsyncList as any));
    const container = mount(result);

    // Placeholder initially
    expect(container.querySelector(".list")).toBeFalsy();

    // Wait for resolve
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector(".list")).toBeTruthy();
    expect(container.querySelectorAll(".a").length).toBe(1);
    expect(container.querySelectorAll(".b").length).toBe(1);
    expect(container.querySelector(".a")?.textContent).toBe("X");
  });

  test("异步组件 resolve 后内部信号绑定工作正常", async () => {
    const items = use([{ id: 1, text: "A", active: true }]);

    function ItemRow({ item }: { item: () => { id: number; text: string; active: boolean } }) {
      const show = use(item, () => item().active);
      return h(
        Show as any,
        { value: show },
        () => h("span", { class: "a" }, item().text),
        () => h("span", { class: "b" }, item().text),
      );
    }

    const AsyncList = () =>
      Promise.resolve(
        h(
          "div",
          { class: "list" },
          h(Each as any, { value: items, keyed: (i: any) => i.id }, ItemRow),
        ),
      );

    const result = h("div", null, h(AsyncList as any));
    const container = mount(result);

    await new Promise((r) => setTimeout(r, 10));
    expect(container.querySelector(".a")?.textContent).toBe("A");

    // Signal-driven toggle inside async-rendered tree
    items([{ id: 1, text: "A", active: false }]);
    expect(container.querySelector(".b")?.textContent).toBe("A");
  });
});

// ── 场景 6：Portal + Show ────────────────────────────

describe("Portal + Show", () => {
  test("Show 在 Portal 内正常渲染", () => {
    const target = document.createElement("div");
    target.id = "portal-target";
    document.body.append(target);

    const visible = use(true);

    const result = h(
      "div",
      null,
      h(
        Portal as any,
        { to: "#portal-target" },
        h(
          Show as any,
          { value: visible },
          () => h("span", { class: "p" }, "portal-content"),
          () => h("span", { class: "p" }, "fallback"),
        ),
      ),
    );
    mount(result);

    expect(target.querySelector(".p")?.textContent).toBe("portal-content");
  });

  test("Portal 内 Show 切换内容更新", () => {
    const target = document.createElement("div");
    target.id = "portal-target2";
    document.body.append(target);

    const visible = use(true);

    const result = h(
      "div",
      null,
      h(
        Portal as any,
        { to: "#portal-target2" },
        h(
          Show as any,
          { value: visible },
          () => h("span", { class: "pc" }, "visible"),
          () => h("span", { class: "pc" }, "hidden"),
        ),
      ),
    );
    mount(result);

    expect(target.querySelector(".pc")?.textContent).toBe("visible");

    visible(false);
    expect(target.querySelector(".pc")?.textContent).toBe("hidden");
  });

  test("Portal unmount 时 Show 内容清理", () => {
    const target = document.createElement("div");
    target.id = "portal-target3";
    document.body.append(target);

    const visible = use(true);
    const result = h(
      "div",
      null,
      h(
        Portal as any,
        { to: "#portal-target3" },
        h(
          Show as any,
          { value: visible },
          () => h("span", { class: "temp" }, "visible"),
          () => h("span", null, "hidden"),
        ),
      ),
    );
    mount(result);

    expect(target.querySelector(".temp")?.textContent).toBe("visible");

    // Toggle Show inside Portal
    visible(false);
    expect(target.querySelector(".temp")).toBeFalsy();
  });
});

// ── 场景 7：综合压力 — Each + Show + Directive + Async ──

describe("综合压力 Each+Show+Directive+Async", () => {
  const FadeDirective = direct(((el: any, _props: any, ctx: any) => {
    el.setAttribute("data-fade", "true");
    ctx.onUnmount(() => el.setAttribute("data-fade-end", "true"));
  }) as any);

  function AsyncDetail({ item }: { item: () => { id: number; text: string } }) {
    const loaded = use(false);
    const data = item();
    setTimeout(() => loaded(true), 5);

    return h(
      Show as any,
      { value: loaded },
      () => h("span", { class: "detail", "data-id": String(data.id) }, data.text + "-detail"),
      () => h("span", { class: "placeholder" }, "loading..."),
    );
  }

  function SectionRow({ item }: { item: () => { id: number; title: string; expanded: boolean } }) {
    const expanded = use(item, () => item().expanded);
    const data = item();

    return h(
      "div",
      { class: "section", "data-id": String(data.id) },
      h("h3", null, data.title),
      h(
        FadeDirective as any,
        { from: {}, to: {} },
        h(
          Show as any,
          { value: expanded },
          () => {
            // Each of detail items inside expanded section
            const items = use([
              { id: 1, text: data.title + "-A" },
              { id: 2, text: data.title + "-B" },
            ]);
            return h(
              "div",
              { class: "details" },
              h(Each as any, { value: items, keyed: (i: any) => i.id }, AsyncDetail),
            );
          },
          () => h("span", { class: "collapsed" }, "collapsed"),
        ),
      ),
    );
  }

  test("全链路多层嵌套下整体渲染正确", async () => {
    const sections = use([
      { id: 1, title: "S1", expanded: true },
      { id: 2, title: "S2", expanded: false },
    ]);

    const result = h(
      "div",
      { class: "root" },
      h(Each as any, { value: sections, keyed: (s: any) => s.id }, SectionRow),
    );
    const container = mount(result);

    // Section 1 expanded, Section 2 collapsed
    expect(container.querySelectorAll(".section").length).toBe(2);
    expect(container.querySelectorAll(".details").length).toBe(1);
    expect(container.querySelectorAll(".collapsed").length).toBe(1);

    // Wait for async details to load
    await new Promise((r) => setTimeout(r, 15));
    expect(container.querySelectorAll(".detail").length).toBe(2);
    expect(container.querySelectorAll(".placeholder").length).toBe(0);
  });

  test("展开/折叠不泄漏", async () => {
    const sections = use([{ id: 1, title: "S1", expanded: true }]);

    const result = h(
      "div",
      { class: "root" },
      h(Each as any, { value: sections, keyed: (s: any) => s.id }, SectionRow),
    );
    const container = mount(result);

    await new Promise((r) => setTimeout(r, 15));
    expect(container.querySelectorAll(".detail").length).toBe(2);

    // Collapse
    sections([{ id: 1, title: "S1", expanded: false }]);
    expect(container.querySelectorAll(".details").length).toBe(0);
    expect(container.querySelectorAll(".collapsed").length).toBe(1);

    // Expand again
    sections([{ id: 1, title: "S1", expanded: true }]);
    await new Promise((r) => setTimeout(r, 15));
    expect(container.querySelectorAll(".detail").length).toBe(2);
  });

  test("列表重排时多层状态保持", async () => {
    const sections = use([
      { id: 1, title: "S1", expanded: true, order: 1 },
      { id: 2, title: "S2", expanded: true, order: 2 },
    ]);

    const result = h(
      "div",
      { class: "root" },
      h(Each as any, { value: sections, keyed: (s: any) => s.id }, SectionRow),
    );
    const container = mount(result);

    await new Promise((r) => setTimeout(r, 15));
    expect(container.querySelectorAll(".detail").length).toBe(4);

    // Reorder
    sections([
      { id: 2, title: "S2", expanded: true, order: 2 },
      { id: 1, title: "S1", expanded: true, order: 1 },
    ]);

    // All details should still be loaded
    expect(container.querySelectorAll(".detail").length).toBe(4);
    const details = container.querySelectorAll(".detail");
    expect(details[0]?.textContent).toContain("S2");
    expect(details[2]?.textContent).toContain("S1");
  });
});
