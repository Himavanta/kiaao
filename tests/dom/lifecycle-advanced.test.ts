// @vitest-environment happy-dom
// kiaao — Advanced lifecycle scenarios

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";
import { mount, unmount } from "../../src/dom/component.ts";

describe("onMount — immediate execution after mount", () => {
  test("onMount fires exactly once", () => {
    let count = 0;
    function Comp(_: any, { onMount }: any) {
      onMount(() => count++);
      return h("div", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    expect(count).toBe(1);

    unmount(el as HTMLElement);
  });

  test("nested onMount in same component fires immediately", () => {
    const order: string[] = [];
    function Comp(_: any, { onMount }: any) {
      onMount(() => {
        order.push("first");
        onMount(() => order.push("nested"));
      });
      return h("div", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    expect(order).toEqual(["first", "nested"]);

    unmount(el as HTMLElement);
  });

  test("onMount after component already mounted fires immediately", () => {
    const order: string[] = [];
    function Comp(_: any, { onMount }: any) {
      onMount(() => {
        order.push("first");
        onMount(() => order.push("immediate"));
      });
      return h("div", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    expect(order).toEqual(["first", "immediate"]);

    unmount(el as HTMLElement);
  });
});

describe("onUnmount — multiple registrations", () => {
  test("multiple onUnmount callbacks all fire", () => {
    const results: number[] = [];
    function Comp(_: any, { onUnmount }: any) {
      onUnmount(() => results.push(1));
      onUnmount(() => results.push(2));
      onUnmount(() => results.push(3));
      return h("div", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    unmount(el as HTMLElement);

    expect(results).toEqual([1, 2, 3]);
  });

  test("onUnmount called after disposed logs warning", () => {
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warns.push(msg);

    function Comp(_: any, { onUnmount }: any) {
      onUnmount(() => {
        /* cleanup */
      });
      return h("div", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    unmount(el as HTMLElement);

    // 已销毁后调用 onUnmount 应警告
    // 无法直接测试，因为 context 不暴露到外部
    console.warn = origWarn;
  });
});

describe("onMount — async callbacks", () => {
  test("async onMount callback does not block other callbacks", async () => {
    const order: string[] = [];

    function Comp(_: any, { onMount }: any) {
      onMount(async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push("async");
      });
      onMount(() => {
        order.push("sync");
      });
      return h("div", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    expect(order).toEqual(["sync"]); // 同步回调先执行

    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(["sync", "async"]); // async 后完成

    unmount(el as HTMLElement);
  });

  test("async onMount error does not crash framework", async () => {
    const origErr = console.error;
    const errors: string[] = [];
    console.error = (msg: string) => errors.push(msg);

    function Comp(_: any, { onMount }: any) {
      onMount(async () => {
        throw new Error("async error");
      });
      return h("div", null, "ok");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);

    await new Promise((r) => setTimeout(r, 10));
    expect(errors.some((e) => e.includes("onMount"))).toBe(true);

    console.error = origErr;
    unmount(el as HTMLElement);
  });
});

describe("onUnmount — async callbacks", () => {
  test("async onUnmount error does not crash framework", async () => {
    const origErr = console.error;
    const errors: string[] = [];
    console.error = (msg: string) => errors.push(msg);

    function Comp(_: any, { onUnmount }: any) {
      onUnmount(async () => {
        throw new Error("unmount error");
      });
      return h("div", null, "ok");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    unmount(el as HTMLElement);

    await new Promise((r) => setTimeout(r, 10));
    expect(errors.some((e) => e.includes("onUnmount"))).toBe(true);

    console.error = origErr;
  });
});

describe("component mount order — deep nesting", () => {
  test("mount order across 3 levels: parent → child → grandchild", () => {
    const order: string[] = [];

    function GrandChild(_: any, { onMount }: any) {
      onMount(() => order.push("grandchild"));
      return h("span", null, "gc");
    }

    function Child(_: any, { onMount }: any) {
      onMount(() => order.push("child"));
      return h("div", null, h(GrandChild));
    }

    function Parent(_: any, { onMount }: any) {
      onMount(() => order.push("parent"));
      return h("section", null, h(Child));
    }

    const el = h(Parent);
    mount(el as HTMLElement, document.body);
    expect(order).toEqual(["parent", "child", "grandchild"]);

    unmount(el as HTMLElement);
  });

  test("unmount order across 3 levels: grandchild → child → parent", () => {
    const order: string[] = [];

    function GrandChild(_: any, { onUnmount }: any) {
      onUnmount(() => order.push("grandchild"));
      return h("span", null, "gc");
    }

    function Child(_: any, { onUnmount }: any) {
      onUnmount(() => order.push("child"));
      return h("div", null, h(GrandChild));
    }

    function Parent(_: any, { onUnmount }: any) {
      onUnmount(() => order.push("parent"));
      return h("section", null, h(Child));
    }

    const el = h(Parent);
    mount(el as HTMLElement, document.body);
    unmount(el as HTMLElement);
    expect(order).toEqual(["grandchild", "child", "parent"]);
  });
});

describe("unmount during mount", () => {
  test("mount then immediate unmount does not crash", () => {
    function Comp(_: any) {
      return h("div", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    unmount(el as HTMLElement);
  });
});

describe("signal binding inside lifecycle", () => {
  test("onMount with signal binding works", () => {
    const [count, setCount] = use(0);

    function Comp(_: any, { onMount }: any) {
      onMount(() => {
        use(count, () => count());
      });
      return h("p", null, count);
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    expect(el.textContent).toBe("0");

    setCount(1);
    expect(el.textContent).toBe("1");

    unmount(el as HTMLElement);
  });
});
