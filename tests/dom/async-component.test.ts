// @vitest-environment happy-dom
// kiaao v4 — Async component edge cases

import { expect, test, describe } from "vite-plus/test";
import { h } from "../../src/dom/h.ts";
import { mount, unmount } from "../../src/dom/component.ts";

describe("async component — basic", () => {
  test("renders after promise resolves", async () => {
    async function AsyncComp() {
      const data = await Promise.resolve("hello");
      return h("p", null, data);
    }

    const el = h(AsyncComp);
    expect((el as HTMLElement).style.display).toBe("contents");

    await new Promise((r) => setTimeout(r, 0));

    expect(el.textContent).toBe("hello");
  });

  test("wrapper is a div with display contents", async () => {
    async function AsyncComp() {
      await Promise.resolve();
      return h("span", null, "done");
    }

    const el = h(AsyncComp);
    expect(el.tagName).toBe("DIV");
    expect((el as HTMLElement).style.display).toBe("contents");
  });
});

describe("async component — lifecycle", () => {
  test("onMount fires after resolve", async () => {
    let mounted = false;
    async function AsyncComp(_: any, { onMount }: any) {
      onMount(() => {
        mounted = true;
      });
      await Promise.resolve();
      return h("p", null, "ok");
    }

    const el = h(AsyncComp);
    expect(mounted).toBe(false);

    mount(el as HTMLElement, document.body);
    expect(mounted).toBe(false); // 尚未 resolve

    await new Promise((r) => setTimeout(r, 0));
    expect(mounted).toBe(true); // resolve 后触发

    unmount(el as HTMLElement);
  });

  test("onUnmount fires even if not resolved yet", async () => {
    let unmounted = false;
    async function AsyncComp(_: any, { onUnmount }: any) {
      onUnmount(() => {
        unmounted = true;
      });
      await new Promise(() => {}); // 永不 resolve
      return h("p", null, "never");
    }

    const el = h(AsyncComp);
    mount(el as HTMLElement, document.body);

    unmount(el as HTMLElement);
    expect(unmounted).toBe(true);
  });

  test("resolve after unmount does not append", async () => {
    let resolvePromise: (v: any) => void;
    const slow = new Promise((r) => {
      resolvePromise = r;
    });

    async function AsyncComp() {
      await slow;
      return h("p", null, "late");
    }

    const el = h(AsyncComp);
    mount(el as HTMLElement, document.body);

    unmount(el as HTMLElement);

    resolvePromise!(h("p", null, "never-appended"));

    // 等待微任务传播
    await new Promise((r) => setTimeout(r, 0));
    expect(el.textContent).toBe(""); // 没有追加
  });
});

describe("async component — nested", () => {
  test("async component containing sync child", async () => {
    function SyncChild() {
      return h("span", null, "sync-child");
    }

    async function AsyncComp() {
      await Promise.resolve();
      return h("div", null, h(SyncChild));
    }

    const el = h(AsyncComp);
    await new Promise((r) => setTimeout(r, 0));

    expect(el.textContent).toContain("sync-child");
  });

  test("async component containing another async child", async () => {
    async function Inner() {
      await Promise.resolve("inner");
      return h("b", null, "inner-loaded");
    }

    async function Outer() {
      await Promise.resolve("outer");
      return h("div", null, h(Inner));
    }

    const el = h(Outer);
    await new Promise((r) => setTimeout(r, 10));

    // 两个异步组件都应 resolve
    expect(el.textContent).toContain("inner-loaded");
  });
});

describe("async component — defensive", () => {
  test("resolve null does not crash", async () => {
    async function AsyncComp() {
      await Promise.resolve();
      return null as any;
    }

    const el = h(AsyncComp);
    await new Promise((r) => setTimeout(r, 0));
    // 不崩溃，wrapper 内容为空
    expect(el.textContent).toBe("");
  });

  test("resolve undefined does not crash", async () => {
    async function AsyncComp() {
      await Promise.resolve();
      return undefined as any;
    }

    const el = h(AsyncComp);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.textContent).toBe("");
  });

  test("rejected promise does not crash", async () => {
    async function AsyncComp() {
      await Promise.reject(new Error("fail"));
      return h("p", null, "never");
    }

    const el = h(AsyncComp);
    // 需要捕获控制台错误
    const orig = console.error;
    console.error = () => {};

    await new Promise((r) => setTimeout(r, 0));

    console.error = orig;
    // wrapper 保留，内容为空
    expect(el.textContent).toBe("");
  });
});
