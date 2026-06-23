// @vitest-environment happy-dom
// kiaao — Phase 4 tests: when/each directives with Owner-based cleanup

import { expect, test, describe } from "vite-plus/test";
import { setAdapter } from "../../src/core/types.ts";
import { browserAdapter } from "../../src/dom/adapter.ts";
import { h } from "../../src/core/h.ts";
import { use } from "../../src/core/signal.ts";
import { createOwner, disposeOwner, currentOwner } from "../../src/core/owner.ts";
import { direct } from "../../src/core/direct.ts";

setAdapter(browserAdapter);

// ── when: Basic Toggle ────────────────────────────────

describe("when directive — basic", () => {
  test("renders children when truthy", () => {
    const [show] = use(true);
    const { nodes } = h("div", { when: show }, h("span", null, "content"));
    const div = nodes[0] as HTMLElement;
    expect(div.children.length).toBe(1);
    expect(div.children[0].textContent).toBe("content");
  });

  test("hides children when falsy", () => {
    const [show] = use(false);
    const { nodes } = h("div", { when: show }, h("span", null, "content"));
    const div = nodes[0] as HTMLElement;
    expect(div.children.length).toBe(0);
  });

  test("shows else content when falsy", () => {
    const [show] = use(false);
    const { nodes } = h("div", { when: show, else: () => h("p", null, "fallback") });
    const div = nodes[0] as HTMLElement;
    expect(div.children.length).toBe(1);
    expect(div.children[0].textContent).toBe("fallback");
  });

  test("toggles on signal change", () => {
    const [show, setShow] = use(true);
    const { nodes } = h("div", { when: show }, h("span", null, "content"));
    const div = nodes[0] as HTMLElement;
    expect(div.children.length).toBe(1);

    setShow(false);
    expect(div.children.length).toBe(0);

    setShow(true);
    expect(div.children.length).toBe(1);
  });
});

// ── when: Mapping Mode ───────────────────────────────

describe("when directive — mapping mode", () => {
  test("renders matching branch by key", () => {
    const [status] = use("loading");
    const { nodes } = h(
      "div",
      { when: status },
      {
        loading: () => h("span", null, "Loading..."),
        ready: () => h("p", null, "Ready"),
      },
    );
    const div = nodes[0] as HTMLElement;
    expect(div.children[0].textContent).toBe("Loading...");
  });

  test("switches branch on signal change", () => {
    const [status, setStatus] = use("loading");
    const { nodes } = h(
      "div",
      { when: status },
      {
        loading: () => h("span", null, "Loading..."),
        ready: () => h("p", null, "Ready"),
      },
    );
    const div = nodes[0] as HTMLElement;
    expect(div.children[0].textContent).toBe("Loading...");

    setStatus("ready");
    expect(div.children[0].textContent).toBe("Ready");
  });
});

// ── each: Basic ───────────────────────────────────────

describe("each directive — basic", () => {
  test("renders list items", () => {
    const [items] = use(["a", "b", "c"]);
    const { nodes } = h("ul", { each: items }, (item: any, _index: number) => h("li", null, item));
    const ul = nodes[0] as HTMLElement;
    expect(ul.children.length).toBe(3);
    expect(ul.children[0].textContent).toBe("a");
    expect(ul.children[1].textContent).toBe("b");
    expect(ul.children[2].textContent).toBe("c");
  });

  test("updates on array change", () => {
    const [items, setItems] = use(["a", "b"]);
    const { nodes } = h("ul", { each: items }, (item: any) => h("li", null, item));
    const ul = nodes[0] as HTMLElement;
    expect(ul.children.length).toBe(2);

    setItems(["a", "b", "c"]);
    expect(ul.children.length).toBe(3);
  });

  test("removes items on shrink", () => {
    const [items, setItems] = use(["a", "b", "c"]);
    const { nodes } = h("ul", { each: items }, (item: any) => h("li", null, item));
    const ul = nodes[0] as HTMLElement;
    expect(ul.children.length).toBe(3);

    setItems(["a"]);
    expect(ul.children.length).toBe(1);
    expect(ul.children[0].textContent).toBe("a");
  });

  test("empty array renders nothing", () => {
    const [items] = use([]);
    const { nodes } = h("ul", { each: items }, (item: any) => h("li", null, item));
    const ul = nodes[0] as HTMLElement;
    expect(ul.children.length).toBe(0);
  });
});

// ── each: with key ────────────────────────────────────

describe("each directive — with key", () => {
  test("uses key function for identity", () => {
    const [items] = use([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);
    const { nodes } = h("ul", { each: items, key: (item: any) => item.id }, (item: any) =>
      h("li", null, item().name),
    );
    const ul = nodes[0] as HTMLElement;
    expect(ul.children.length).toBe(2);
  });
});

// ── each: with signal source ──────────────────────────

describe("each directive — reactive source", () => {
  test("reacts to signal changes", () => {
    const [items, setItems] = use(["x", "y"]);
    const { nodes } = h("ul", { each: items }, (item: any) => h("li", null, item));
    const ul = nodes[0] as HTMLElement;
    expect(ul.children.length).toBe(2);

    setItems(["p", "q", "r"]);
    expect(ul.children.length).toBe(3);
    expect(ul.children[0].textContent).toBe("p");
  });
});

// ── Directive System ──────────────────────────────────

describe("directive system", () => {
  test("direct marks function with DIRECT_KEY", () => {
    const myDirective = direct((_el: Element, _props: any, _ctx: any) => {});
    expect(typeof myDirective).toBe("function");
  });

  test("directive onMount registers to currentOwner", () => {
    let mountCalled = false;
    const TestDir = direct((_el: Element, _props: any, ctx: any) => {
      ctx.onMount(() => {
        mountCalled = true;
      });
    });

    const owner = createOwner();
    currentOwner.set(owner);
    h(TestDir, null, h("div"));
    currentOwner.set(null);

    // onMount should be registered to the Owner, not fired yet
    expect(owner.mountCallbacks.length).toBe(1);
    expect(mountCalled).toBe(false);
  });

  test("directive onUnmount registers to currentOwner", () => {
    let unmountCalled = false;
    const TestDir = direct((_el: Element, _props: any, ctx: any) => {
      ctx.onUnmount(() => {
        unmountCalled = true;
      });
    });

    const owner = createOwner();
    currentOwner.set(owner);
    h(TestDir, null, h("div"));
    currentOwner.set(null);

    expect(owner.unmountCallbacks.length).toBe(1);
    disposeOwner(owner);
    expect(unmountCalled).toBe(true);
  });
});
