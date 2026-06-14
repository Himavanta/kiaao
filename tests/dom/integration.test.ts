// @vitest-environment happy-dom
// kiaao — Multi-module integration tests
// Tests that combine reactive core, DOM rendering, lifecycle, and directives.

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h, Fragment } from "../../src/index.ts";
import { renderToString } from "../../src/server/index.ts";
import { mount, unmount } from "../../src/dom/component.ts";

describe("signal + when + each interaction", () => {
  test("when toggles a list", () => {
    const [visible, setVisible] = use(true);
    const [items] = use(["a", "b"]);

    const el = h(
      "section",
      { when: visible },
      h("ul", { each: items, key: (item: string) => item }, (item: () => string) =>
        h("li", null, item),
      ),
    );

    expect(el.children.length).toBe(1);
    expect(el.children[0].children.length).toBe(2);

    setVisible(false);
    expect(el.children.length).toBe(0);

    setVisible(true);
    expect(el.children.length).toBe(1);
    expect(el.children[0].children.length).toBe(2);
  });

  test("dynamic list with reactive items", () => {
    const [items, setItems] = use([1, 2, 3]);

    const el = h("ul", { each: items, key: (item: number) => item }, (item: () => number) =>
      h("li", null, item),
    );

    expect(el.children.length).toBe(3);

    setItems([3, 4, 5]);
    expect(el.children.length).toBe(3);
    // key=3 应复用，4 和 5 是新节点
    expect(el.children[0].textContent).toBe("3");
    expect(el.children[1].textContent).toBe("4");
    expect(el.children[2].textContent).toBe("5");
  });
});

describe("Fragment integration", () => {
  test("Fragment wraps children", () => {
    const el = h(Fragment, null, h("span", null, "a"), h("span", null, "b"));
    expect(el.tagName).toBe("DIV");
    expect((el as HTMLElement).style.display).toBe("contents");
    expect(el.children.length).toBe(2);
  });

  test("Fragment inside component return", () => {
    function Comp() {
      return h(Fragment, null, h("h1", null, "Title"), h("p", null, "Content"));
    }
    const el = h(Comp);
    expect(el.children.length).toBe(2);
  });

  test("Fragment with signals", () => {
    const [count, setCount] = use(0);
    const el = h(Fragment, null, h("span", null, count));
    expect(el.textContent).toBe("0");

    setCount(42);
    expect(el.textContent).toBe("42");
  });
});

describe("reactive props + lifecycle", () => {
  test("reactive attribute together with onMount", () => {
    let mounted = false;
    const [cls, setCls] = use("initial");

    function Comp(_: any, { onMount }: any) {
      onMount(() => {
        mounted = true;
      });
      return h("div", { class: cls });
    }

    const el = h(Comp);
    mount(el as HTMLElement, document.body);
    expect(mounted).toBe(true);
    expect(el.className).toBe("initial");

    setCls("updated");
    expect(el.className).toBe("updated");

    unmount(el as HTMLElement);
  });
});

describe("multiple signal children in component", () => {
  test("component with multiple signal bindings", () => {
    const [first, setFirst] = use("Hello");
    const [last, setLast] = use("World");

    function Greeting() {
      return h("div", null, h("span", null, first), h("span", null, last));
    }

    const el = h(Greeting);
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("Hello");
    expect(el.children[1].textContent).toBe("World");

    setFirst("Hi");
    setLast("Kiaao");
    expect(el.children[0].textContent).toBe("Hi");
    expect(el.children[1].textContent).toBe("Kiaao");
  });

  test("shared signal across multiple components", () => {
    const [shared, setShared] = use("shared");

    function A() {
      return h("p", null, shared);
    }
    function B() {
      return h("p", null, shared);
    }

    const container = h("div", null, h(A), h(B));
    document.body.append(container);

    expect(container.children[0].textContent).toBe("shared");
    expect(container.children[1].textContent).toBe("shared");

    setShared("updated");

    expect(container.children[0].textContent).toBe("updated");
    expect(container.children[1].textContent).toBe("updated");

    container.remove();
  });
});

describe("nested component with signals", () => {
  test("parent passes signal-derived prop to child", () => {
    const [count, setCount] = use(5);
    const [doubled] = use(count, () => count() * 2);

    function Display(props: { val: () => number }) {
      return h("span", null, props.val);
    }

    const el = h(Display, { val: doubled });
    expect(el.textContent).toBe("10");

    setCount(10);
    expect(el.textContent).toBe("20");
  });
});

describe("SSR integration", () => {
  test("renderToString with signals and directives", () => {
    const [visible] = use(true);
    function Comp() {
      return h("div", { when: visible }, h("p", null, "hello"));
    }

    const html = renderToString(Comp);
    expect(html).toBe("<div><p>hello</p></div>");
  });
});

describe("h() defensive paths", () => {
  test("h(null) returns comment placeholder", () => {
    const el = h(null as any);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("h(undefined) returns comment placeholder", () => {
    const el = h(undefined as any);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("h(0) returns comment placeholder", () => {
    const el = h(0 as any);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("h(false) returns comment placeholder", () => {
    const el = h(false as any);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("h with no props and no children creates element", () => {
    const el = h("div");
    expect(el.tagName).toBe("DIV");
    expect(el.children.length).toBe(0);
  });
});
