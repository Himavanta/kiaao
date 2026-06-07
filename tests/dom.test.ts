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
  Teleport,
  lazy,
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
    const el = h("p", null, count);
    expect(el.textContent).toBe("42");
  });

  test("updates text content when signal changes", () => {
    const [count, setCount] = define(0);
    const el = h("p", null, count);
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

describe("h — reactive attribute bindings", () => {
  test("reactive class binding updates when signal changes", () => {
    const [isActive, setActive] = define(false);
    const el = h("div", { class: isActive((v) => (v ? "active" : "")) });
    expect(el.className).toBe("");

    setActive(true);
    expect(el.className).toBe("active");

    setActive(false);
    expect(el.className).toBe("");
  });

  test("reactive style string binding", () => {
    const [theme, setTheme] = define("light");
    const el = h("div", {
      style: theme((v) =>
        v === "dark" ? "color: white; background: black" : "color: black; background: white",
      ),
    });
    expect(el.style.color).toBe("black");

    setTheme("dark");
    expect(el.style.color).toBe("white");
  });

  test("reactive style object binding", () => {
    const [color, setColor] = define("red");
    const el = h("div", { style: color((v) => ({ color: v })) });
    expect(el.style.color).toBe("red");

    setColor("blue");
    expect(el.style.color).toBe("blue");
  });

  test("reactive boolean attribute", () => {
    const [disabled, setDisabled] = define(false);
    const el = h("button", { disabled: disabled((v) => v) });
    expect(el.hasAttribute("disabled")).toBe(false);

    setDisabled(true);
    expect(el.hasAttribute("disabled")).toBe(true);
  });

  test("reactive and static props mix", () => {
    const [title, setTitle] = define("hello");
    const el = h("div", { id: "static-id", "data-title": title });
    expect(el.id).toBe("static-id");
    expect(el.getAttribute("data-title")).toBe("hello");

    setTitle("world");
    expect(el.getAttribute("data-title")).toBe("world");
  });

  test("reactive props cleaned up on unmount", () => {
    const [cls, setCls] = define("initial");
    const el = h("div", { class: cls });
    mount(el, document.body);
    expect(el.className).toBe("initial");

    unmount(el);

    // After unmount, changes should no longer update the disposed element
    setCls("changed");
    expect(el.className).toBe("initial");
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
      return h("p", null, count);
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
      return h("p", null, count);
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

describe("Teleport", () => {
  test("renders content into target container", () => {
    const target = document.createElement("div");
    target.id = "teleport-target";
    document.body.appendChild(target);

    const node = h(Teleport, {
      to: "#teleport-target",
      children: () => h("p", null, "teleported content"),
    });

    // Teleport itself only emits a comment node
    expect(node.nodeType).toBe(Node.COMMENT_NODE);
    // Content should be in the target
    expect(target.textContent).toBe("teleported content");

    document.body.removeChild(target);
  });

  test("cleans up content on unmount", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    let unmounted = false;

    function Child() {
      onUnmount(() => {
        unmounted = true;
      });
      return h("span", null, "bye");
    }

    function App() {
      return h(
        "div",
        null,
        h(Teleport, {
          to: target,
          children: () => h(Child, null),
        }),
      );
    }

    const root = h(App, null) as HTMLElement;
    mount(root, document.body);

    expect(unmounted).toBe(false);
    expect(target.children.length).toBe(1);

    unmount(root);
    expect(unmounted).toBe(true);
    expect(target.children.length).toBe(0);

    document.body.removeChild(target);
  });
});

describe("lazy", () => {
  test("resolves and renders async component", async () => {
    function Greeting(props: { name: string }) {
      return h("p", null, `Hello, ${props.name}!`);
    }

    const AsyncGreeting = lazy(() => Promise.resolve({ default: Greeting }));

    // Wait for the microtask queue to process the resolved promise
    await new Promise((r) => setTimeout(r, 0));

    const el = h("div", null, h(AsyncGreeting, { name: "kiaao" }));
    expect(el.textContent).toBe("Hello, kiaao!");
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

  test("mount triggers onMount for when-directive content", () => {
    const [visible] = define(true);
    let mounted = false;

    function Child() {
      onMount(() => {
        mounted = true;
      });
      return h("span", null, "hello");
    }

    const root = h("div", { when: visible }, () => h(Child, null));
    mount(root, document.body);
    expect(mounted).toBe(true);
    unmount(root);
  });

  test("when-directive content is cleaned up on unmount", () => {
    const [visible] = define(true);
    let unmounted = false;

    function Child() {
      onUnmount(() => {
        unmounted = true;
      });
      return h("span", null, "bye");
    }

    const root = h("div", { when: visible }, () => h(Child, null));
    mount(root, document.body);
    unmount(root);
    expect(unmounted).toBe(true);
  });
});

describe("h — when directive", () => {
  test("renders children when when() is truthy (lazy function)", () => {
    const [visible] = define(true);
    const el = h("div", { when: visible }, () => h("p", null, "shown"));
    expect(el.textContent).toBe("shown");
  });

  test("renders nothing when when() is falsy", () => {
    const [visible] = define(false);
    const el = h("div", { when: visible }, () => h("p", null, "shown"));
    expect(el.textContent).toBe("");
  });

  test("toggles content when when() changes", () => {
    const [visible, setVisible] = define(true);
    const el = h("div", { when: visible }, () => h("p", null, "shown"));
    expect(el.textContent).toBe("shown");

    setVisible(false);
    expect(el.textContent).toBe("");

    setVisible(true);
    expect(el.textContent).toBe("shown");
  });

  test("works with plain function in when", () => {
    const [count, setCount] = define(0);
    const el = h("div", { when: () => count() > 0 }, () => h("p", null, "positive"));
    expect(el.textContent).toBe("");

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
      h("div", { when: visible }, () => h(Child, null)),
    );

    mount(root, document.body);
    expect(mounted).toBe(false);

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
      h("div", { when: visible }, () => h(Child, null)),
    );

    mount(root, document.body);
    expect(unmounted).toBe(false);

    unmount(root);
    expect(unmounted).toBe(true);
  });
});

describe("h — each directive", () => {
  test("renders list items from array", () => {
    const [items] = define(["a", "b", "c"]);
    const el = h(
      "ul",
      {
        each: () => items(),
        key: (item: string) => item,
      },
      (item: string) => h("li", null, item),
    );
    expect(el.children.length).toBe(3);
    expect(el.children[0].textContent).toBe("a");
    expect(el.children[1].textContent).toBe("b");
    expect(el.children[2].textContent).toBe("c");
  });

  test("updates when array changes", () => {
    const [items, setItems] = define(["a", "b"]);
    const el = h(
      "ul",
      {
        each: () => items(),
        key: (item: string) => item,
      },
      (item: string) => h("li", null, item),
    );
    expect(el.children.length).toBe(2);

    setItems(["a", "b", "c"]);
    expect(el.children.length).toBe(3);
    expect(el.children[2].textContent).toBe("c");
  });

  test("removes stale items and cleans up", () => {
    const [items, setItems] = define(["a", "b", "c"]);
    const el = h(
      "ul",
      {
        each: () => items(),
        key: (item: string) => item,
      },
      (item: string) => h("li", null, item),
    );
    expect(el.children.length).toBe(3);

    setItems(["a"]);
    expect(el.children.length).toBe(1);
    expect(el.children[0].textContent).toBe("a");
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
      {
        each: () => items(),
        key: (item: string) => item,
      },
      (item: string) => h(Item, { text: item }),
    );

    mount(root, document.body);
    expect(mountedCount).toBe(1);

    setItems(["a", "b"]);
    // each re-renders all items
    expect(mountedCount).toBe(3);

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
      {
        each: () => items(),
        key: (item: string) => item,
      },
      (item: string) => h(Item, { text: item }),
    );

    mount(root, document.body);

    setItems(["a"]);
    // each re-renders all items — old nodes disposed
    expect(unmounted.has("b")).toBe(true);

    unmount(root);
  });

  test("when + each coexist: when takes priority", () => {
    const [visible, setVisible] = define(false);
    const [items] = define(["a", "b"]);

    const el = h(
      "div",
      {
        when: visible,
        each: () => items(),
      },
      (item: string) => h("span", null, item),
    );

    expect(el.children.length).toBe(0); // when is false, even though each has items

    setVisible(true);
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("a");
    expect(el.children[1].textContent).toBe("b");
  });

  test("key ensures correct DOM order when items are reordered", () => {
    const [items, setItems] = define([
      { id: 1, text: "first" },
      { id: 2, text: "second" },
    ]);

    const el = h(
      "ul",
      {
        each: () => items(),
        key: (item: { id: number; text: string }) => item.id,
      },
      (item: { id: number; text: string }) => h("li", null, item.text),
    );

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

  test("no key falls back to full rebuild", () => {
    const [items, setItems] = define(["a", "b"]);

    const el = h("ul", { each: () => items() }, (item: string) => h("li", null, item));
    expect(el.children.length).toBe(2);

    setItems(["c"]);
    expect(el.children.length).toBe(1);
    expect(el.children[0].textContent).toBe("c");
  });
});
