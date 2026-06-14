// @vitest-environment happy-dom
// kiaao — h() DOM rendering integration tests

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";
import { mount, unmount } from "../../src/dom/component.ts";

describe("h — basic element creation", () => {
  test("creates element with tag name", () => {
    const el = h("div");
    expect(el.tagName).toBe("DIV");
  });

  test("sets static attributes", () => {
    const el = h("div", { id: "foo", class: "bar" });
    expect(el.id).toBe("foo");
    expect(el.className).toBe("bar");
  });

  test("adds event listeners", () => {
    let clicked = false;
    const el = h("button", {
      onClick: () => {
        clicked = true;
      },
    });
    (el as HTMLElement).click();
    expect(clicked).toBe(true);
  });

  test("appends static children", () => {
    const el = h("div", null, h("h1", null, "Hello"), h("p", null, "World"));
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("Hello");
    expect(el.children[1].textContent).toBe("World");
  });

  test("flattens nested children arrays", () => {
    const items = [h("li", null, "a"), h("li", null, "b")];
    const el = h("ul", null, items);
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("a");
    expect(el.children[1].textContent).toBe("b");
  });

  test("handles style as string", () => {
    const el = h("div", { style: "color: red" });
    expect((el as HTMLElement).style.color).toBe("red");
  });

  test("handles style as object", () => {
    const el = h("div", { style: { color: "blue", fontSize: "16px" } });
    expect((el as HTMLElement).style.color).toBe("blue");
    expect((el as HTMLElement).style.fontSize).toBe("16px");
  });
});

describe("h — reactive bindings", () => {
  test("reactive text child updates when signal changes", () => {
    const [count, setCount] = use(0);
    const el = h("p", null, count);
    expect(el.textContent).toBe("0");

    setCount(42);
    expect(el.textContent).toBe("42");
  });

  test("reactive attribute updates when signal changes", () => {
    const [cls, setCls] = use("foo");
    const el = h("div", { class: cls });
    expect(el.className).toBe("foo");

    setCls("bar");
    expect(el.className).toBe("bar");
  });

  test("reactive class binding with derive", () => {
    const [isActive, setActive] = use(false);
    const [className] = use(isActive, () => (isActive() ? "active" : "inactive"));

    const el = h("div", { class: className });
    expect(el.className).toBe("inactive");

    setActive(true);
    expect(el.className).toBe("active");
  });

  test("multiple reactive children", () => {
    const [a, setA] = use("A");
    const [b, setB] = use("B");
    const el = h("div", null, a, b);

    expect(el.childNodes.length).toBe(2);
    expect(el.childNodes[0].textContent).toBe("A");
    expect(el.childNodes[1].textContent).toBe("B");

    setA("X");
    setB("Y");
    expect(el.childNodes[0].textContent).toBe("X");
    expect(el.childNodes[1].textContent).toBe("Y");
  });
});

describe("h — component mode", () => {
  test("renders a functional component", () => {
    function Greet(props: { name: string }) {
      return h("p", null, `Hello, ${props.name}`);
    }
    const el = h(Greet, { name: "kiaao" });
    expect(el.tagName).toBe("P");
    expect(el.textContent).toBe("Hello, kiaao");
  });

  test("component with reactive state", () => {
    function Counter() {
      const [count, setCount] = use(0);
      return h(
        "div",
        null,
        h("span", null, count),
        h("button", { onClick: () => setCount((p) => p + 1) }, "+1"),
      );
    }
    const el = h(Counter);
    expect(el.tagName).toBe("DIV");
    expect(el.querySelector("span")!.textContent).toBe("0");

    el.querySelector("button")!.click();
    expect(el.querySelector("span")!.textContent).toBe("1");
  });

  test("component receives children prop", () => {
    function Wrapper(props: { children: any }) {
      return h("div", { class: "wrapper" }, props.children);
    }
    const el = h(Wrapper, null, h("span", null, "child"));
    expect(el.className).toBe("wrapper");
    expect(el.children.length).toBe(1);
    expect(el.children[0].textContent).toBe("child");
  });
});

describe("h — lifecycle", () => {
  test("onMount fires after mounting", () => {
    let mounted = false;
    function Comp(_: any, { onMount }: any) {
      onMount(() => {
        mounted = true;
      });
      return h("div", null, "hello");
    }

    const el = h(Comp);
    expect(mounted).toBe(false);

    mount(el as HTMLElement, document.body);
    expect(mounted).toBe(true);

    el.remove();
  });

  test("onUnmount fires after unmount and dispose", () => {
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

    unmount(el as HTMLElement);
    expect(unmounted).toBe(true);
  });
});
