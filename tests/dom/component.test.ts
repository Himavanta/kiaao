// @vitest-environment happy-dom
// kiaao v4 — Component lifecycle & cleanup tests

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";
import { mount, unmount } from "../../src/dom/component.ts";

describe("mount / unmount", () => {
  test("mount appends root to container and triggers onMount", () => {
    let mounted = false;

    function Comp(_: any, { onMount }: any) {
      onMount(() => {
        mounted = true;
      });
      return h("p", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);

    expect(document.body.contains(el as Node)).toBe(true);
    expect(mounted).toBe(true);

    (el as Element).remove();
  });

  test("unmount removes root and triggers onUnmount", () => {
    let unmounted = false;

    function Comp(_: any, { onUnmount }: any) {
      onUnmount(() => {
        unmounted = true;
      });
      return h("p", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    expect(unmounted).toBe(false);

    unmount(el as HTMLElement);
    expect(unmounted).toBe(true);
    expect(document.body.contains(el as Node)).toBe(false);
  });
});

describe("effect cleanup on unmount", () => {
  test("reactive bindings stop updating after unmount", () => {
    const [count, setCount] = use(0);
    const el = h("p", null, count);
    document.body.append(el);

    expect(el.textContent).toBe("0");

    setCount(1);
    expect(el.textContent).toBe("1");

    unmount(el as HTMLElement);

    setCount(2);
    expect(el.textContent).toBe("1");
  });
});

describe("nested component lifecycle", () => {
  test("child component mount order", () => {
    const order: number[] = [];

    function Child(_: any, { onMount }: any) {
      onMount(() => order.push(2));
      return h("span", null, "child");
    }

    function Parent(_: any, { onMount }: any) {
      onMount(() => order.push(1));
      return h("div", null, h(Child));
    }

    const el = h(Parent);
    mount(el as HTMLElement, document.body);

    expect(order).toEqual([1, 2]);

    unmount(el as HTMLElement);
  });

  test("child component unmount order", () => {
    const order: number[] = [];

    function Child(_: any, { onUnmount }: any) {
      onUnmount(() => order.push(2));
      return h("span", null, "child");
    }

    function Parent(_: any, { onUnmount }: any) {
      onUnmount(() => order.push(1));
      return h("div", null, h(Child));
    }

    const el = h(Parent);
    mount(el as HTMLElement, document.body);

    unmount(el as HTMLElement);
    expect(order).toEqual([2, 1]);
  });
});

describe("reactive signals from multiple components", () => {
  test("shared signal across components", () => {
    const [count, setCount] = use(0);

    function Display() {
      return h("span", null, count);
    }

    const el1 = h(Display);
    const el2 = h(Display);

    document.body.append(el1, el2);
    expect(el1.textContent).toBe("0");
    expect(el2.textContent).toBe("0");

    setCount(5);
    expect(el1.textContent).toBe("5");
    expect(el2.textContent).toBe("5");

    (el1 as Element).remove();
    (el2 as Element).remove();
  });
});

describe("async component", () => {
  test("async component renders after promise resolves", async () => {
    async function AsyncComp(_: any, { onMount }: any) {
      onMount(() => {
        /* mounted */
      });
      const data = await Promise.resolve("hello");
      return h("p", null, data);
    }

    const el = h(AsyncComp);

    // 初始返回 wrapper（display:contents）
    expect((el as HTMLElement).style.display).toBe("contents");

    // 等待微任务
    await new Promise((r) => setTimeout(r, 0));

    // 真实内容应已就位
    expect(el.textContent).toBe("hello");
  });

  test("async component can be disposed before resolve", async () => {
    async function AsyncComp() {
      await new Promise(() => {}); // 永不 resolve
      return h("p", null, "never");
    }

    const el = h(AsyncComp);

    unmount(el as HTMLElement);

    await new Promise((r) => setTimeout(r, 10));
    expect(true).toBe(true);
  });
});
