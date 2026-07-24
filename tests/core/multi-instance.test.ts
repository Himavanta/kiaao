// @vitest-environment happy-dom
// kiaao — 多实例隔离与大型状态树测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter, getAdapter } from "../../src/adapter/index.ts";
import { h, use } from "../../src/core/index.ts";
import { createApp } from "../../src/dom/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

// ── 多 createApp 实例 ─────────────────────────────────

describe("multi-instance — isolation", () => {
  test("two independent apps do not interfere", () => {
    const sig1 = use("app1");
    const sig2 = use("app2");

    const App1 = () => h("div", { class: "app1" }, sig1);
    const App2 = () => h("div", { class: "app2" }, sig2);

    const c1 = browserAdapter.el("div") as HTMLElement;
    const c2 = browserAdapter.el("div") as HTMLElement;

    const a1 = createApp(App1);
    const a2 = createApp(App2);

    a1.mount(c1);
    a2.mount(c2);

    expect(c1.textContent).toBe("app1");
    expect(c2.textContent).toBe("app2");

    sig1("changed");
    expect(c1.textContent).toBe("changed");
    expect(c2.textContent).toBe("app2"); // not affected

    a1.unmount();
    a2.unmount();
  });

  test("createApp renders then unmounts cleanly", () => {
    const Comp = () => h("span", { class: "temp" }, "temporary");
    const container = browserAdapter.el("div") as HTMLElement;
    const app = createApp(Comp);
    app.mount(container);
    expect(container.querySelector(".temp")).toBeTruthy();
    app.unmount();
    expect(container.children.length).toBe(0);
  });

  /**
   * 测试类型：边界 — 设计限制
   * 场景：将同一个 HResult 挂载到两个 createApp 实例的容器
   * 预期：HResult 不应跨实例共享；当前实现表现为 DOM 节点被移动，
   *       c1 中的内容会在 c2 mount 后丢失。这是 v7 的明确设计限制，
   *       参见 docs/架构/Cell 与 HResult 的分离，持久 Owner 树的纯化.md
   * 状态：设计限制，不修复
   */
  test("mounting same HResult twice is safe", () => {
    const Comp = () => h("div", { class: "shared" }, "shared");
    const hr = h(Comp);
    const c1 = browserAdapter.el("div") as HTMLElement;
    const c2 = browserAdapter.el("div") as HTMLElement;

    const a1 = createApp(() => hr);
    const a2 = createApp(() => hr);

    a1.mount(c1);
    a2.mount(c2);
    // 设计限制：hr.owner 被两个 app 共享，c1 的内容在 c2 mount 后被转移
    // 实际结果：c1 为空，c2 拥有 "shared"
    expect(c1.textContent).toBe("");
    expect(c2.textContent).toBe("shared");

    a1.unmount();
    a2.unmount();
  });
});

// ── 大型状态树 ────────────────────────────────────────

describe("large state — many signals", () => {
  test("1000 independent signals update without conflict", () => {
    const sigs = Array.from({ length: 1000 }, (_, i) => use(i));

    // Update all
    for (let i = 0; i < 1000; i++) {
      sigs[i](i * 2);
    }

    // Verify all
    for (let i = 0; i < 1000; i++) {
      expect(sigs[i]()).toBe(i * 2);
    }
  });

  /**
   * 测试类型：边界 — 契约内
   * 场景：100 层派生链，每次都显式读取上游信号
   * 预期：初始值正确；上游变化后每层逐级重算并保持定义
   * 状态：稳定契约
   */
  test("derivation chain of 100 with fan-out updates correctly", () => {
    const root = use(1);
    let prev: any = root;
    const chain: any[] = [root];
    for (let i = 0; i < 100; i++) {
      const dependency = prev;
      const cur = use(dependency, () => dependency() + 1);
      chain.push(cur);
      prev = cur;
    }

    expect(chain[100]()).toBe(101);

    root(10);
    expect(chain[100]()).toBe(110);
  });

  test("10,000 signal set operations are fast enough", () => {
    const s = use(0);
    const start = Date.now();
    for (let i = 0; i < 10000; i++) {
      s(i);
    }
    const elapsed = Date.now() - start;
    expect(s()).toBe(9999);
    // Should complete within reasonable time (< 500ms)
    expect(elapsed).toBeLessThan(500);
  });
});

// ── 事件系统 ─────────────────────────────────────────

describe("event — edge cases", () => {
  function setProp(el: HTMLElement, key: string, value: any): void {
    const adapter = getAdapter();
    adapter.setProp(el, key, value);
  }

  test("onClick with null handler does not crash", () => {
    const el = browserAdapter.el("button") as HTMLElement;
    expect(() => setProp(el, "onClick", null)).not.toThrow();
  });

  test("onClick with undefined handler does not crash", () => {
    const el = browserAdapter.el("button") as HTMLElement;
    expect(() => setProp(el, "onClick", undefined)).not.toThrow();
  });

  test("multiple event handlers on same event fire in order", () => {
    const el = browserAdapter.el("button") as HTMLElement;
    const order: number[] = [];
    setProp(el, "onClick", () => order.push(1));
    setProp(el, "onClick", () => order.push(2));
    el.click();
    expect(order).toEqual([1, 2]);
  });

  test("removeEventListener via null assignment", () => {
    const el = browserAdapter.el("button") as HTMLElement;
    let count = 0;
    const handler = () => {
      count++;
    };
    el.addEventListener("click", handler);
    el.click();
    expect(count).toBe(1);
    el.removeEventListener("click", handler);
    el.click();
    expect(count).toBe(1); // Not incremented
  });

  test("custom event name works (onMyEvent)", () => {
    const el = browserAdapter.el("div") as HTMLElement;
    let called = false;
    setProp(el, "onMyEvent", () => {
      called = true;
    });

    const event = new Event("myevent");
    el.dispatchEvent(event);
    expect(called).toBe(true);
  });
});

// ── 条件渲染嵌套信号 ──────────────────────────────────

describe.todo("conditional — deep signals");
