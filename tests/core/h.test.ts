// @vitest-environment happy-dom
// kiaao — h() Phase 3 tests: HResult return, Owner creation, context, Fragment

import { expect, test, describe } from "vite-plus/test";
import { setAdapter, isHResult } from "../../src/core/types.ts";
import { browserAdapter } from "../../src/dom/adapter.ts";
import { h, Fragment } from "../../src/core/h.ts";
import { disposeOwner } from "../../src/core/owner.ts";
import { use } from "../../src/core/signal.ts";

setAdapter(browserAdapter);

function nodes(hResult: any): Node[] {
  return isHResult(hResult) ? [...hResult.nodes] : [];
}

function firstNode(hResult: any): Node {
  return nodes(hResult)[0];
}

// ── h() Basic DOM Creation ────────────────────────────

describe("h() — DOM mode", () => {
  test("creates a div element", () => {
    const result = h("div");
    expect(nodes(result).length).toBe(1);
    expect((firstNode(result) as HTMLElement).tagName).toBe("DIV");
  });

  test("returns HResult with nodes array", () => {
    const result = h("div");
    expect(isHResult(result)).toBe(true);
    expect(result.nodes).toBeDefined();
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(result.nodes[0]).toBeInstanceOf(Node);
  });

  test("creates element with text child", () => {
    const { nodes: nds } = h("div", null, "hello") as any;
    const div = nds[0] as HTMLElement;
    expect(div.textContent).toBe("hello");
  });

  test("creates element with nested children", () => {
    const { nodes: nds } = h("div", null, h("span"), h("p")) as any;
    const div = nds[0] as HTMLElement;
    expect(div.children.length).toBe(2);
    expect(div.children[0].tagName).toBe("SPAN");
    expect(div.children[1].tagName).toBe("P");
  });

  test("sets attributes via adapter", () => {
    const { nodes: nds } = h("div", { class: "box", id: "main" }) as any;
    const div = nds[0] as HTMLElement;
    expect(div.getAttribute("class")).toBe("box");
    expect(div.getAttribute("id")).toBe("main");
  });

  test("binds event handler", () => {
    let clicked = false;
    const { nodes: nds } = h("button", {
      onClick: () => {
        clicked = true;
      },
    }) as any;
    const btn = nds[0] as HTMLElement;
    btn.click();
    expect(clicked).toBe(true);
  });

  test("invalid tag returns HResult with comment", () => {
    const result = h(null as any);
    expect(isHResult(result)).toBe(true);
    expect(result.nodes[0].nodeType).toBe(Node.COMMENT_NODE);
  });
});

// ── Fragment ──────────────────────────────────────────

describe("Fragment", () => {
  test("Fragment returns children without container", () => {
    const span1 = h("span", null, "a");
    const span2 = h("span", null, "b");
    const { nodes: nds } = h(Fragment, null, ...span1.nodes, ...span2.nodes) as any;
    expect(nds.length).toBe(2);
    expect(nds[0].textContent).toBe("a");
    expect(nds[1].textContent).toBe("b");
  });
});

// ── Component Mode ────────────────────────────────────

describe("h() — component mode", () => {
  test("basic component returns HResult with nodes", () => {
    function Comp() {
      return h("div", null, "hello");
    }
    const { nodes: nds } = h(Comp) as any;
    expect(nds.length).toBe(1);
    expect((nds[0] as HTMLElement).tagName).toBe("DIV");
    expect(nds[0].textContent).toBe("hello");
  });

  test("component receives props", () => {
    function Comp(props: any) {
      return h("div", null, String(props.name));
    }
    const { nodes: nds } = h(Comp, { name: "kiaao" }) as any;
    expect(nds[0].textContent).toBe("kiaao");
  });

  test("component creates Owner", () => {
    function Comp() {
      return h("div");
    }
    const result = h(Comp);
    expect(isHResult(result)).toBe(true);
    expect(result.owner).not.toBeNull();
    expect(result.owner!.disposed).toBe(false);
  });

  test("component Owner has parent relationship", () => {
    const owners: any[] = [];
    function Child() {
      return h("span");
    }
    function Parent() {
      const r = h("div", null, h(Child));
      owners.push(r.owner);
      return r;
    }
    h(Parent);
    expect(owners.length).toBe(1);
  });

  test("component elements registered in Owner", () => {
    function Comp() {
      return h("div", null, "content");
    }
    const result = h(Comp);
    expect(result.owner!.elements.size).toBe(1);
    const el = [...result.owner!.elements][0] as HTMLElement;
    expect(el.tagName).toBe("DIV");
  });

  test("context.use registers cleanup to Owner", () => {
    function Comp(_props: any, context: any) {
      const [count] = context.use(0);
      const [doubled] = context.use(count, () => count() * 2);
      return h("div", null, String(doubled()));
    }
    const { nodes: nds } = h(Comp) as any;
    expect(nds[0].textContent).toBe("0");
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
    expect(mounted).toBe(false);
  });

  test("context.onUnmount registers to Owner", () => {
    const calls: string[] = [];
    function Comp(_props: any, context: any) {
      context.onUnmount(() => calls.push("cleanup"));
      return h("div");
    }
    const result = h(Comp);
    expect(result.owner!.unmountCallbacks.length).toBe(1);
    disposeOwner(result.owner!);
    expect(calls).toEqual(["cleanup"]);
  });

  test("component with multiple return nodes (Fragment behavior)", () => {
    function Comp() {
      return [h("span", null, "a"), h("span", null, "b")];
    }
    const result = h(Comp);
    expect(isHResult(result)).toBe(true);
    expect(result.nodes.length).toBe(2);
    expect(result.nodes[0].textContent).toBe("a");
    expect(result.nodes[1].textContent).toBe("b");
  });

  test("nested components create Owner chain", () => {
    const ownerChain: string[] = [];
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
    function Comp() {
      return h("div", null, "hello");
    }
    const result = h(Comp);
    const owner = result.owner!;
    const div = result.nodes[0];
    document.body.append(div);
    expect(document.body.contains(div)).toBe(true);
    disposeOwner(owner);
    expect(document.body.contains(div)).toBe(false);
  });
});

// ── processChildren via h() ──────────────────────────

describe("processChildren via h()", () => {
  test("signal binding creates derived and registers cleanup", () => {
    const [count, setCount] = use(0);
    const { nodes: nds } = h("div", null, count) as any;
    const div = nds[0] as HTMLElement;
    expect(div.textContent).toBe("0");
    setCount(42);
    expect(div.textContent).toBe("42");
  });
});
