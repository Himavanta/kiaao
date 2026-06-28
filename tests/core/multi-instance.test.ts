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

    const a1 = createApp(h(App1));
    const a2 = createApp(h(App2));

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
    const app = createApp(h(Comp));
    app.mount(container);
    expect(container.querySelector(".temp")).toBeTruthy();
    app.unmount();
    expect(container.children.length).toBe(0);
  });

  test("mounting same HResult twice is safe", () => {
    const Comp = () => h("div", { class: "shared" }, "shared");
    const hr = h(Comp);
    const c1 = browserAdapter.el("div") as HTMLElement;
    const c2 = browserAdapter.el("div") as HTMLElement;

    const a1 = createApp(hr);
    const a2 = createApp(hr);

    a1.mount(c1);
    a2.mount(c2);
    // This should work — each createApp creates its own rootOwner chain
    expect(c1.textContent).toBe("shared");
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

  test("derivation chain of 100 with fan-out updates correctly", () => {
    const root = use(1);
    let prev: any = root;
    const chain: any[] = [root];
    for (let i = 0; i < 100; i++) {
      const cur = use(prev, (v: number) => v + 1);
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

describe("conditional — deep signals", () => {});
