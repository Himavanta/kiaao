// @vitest-environment happy-dom
// kiaao — Portal 极限测试

import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";
import { h } from "../../src/index.ts";
import { unmount } from "../../src/dom/component.ts";

let container: HTMLElement;
let target: HTMLElement;
beforeEach(() => {
  container = document.createElement("div");
  target = document.createElement("div");
  target.id = "portal-target";
  document.body.append(container, target);
});
afterEach(() => {
  container.remove();
  target.remove();
});

describe("Portal — basic", () => {
  test("Portal renders content into target", () => {
    function Comp() {
      return h(Portal, { to: "#portal-target", children: h("span", null, "portaled") });
    }
    h(Comp);
    expect(target.textContent).toBe("portaled");
  });

  test("Portal returns comment node as root", () => {
    function Comp() {
      return h(Portal, { to: "#portal-target", children: h("span") });
    }
    const el = h(Comp);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("target as element reference works", () => {
    function Comp() {
      return h(Portal, { to: target, children: h("span", null, "direct") });
    }
    h(Comp);
    expect(target.textContent).toBe("direct");
  });
});

describe("Portal — missing target", () => {
  test("non-existent selector returns placeholder comment", () => {
    function Comp() {
      return h(Portal, { to: "#does-not-exist", children: h("span") });
    }
    const el = h(Comp);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("null target does not crash", () => {
    function Comp() {
      return h(Portal, { to: null as any, children: h("span") });
    }
    expect(() => h(Comp)).not.toThrow();
  });
});

describe("Portal — content types", () => {
  test("accepts static Node as children", () => {
    const span = document.createElement("span");
    span.textContent = "static";

    function Comp() {
      return h(Portal, { to: "#portal-target", children: span });
    }
    h(Comp);
    expect(target.textContent).toBe("static");
  });
});

// 直接导入 Portal 测试其内部行为
import { Portal } from "../../src/dom/portal.ts";

describe("Portal — direct instance", () => {
  test("appends content to target", () => {
    const el = h(Portal, { to: target, children: h("span", null, "direct-test") });
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
    expect(target.textContent).toBe("direct-test");
  });

  test("multiple portals to same target", () => {
    h(Portal, { to: target, children: h("span", null, "first") });
    h(Portal, { to: target, children: h("span", null, "second") });
    expect(target.textContent).toContain("first");
    expect(target.textContent).toContain("second");
  });
});

describe("Portal — cleanup after fix", () => {
  test("content removed when component unmounts", () => {
    function Comp() {
      return h(Portal, { to: "#portal-target", children: h("span", null, "cleanup") });
    }
    const el = h(Comp);
    expect(target.textContent).toBe("cleanup");

    unmount(el as HTMLElement);
    expect(target.textContent).toBe("");
  });

  test("content cleaned up even if target has other children", () => {
    target.textContent = "existing";

    function Comp() {
      return h(Portal, { to: "#portal-target", children: h("span", null, "added") });
    }
    const el = h(Comp);
    expect(target.textContent).toContain("existing");
    expect(target.textContent).toContain("added");

    unmount(el as HTMLElement);
    expect(target.textContent).toBe("existing");
  });

  test("static children cleaned up on unmount", () => {
    const span = document.createElement("span");
    span.textContent = "static";

    function Comp() {
      return h(Portal, { to: "#portal-target", children: span });
    }
    const el = h(Comp);
    expect(target.textContent).toBe("static");

    unmount(el as HTMLElement);
    expect(target.textContent).toBe("");
  });
});
