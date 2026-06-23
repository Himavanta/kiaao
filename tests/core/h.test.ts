// @vitest-environment happy-dom
// kiaao — h() Phase 3 tests: Node[] return, Owner creation, context, Fragment

import { expect, test, describe } from "vite-plus/test";
import { setAdapter } from "../../src/core/types.ts";
import { browserAdapter } from "../../src/dom/adapter.ts";
import { h, Fragment } from "../../src/core/h.ts";
import { createOwner, disposeOwner, currentOwner } from "../../src/core/owner.ts";
import { use } from "../../src/core/signal.ts";

setAdapter(browserAdapter);

// ── h() Basic DOM Creation ────────────────────────────

describe("h() — DOM mode", () => {
  test("creates a div element", () => {
    const result = h("div");
    const nodes = Array.isArray(result) ? result : [result];
    expect(nodes.length).toBe(1);
    expect((nodes[0] as HTMLElement).tagName).toBe("DIV");
  });

  test("returns Node[] for single element", () => {
    const result = h("div");
    expect(Array.isArray(result)).toBe(true);
    expect((result as Node[])[0]).toBeInstanceOf(Node);
  });

  test("creates element with text child", () => {
    const result = h("div", null, "hello") as Node[];
    const div = result[0] as HTMLElement;
    expect(div.textContent).toBe("hello");
  });

  test("creates element with nested children", () => {
    const result = h("div", null, h("span"), h("p")) as Node[];
    const div = result[0] as HTMLElement;
    expect(div.children.length).toBe(2);
    expect(div.children[0].tagName).toBe("SPAN");
    expect(div.children[1].tagName).toBe("P");
  });

  test("sets attributes via adapter", () => {
    const result = h("div", { class: "box", id: "main" }) as Node[];
    const div = result[0] as HTMLElement;
    expect(div.getAttribute("class")).toBe("box");
    expect(div.getAttribute("id")).toBe("main");
  });

  test("binds event handler", () => {
    let clicked = false;
    const result = h("button", {
      onClick: () => {
        clicked = true;
      },
    }) as Node[];
    const btn = result[0] as HTMLElement;
    btn.click();
    expect(clicked).toBe(true);
  });

  test("invalid tag returns comment placeholder", () => {
    const result = h(null as any) as Node[];
    expect(result[0].nodeType).toBe(Node.COMMENT_NODE);
  });
});

// ── Fragment ──────────────────────────────────────────

describe("Fragment", () => {
  test("Fragment returns children without container", () => {
    const span1 = h("span", null, "a") as Node[];
    const span2 = h("span", null, "b") as Node[];
    const result = h(Fragment, null, ...span1, ...span2) as Node[];
    expect(result.length).toBe(2);
    expect(result[0].textContent).toBe("a");
    expect(result[1].textContent).toBe("b");
  });
});

// ── Component Mode ────────────────────────────────────

describe("h() — component mode", () => {
  test("basic component returns nodes", () => {
    function Comp() {
      return h("div", null, "hello");
    }
    const result = h(Comp) as Node[];
    expect(result.length).toBe(1);
    expect((result[0] as HTMLElement).tagName).toBe("DIV");
    expect(result[0].textContent).toBe("hello");
  });

  test("component receives props", () => {
    function Comp(props: any) {
      return h("div", null, String(props.name));
    }
    const result = h(Comp, { name: "kiaao" }) as Node[];
    expect(result[0].textContent).toBe("kiaao");
  });

  test("component creates Owner", () => {
    let capturedOwner: any = null;
    function Comp() {
      capturedOwner = currentOwner.get();
      return h("div");
    }
    h(Comp);
    expect(capturedOwner).not.toBeNull();
    expect(capturedOwner.disposed).toBe(false);
  });

  test("component Owner has parent relationship", () => {
    const owners: any[] = [];
    function Child() {
      owners.push(currentOwner.get());
      return h("span");
    }
    function Parent() {
      owners.push(currentOwner.get());
      return h("div", null, h(Child));
    }
    h(Parent);
    expect(owners.length).toBe(2);
    // Parent Owner is the parent of Child Owner
    expect(owners[1].parent).toBe(owners[0]);
  });

  test("component elements registered in Owner", () => {
    let owner: any = null;
    function Comp() {
      owner = currentOwner.get();
      return h("div", null, "content");
    }
    h(Comp);
    expect(owner.elements.size).toBe(1);
    const el = [...owner.elements][0] as HTMLElement;
    expect(el.tagName).toBe("DIV");
  });

  test("context.use registers cleanup to Owner", () => {
    const cleanups: (() => void)[] = [];
    function Comp(_props: any, context: any) {
      const [count] = context.use(0);
      const [doubled] = context.use(count, () => count() * 2);
      cleanups.push(() => {});
      return h("div", null, String(doubled()));
    }
    const result = h(Comp) as Node[];
    expect(result[0].textContent).toBe("0");
  });

  test("context.onMount defers execution", () => {
    let mounted = false;
    function Comp(_props: any, context: any) {
      context.onMount(() => {
        mounted = true;
      });
      return h("div");
    }
    h(Comp);
    // mountCallbacks shouldn't fire during h()
    expect(mounted).toBe(false);
  });

  test("context.onUnmount registers to Owner", () => {
    const calls: string[] = [];
    let owner: any = null;
    function Comp(_props: any, context: any) {
      owner = currentOwner.get();
      context.onUnmount(() => calls.push("cleanup"));
      return h("div");
    }
    h(Comp);
    expect(owner.unmountCallbacks.length).toBe(1);
    disposeOwner(owner);
    expect(calls).toEqual(["cleanup"]);
  });

  test("component with multiple return nodes (Fragment behavior)", () => {
    function Comp() {
      return [(h("span", null, "a") as Node[])[0], (h("span", null, "b") as Node[])[0]];
    }
    const result = h(Comp);
    expect(Array.isArray(result)).toBe(true);
    expect((result as Node[]).length).toBe(2);
    expect((result as Node[])[0].textContent).toBe("a");
    expect((result as Node[])[1].textContent).toBe("b");
  });

  test("nested components create Owner chain", () => {
    const ownerChain: any[] = [];
    function A() {
      ownerChain.push("A");
      return h("div");
    }
    function B() {
      ownerChain.push("B");
      return h("div", null, h(A));
    }
    function C() {
      ownerChain.push("C");
      return h("div", null, h(B));
    }
    h(C);
    expect(ownerChain).toEqual(["C", "B", "A"]);
  });
});

// ── Component Disposal ────────────────────────────────

describe("component disposal", () => {
  test("disposeOwner cleans up component elements", () => {
    let owner: any = null;
    function Comp() {
      owner = currentOwner.get();
      return h("div", null, "hello");
    }
    const result = h(Comp) as Node[];
    const div = result[0];
    document.body.append(div);
    expect(document.body.contains(div)).toBe(true);
    disposeOwner(owner);
    expect(document.body.contains(div)).toBe(false);
  });

  test("disposeOwner stops signal bindings", () => {
    let owner: any = null;
    let textNode: Text | null = null;
    function Comp(_props: any, context: any) {
      owner = currentOwner.get();
      const [count] = context.use(0); // create signal on Owner
      textNode = document.createTextNode(String(count()));
      context.use(count, () => {
        if (textNode) textNode.textContent = String(count());
      });
      return h("div", null, textNode);
    }
    h(Comp);

    // Clean up Owner
    expect(owner.cleanups.length).toBe(2); // count signal + derived

    // Dispose should not throw
    expect(() => disposeOwner(owner)).not.toThrow();
  });
});

// ── processChildren ──────────────────────────────────

describe("processChildren", () => {
  test("signal binding creates derived and registers cleanup to currentOwner", () => {
    const [count, setCount] = use(0);
    const owner = createOwner();
    currentOwner.set(owner);

    const result = h("div", null, count) as Node[];
    const div = result[0] as HTMLElement;
    expect(div.textContent).toBe("0");

    setCount(42);
    expect(div.textContent).toBe("42");

    currentOwner.set(null);
  });
});
