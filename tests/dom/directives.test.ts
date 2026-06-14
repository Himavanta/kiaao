// @vitest-environment happy-dom
// kiaao — when/each directive integration tests

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";

describe("when — boolean mode", () => {
  test("shows content when condition is truthy", () => {
    const [visible, setVisible] = use(true);
    const el = h(
      "section",
      { when: visible, style: "display: contents" },
      h("span", null, "Visible"),
    );

    expect(el.textContent).toBe("Visible");

    setVisible(false);
    expect(el.textContent).toBe("");
  });

  test("shows else content when condition is falsy", () => {
    const [visible, setVisible] = use(false);
    const el = h(
      "div",
      { when: visible, else: () => h("p", null, "Else content") },
      h("span", null, "Main content"),
    );

    expect(el.textContent).toBe("Else content");

    setVisible(true);
    expect(el.textContent).toBe("Main content");
  });

  test("toggles content back and forth", () => {
    const [visible, setVisible] = use(true);
    const el = h("div", { when: visible }, h("span", null, "Content"));

    expect(el.textContent).toBe("Content");

    setVisible(false);
    expect(el.textContent).toBe("");

    setVisible(true);
    expect(el.textContent).toBe("Content");
  });
});

describe("when — mapping table mode", () => {
  test("renders branch matching the condition value", () => {
    const [status, setStatus] = use("loading");
    const el = h(
      "div",
      { when: status },
      {
        loading: () => h("p", null, "Loading..."),
        error: () => h("p", null, "Error!"),
        success: () => h("p", null, "Success!"),
      },
    );

    expect(el.textContent).toBe("Loading...");

    setStatus("success");
    expect(el.textContent).toBe("Success!");

    setStatus("error");
    expect(el.textContent).toBe("Error!");
  });

  test("falls back to else when key not in map", () => {
    const [status, setStatus] = use("unknown");
    const el = h(
      "div",
      { when: status, else: () => h("p", null, "Unknown status") },
      {
        loading: () => h("p", null, "Loading..."),
      },
    );

    expect(el.textContent).toBe("Unknown status");

    setStatus("loading");
    expect(el.textContent).toBe("Loading...");
  });
});

describe("each", () => {
  test("renders a list from static array", () => {
    // each 传递给 childFn 的是信号 getter，可直接传给 h() 自动绑定
    const el = h(
      "ul",
      { each: ["a", "b", "c"], key: (item: string) => item },
      (item: () => string) => h("li", null, item),
    );

    expect(el.children.length).toBe(3);
    expect(el.children[0].textContent).toBe("a");
    expect(el.children[1].textContent).toBe("b");
    expect(el.children[2].textContent).toBe("c");
  });

  test("reactively updates when source signal changes", () => {
    const [items, setItems] = use(["a", "b"]);
    const el = h("ul", { each: items, key: (item: string) => item }, (item: () => string) =>
      h("li", null, item),
    );

    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("a");

    setItems(["a", "b", "c"]);
    expect(el.children.length).toBe(3);
    expect(el.children[2].textContent).toBe("c");
  });

  test("removes items from list", () => {
    const [items, setItems] = use(["a", "b", "c"]);
    const el = h("ul", { each: items, key: (item: string) => item }, (item: () => string) =>
      h("li", null, item),
    );

    expect(el.children.length).toBe(3);

    setItems(["a", "c"]);
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("a");
    expect(el.children[1].textContent).toBe("c");
  });

  test("handles empty array", () => {
    const [items] = use<string[]>([]);
    const el = h("ul", { each: items, key: (item: string) => item }, (item: () => string) =>
      h("li", null, item),
    );

    expect(el.children.length).toBe(0);
  });
});

describe("when + each nested", () => {
  test("each inside when condition", () => {
    const [visible, setVisible] = use(true);
    const [items] = use(["x", "y"]);

    const el = h(
      "div",
      { when: visible },
      h("ul", { each: items, key: (item: string) => item }, (item: () => string) =>
        h("li", null, item),
      ),
    );

    expect(el.children.length).toBe(1);
    expect(el.children[0].children.length).toBe(2);

    setVisible(false);
    expect(el.children.length).toBe(0);
  });
});

describe("each — with reactive items", () => {
  test("each with signal getter as source", () => {
    const [items, setItems] = use([1, 2, 3]);
    const el = h("div", { each: items, key: (item: number) => item }, (item: () => number) =>
      h("span", null, item),
    );

    expect(el.children.length).toBe(3);

    setItems([4, 5]);
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("4");
  });
});
