// @vitest-environment happy-dom
// kiaao v4 — Cleanup & disposal edge cases

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";
import { mount, unmount, disposeNode } from "../../src/dom/component.ts";
import { LOCAL_EFFECTS } from "../../src/reactive/types.ts";

describe("LOCAL_EFFECTS cleanup", () => {
  test("reactive child stops updating after disposeNode", () => {
    const [count, setCount] = use(0);
    const el = h("p", null, count);
    document.body.append(el);

    expect(el.textContent).toBe("0");
    setCount(1);
    expect(el.textContent).toBe("1");

    disposeNode(el);
    setCount(2);
    expect(el.textContent).toBe("1"); // 不再更新
    el.remove();
  });

  test("reactive attribute stops updating after disposeNode", () => {
    const [cls, setCls] = use("foo");
    const el = h("div", { class: cls });
    document.body.append(el);

    expect(el.className).toBe("foo");
    setCls("bar");
    expect(el.className).toBe("bar");

    disposeNode(el);
    setCls("baz");
    expect(el.className).toBe("bar"); // 不再更新
    el.remove();
  });

  test("disposeNode on element with no LOCAL_EFFECTS is safe", () => {
    const el = h("div", null, "static");
    disposeNode(el);
    expect(el.textContent).toBe("static"); // 不崩溃
  });

  test("disposeNode called twice is safe", () => {
    const [count] = use(0);
    const el = h("p", null, count);
    document.body.append(el);
    disposeNode(el);
    disposeNode(el); // 第二次不崩溃
    el.remove();
  });

  test("LOCAL_EFFECTS set is cleared after disposeNode", () => {
    const [count] = use(0);
    const el = h("p", null, count);
    document.body.append(el);

    // 响应式绑定注册在 TextNode 上，不是父元素
    const textNode = el.firstChild!;
    expect((textNode as any)[LOCAL_EFFECTS]).toBeDefined();

    disposeNode(el);
    expect((textNode as any)[LOCAL_EFFECTS]).toBeUndefined();
    el.remove();
  });
});

describe("component lifecycle cleanup", () => {
  test("onUnmount fires when component is disposed", () => {
    let unmounted = false;
    function Comp(_: any, { onUnmount }: any) {
      onUnmount(() => {
        unmounted = true;
      });
      return h("div", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    expect(unmounted).toBe(false);

    disposeNode(el as HTMLElement);
    expect(unmounted).toBe(true);
    el.remove();
  });

  test("DISPOSE_KEY only fires once", () => {
    let count = 0;
    function Comp(_: any, { onUnmount }: any) {
      onUnmount(() => {
        count++;
      });
      return h("div", null, "hello");
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);

    disposeNode(el as HTMLElement);
    expect(count).toBe(1);

    disposeNode(el as HTMLElement);
    expect(count).toBe(1); // 第二次不增加
    el.remove();
  });

  test("child component cleanup before parent", () => {
    const order: string[] = [];

    function Child(_: any, { onUnmount }: any) {
      onUnmount(() => order.push("child"));
      return h("span", null);
    }

    function Parent(_: any, { onUnmount }: any) {
      onUnmount(() => order.push("parent"));
      return h("div", null, h(Child));
    }

    const el = h(Parent);
    mount(el as HTMLElement, document.body);
    disposeNode(el as HTMLElement);

    expect(order).toEqual(["child", "parent"]);
    el.remove();
  });
});

describe("when/each cleanup", () => {
  test("when branch switch removes previous DOM", () => {
    const [visible, setVisible] = use(true);

    const el = h("div", { when: visible }, h("span", null, "content"));

    expect(el.textContent).toBe("content");

    setVisible(false);
    expect(el.textContent).toBe("");
  });

  test("each item signals stop updating after each source change clears them", () => {
    const [items, setItems] = use([{ id: 1 }, { id: 2 }]);

    // 这里用 h() 的 each 指令来测试
    const el = h("div", { each: items, key: (item: any) => item.id }, (item: () => any) =>
      h("span", null, item),
    );

    expect(el.children.length).toBe(2);

    setItems([{ id: 1 }]);
    expect(el.children.length).toBe(1);
  });
});

describe("unmount integration", () => {
  test("unmount removes root and cleans up", () => {
    const [count, setCount] = use(0);
    const el = h("p", null, count);
    mount(el as HTMLElement, document.body);

    expect(document.body.contains(el as Node)).toBe(true);
    expect(el.textContent).toBe("0");

    unmount(el as HTMLElement);
    expect(document.body.contains(el as Node)).toBe(false);

    // unmount 后不应再更新
    setCount(5);
    expect(el.textContent).toBe("0");
  });
});
