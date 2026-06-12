// @vitest-environment happy-dom
// kiaao v4 — Teleport 极限测试

import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";
import { h } from "../../src/index.ts";

let container: HTMLElement;
let target: HTMLElement;
beforeEach(() => {
  container = document.createElement("div");
  target = document.createElement("div");
  target.id = "teleport-target";
  document.body.append(container, target);
});
afterEach(() => {
  container.remove();
  target.remove();
});

describe("Teleport — basic", () => {
  test("Teleport renders content into target", () => {
    function Comp() {
      return h(Teleport, { to: "#teleport-target", children: () => h("span", null, "teleported") });
    }
    h(Comp);
    expect(target.textContent).toBe("teleported");
  });

  test("Teleport returns comment node as root", () => {
    function Comp() {
      return h(Teleport, { to: "#teleport-target", children: () => h("span") });
    }
    const el = h(Comp);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("target as element reference works", () => {
    function Comp() {
      return h(Teleport, { to: target, children: () => h("span", null, "direct") });
    }
    h(Comp);
    expect(target.textContent).toBe("direct");
  });
});

describe("Teleport — missing target", () => {
  test("non-existent selector returns placeholder comment", () => {
    function Comp() {
      return h(Teleport, { to: "#does-not-exist", children: () => h("span") });
    }
    const el = h(Comp);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("null target does not crash", () => {
    function Comp() {
      return h(Teleport, { to: null as any, children: () => h("span") });
    }
    expect(() => h(Comp)).not.toThrow();
  });
});

describe("Teleport — content types", () => {
  test("accepts static Node as children", () => {
    const span = document.createElement("span");
    span.textContent = "static";

    function Comp() {
      return h(Teleport, { to: "#teleport-target", children: span });
    }
    h(Comp);
    expect(target.textContent).toBe("static");
  });
});

// 直接导入 Teleport 测试其内部行为
import { Teleport } from "../../src/dom/teleport.ts";

describe("Teleport — direct instance", () => {
  test("appends content to target", () => {
    const el = h(Teleport, { to: target, children: () => h("span", null, "direct-test") });
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
    expect(target.textContent).toBe("direct-test");
  });

  test("multiple teleports to same target", () => {
    h(Teleport, { to: target, children: () => h("span", null, "first") });
    h(Teleport, { to: target, children: () => h("span", null, "second") });
    expect(target.textContent).toContain("first");
    expect(target.textContent).toContain("second");
  });
});
