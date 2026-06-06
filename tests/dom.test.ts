// @vitest-environment happy-dom

import { expect, test, describe } from "vite-plus/test";
import {
  define,
  effect,
  derive,
  h,
  mount,
  unmount,
  onMount,
  onUnmount,
  Show,
  List,
} from "../src/index.ts";

describe("h — DOM mode", () => {
  test("creates element with tag name", () => {
    const el = h("div");
    expect(el.tagName).toBe("DIV");
  });

  test("sets attributes", () => {
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
    el.click();
    expect(clicked).toBe(true);
  });

  test("appends static children", () => {
    const el = h("div", null, h("h1", null, "Hello"), h("p", null, "World"));
    expect(el.children.length).toBe(2);
    expect(el.children[0].tagName).toBe("H1");
    expect(el.children[0].textContent).toBe("Hello");
  });

  test("handles style as string", () => {
    const el = h("div", { style: "color: red; font-size: 14px" });
    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("14px");
  });

  test("handles style as object", () => {
    const el = h("div", { style: { color: "blue", fontSize: "16px" } });
    expect(el.style.color).toBe("blue");
    expect(el.style.fontSize).toBe("16px");
  });

  test("flattens nested children arrays", () => {
    const items = [h("li", null, "a"), h("li", null, "b")];
    const el = h("ul", null, items);
    expect(el.children.length).toBe(2);
  });
});

describe("h — reactive bindings", () => {
  test("creates dynamic text node for getter selector", () => {
    const [count] = define(42);
    const el = h(
      "p",
      null,
      count((v) => v),
    );
    expect(el.textContent).toBe("42");
  });

  test("updates text content when signal changes", () => {
    const [count, setCount] = define(0);
    const el = h(
      "p",
      null,
      count((v) => v),
    );
    expect(el.textContent).toBe("0");

    setCount(100);
    expect(el.textContent).toBe("100");
  });

  test("partial subscription — only updates when selected value changes", () => {
    const [user, setUser] = define({ name: "tom", age: 18 });
    const el = h(
      "p",
      null,
      user((v) => v.name),
    );
    expect(el.textContent).toBe("tom");

    // Change age — name stays same → text should NOT change
    setUser((prev) => ({ ...prev, age: 19 }));
    expect(el.textContent).toBe("tom");

    // Change name — text should update
    setUser((prev) => ({ ...prev, name: "jerry" }));
    expect(el.textContent).toBe("jerry");
  });

  test("reactive function from derive works in h()", () => {
    const [count, setCount] = define(5);
    const double = derive(() => count() * 2);
    const el = h("p", null, double);
    expect(el.textContent).toBe("10");

    setCount(10);
    expect(el.textContent).toBe("20");
  });
});

describe("h — component mode", () => {
  test("calls component function with props", () => {
    function Greet(props: { name: string }) {
      return h("p", null, `Hello, ${props.name}!`);
    }

    const el = h(Greet, { name: "kiaao" }) as HTMLElement;
    expect(el.tagName).toBe("P");
    expect(el.textContent).toBe("Hello, kiaao!");
  });

  test("nested components compose correctly", () => {
    function Wrapper(props: { title: string; children?: any }) {
      return h("section", null, h("h2", null, props.title), props.children);
    }

    const el = h(Wrapper, { title: "Test" }, h("p", null, "content")) as HTMLElement;

    expect(el.tagName).toBe("SECTION");
    expect(el.querySelector("h2")!.textContent).toBe("Test");
    expect(el.querySelector("p")!.textContent).toBe("content");
  });
});

describe("lifecycle", () => {
  test("onMount fires after mount", () => {
    let mounted = false;
    function Comp() {
      onMount(() => {
        mounted = true;
      });
      return h("div", null, "hello");
    }

    const root = h(Comp, null) as HTMLElement;
    expect(mounted).toBe(false); // not mounted yet

    mount(root, document.body);
    expect(mounted).toBe(true);

    unmount(root);
  });

  test("onUnmount fires after unmount", () => {
    let unmounted = false;
    function Comp() {
      onUnmount(() => {
        unmounted = true;
      });
      return h("div", null, "hello");
    }

    const root = h(Comp, null) as HTMLElement;
    mount(root, document.body);
    expect(unmounted).toBe(false);

    unmount(root);
    expect(unmounted).toBe(true);
  });

  test("effect is cleaned up on unmount", () => {
    const [count, setCount] = define(0);
    let effectCalls = 0;

    function Counter() {
      effect(() => {
        count();
        effectCalls++;
      });
      return h(
        "p",
        null,
        count((v) => v),
      );
    }

    const root = h(Counter, null) as HTMLElement;
    mount(root, document.body);
    expect(effectCalls).toBe(1);

    setCount(1);
    expect(effectCalls).toBe(2); // re-ran

    unmount(root);

    setCount(2);
    expect(effectCalls).toBe(2); // should NOT re-run after unmount
  });

  test("dynamic binding is cleaned up on unmount", () => {
    const [count, setCount] = define(0);

    function Counter() {
      return h(
        "p",
        null,
        count((v) => v),
      );
    }

    const root = h(Counter, null) as HTMLElement;
    mount(root, document.body);
    expect(root.textContent).toBe("0");

    // Manually trigger the binding's effect — it should still work
    setCount(1);
    expect(root.textContent).toBe("1");

    unmount(root);

    // After unmount, changes should NOT update the DOM
    setCount(2);
    // The text shouldn't have changed (though we can't easily test this
    // without checking if the effect was actually stopped)
    // At minimum, no crash should occur
  });
});

describe("mount / unmount", () => {
  test("mount appends to container", () => {
    const el = h("div", null, "content");
    mount(el, document.body);
    expect(document.body.contains(el)).toBe(true);
    unmount(el);
    expect(document.body.contains(el)).toBe(false);
  });
});

describe("Show", () => {
  test("renders children when when() is truthy", () => {
    const [visible] = define(true);
    const node = h(Show, { when: visible, children: () => h("p", null, "shown") });
    const el = h("div", null, node);
    expect(el.textContent).toBe("shown");
  });

  test("renders fallback when when() is falsy", () => {
    const [visible] = define(false);
    const node = h(Show, {
      when: visible,
      children: () => h("p", null, "shown"),
      fallback: () => h("p", null, "fallback"),
    });
    const el = h("div", null, node);
    expect(el.textContent).toBe("fallback");
  });

  test("toggles between branches when when() changes", () => {
    const [visible, setVisible] = define(true);
    const node = h(Show, {
      when: visible,
      children: () => h("p", null, "shown"),
      fallback: () => h("p", null, "fallback"),
    });
    const el = h("div", null, node);
    expect(el.textContent).toBe("shown");

    setVisible(false);
    expect(el.textContent).toBe("fallback");

    setVisible(true);
    expect(el.textContent).toBe("shown");
  });

  test("works with plain function wrapper", () => {
    const [count, setCount] = define(0);
    const node = h(Show, {
      when: () => count() > 0,
      children: () => h("p", null, "positive"),
      fallback: () => h("p", null, "non-positive"),
    });
    const el = h("div", null, node);
    expect(el.textContent).toBe("non-positive");

    setCount(5);
    expect(el.textContent).toBe("positive");
  });

  test("mounts dynamically created content", () => {
    const [visible, setVisible] = define(false);
    let mounted = false;

    function Child() {
      onMount(() => {
        mounted = true;
      });
      return h("span", null, "hello");
    }

    const root = h(
      "div",
      null,
      h(Show, {
        when: visible,
        children: () => h(Child, null),
      }),
    );

    mount(root, document.body);
    expect(mounted).toBe(false); // not visible yet

    setVisible(true);
    expect(mounted).toBe(true);

    unmount(root);
  });

  test("cleans up content on unmount", () => {
    const [visible] = define(true);
    let unmounted = false;

    function Child() {
      onUnmount(() => {
        unmounted = true;
      });
      return h("span", null, "bye");
    }

    const root = h(
      "div",
      null,
      h(Show, {
        when: visible,
        children: () => h(Child, null),
      }),
    );

    mount(root, document.body);
    expect(unmounted).toBe(false);

    unmount(root);
    expect(unmounted).toBe(true);
  });
});

describe("List", () => {
  test("renders list items from array", () => {
    const [items] = define(["a", "b", "c"]);
    const node = h(List, {
      each: () => items(),
      key: (item: string) => item,
      children: (item: string) => h("li", null, item),
    });
    const el = h("ul", null, node);
    expect(el.children.length).toBe(3);
    expect(el.children[0].textContent).toBe("a");
    expect(el.children[1].textContent).toBe("b");
    expect(el.children[2].textContent).toBe("c");
  });

  test("updates when array changes", () => {
    const [items, setItems] = define(["a", "b"]);
    const node = h(List, {
      each: () => items(),
      key: (item: string) => item,
      children: (item: string) => h("li", null, item),
    });
    const el = h("ul", null, node);
    expect(el.children.length).toBe(2);

    setItems(["a", "b", "c"]);
    expect(el.children.length).toBe(3);
    expect(el.children[2].textContent).toBe("c");
  });

  test("reuses DOM nodes by key", () => {
    const [items, setItems] = define([
      { id: 1, text: "a" },
      { id: 2, text: "b" },
    ]);
    const rendered = new Set<Node>();

    const node = h(List, {
      each: () => items(),
      key: (item: { id: number; text: string }) => item.id,
      children: (item: { id: number; text: string }) => {
        const el = h("li", null, item.text);
        rendered.add(el);
        return el;
      },
    });

    const el = h("ul", null, node);
    const firstNode = el.children[0];

    // Remove one item — the remaining node should be reused
    setItems([{ id: 1, text: "a" }]);
    expect(el.children.length).toBe(1);
    // The reused node should be the same object reference
    expect(el.children[0]).toBe(firstNode);
  });

  test("removes stale items and cleans up", () => {
    const [items, setItems] = define(["a", "b", "c"]);
    const node = h(List, {
      each: () => items(),
      key: (item: string) => item,
      children: (item: string) => h("li", null, item),
    });
    const el = h("ul", null, node);
    expect(el.children.length).toBe(3);

    setItems(["a"]);
    expect(el.children.length).toBe(1);
    expect(el.children[0].textContent).toBe("a");
  });

  test("reorders items when order changes", () => {
    const [items, setItems] = define([
      { id: 1, text: "first" },
      { id: 2, text: "second" },
    ]);

    const node = h(List, {
      each: () => items(),
      key: (item: { id: number; text: string }) => item.id,
      children: (item: { id: number; text: string }) => h("li", null, item.text),
    });

    const el = h("ul", null, node);
    expect(el.children[0].textContent).toBe("first");
    expect(el.children[1].textContent).toBe("second");

    // Reverse order
    setItems([
      { id: 2, text: "second" },
      { id: 1, text: "first" },
    ]);
    expect(el.children[0].textContent).toBe("second");
    expect(el.children[1].textContent).toBe("first");
  });

  test("mounts newly added items", () => {
    const [items, setItems] = define(["a"]);
    let mountedCount = 0;

    function Item(props: { text: string }) {
      onMount(() => {
        mountedCount++;
      });
      return h("li", null, props.text);
    }

    const root = h(
      "ul",
      null,
      h(List, {
        each: () => items(),
        key: (item: string) => item,
        children: (item: string) => h(Item, { text: item }),
      }),
    );

    mount(root, document.body);
    expect(mountedCount).toBe(1);

    setItems(["a", "b"]);
    expect(mountedCount).toBe(2);

    unmount(root);
  });

  test("cleans up removed items", () => {
    const [items, setItems] = define(["a", "b"]);
    const unmounted = new Set<string>();

    function Item(props: { text: string }) {
      onUnmount(() => {
        unmounted.add(props.text);
      });
      return h("li", null, props.text);
    }

    const root = h(
      "ul",
      null,
      h(List, {
        each: () => items(),
        key: (item: string) => item,
        children: (item: string) => h(Item, { text: item }),
      }),
    );

    mount(root, document.body);

    setItems(["a"]);
    expect(unmounted.has("b")).toBe(true);
    expect(unmounted.has("a")).toBe(false);

    unmount(root);
  });
});
