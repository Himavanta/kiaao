// @vitest-environment happy-dom
// kiaao v4 — Component lifecycle & cleanup tests

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";
import { mount, unmount, onMount, onUnmount } from "../../src/dom/component.ts";

describe("mount / unmount", () => {
  test("mount appends root to container and triggers onMount", () => {
    let mounted = false;

    function Comp() {
      onMount(() => {
        mounted = true;
      });
      return h("p", null, "hello");
    }

    const el = h(Comp);
    mount(el, document.body);

    expect(document.body.contains(el)).toBe(true);
    expect(mounted).toBe(true);

    el.remove();
  });

  test("unmount removes root and triggers onUnmount", () => {
    let unmounted = false;

    function Comp() {
      onUnmount(() => {
        unmounted = true;
      });
      return h("p", null, "hello");
    }

    const el = h(Comp);
    mount(el, document.body);
    expect(unmounted).toBe(false);

    unmount(el);
    expect(unmounted).toBe(true);
    expect(document.body.contains(el)).toBe(false);
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

    // Unmount
    unmount(el);

    // After unmount, the signal still updates but DOM should not change
    setCount(2);
    expect(el.textContent).toBe("1");
  });
});

describe("nested component lifecycle", () => {
  test("child component mount order", () => {
    const order: number[] = [];

    function Child() {
      onMount(() => order.push(2));
      return h("span", null, "child");
    }

    function Parent() {
      onMount(() => order.push(1));
      return h("div", null, h(Child));
    }

    const el = h(Parent);
    mount(el, document.body);

    expect(order).toEqual([1, 2]); // parent before child

    unmount(el);
  });

  test("child component unmount order", () => {
    const order: number[] = [];

    function Child() {
      onUnmount(() => order.push(2));
      return h("span", null, "child");
    }

    function Parent() {
      onUnmount(() => order.push(1));
      return h("div", null, h(Child));
    }

    const el = h(Parent);
    mount(el, document.body);

    unmount(el);
    // disposeNode traverses bottom-up: child first, then parent
    // But onUnmount on child reads from INSTANCE_KEY's unmountCallbacks
    // The order is: child's unmountCallbacks, then parent's unmountCallbacks
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

    el1.remove();
    el2.remove();
  });
});
