// @vitest-environment happy-dom
// kiaao v4 — Teleport 极限测试

import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";
import { h } from "../../src/index.ts";
import { unmount } from "../../src/dom/component.ts";

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
      return h(Teleport, { to: "#teleport-target", children: h("span", null, "teleported") });
    }
    h(Comp);
    expect(target.textContent).toBe("teleported");
  });

  test("Teleport returns comment node as root", () => {
    function Comp() {
      return h(Teleport, { to: "#teleport-target", children: h("span") });
    }
    const el = h(Comp);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("target as element reference works", () => {
    function Comp() {
      return h(Teleport, { to: target, children: h("span", null, "direct") });
    }
    h(Comp);
    expect(target.textContent).toBe("direct");
  });
});

describe("Teleport — missing target", () => {
  test("non-existent selector returns placeholder comment", () => {
    function Comp() {
      return h(Teleport, { to: "#does-not-exist", children: h("span") });
    }
    const el = h(Comp);
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("null target does not crash", () => {
    function Comp() {
      return h(Teleport, { to: null as any, children: h("span") });
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
    const el = h(Teleport, { to: target, children: h("span", null, "direct-test") });
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
    expect(target.textContent).toBe("direct-test");
  });

  test("multiple teleports to same target", () => {
    h(Teleport, { to: target, children: h("span", null, "first") });
    h(Teleport, { to: target, children: h("span", null, "second") });
    expect(target.textContent).toContain("first");
    expect(target.textContent).toContain("second");
  });
});

describe("Teleport — cleanup after fix", () => {
  test("content removed when component unmounts", () => {
    function Comp() {
      return h(Teleport, { to: "#teleport-target", children: h("span", null, "cleanup") });
    }
    const el = h(Comp);
    expect(target.textContent).toBe("cleanup");

    unmount(el as HTMLElement);
    expect(target.textContent).toBe("");
  });

  test("content cleaned up even if target has other children", () => {
    target.textContent = "existing";

    function Comp() {
      return h(Teleport, { to: "#teleport-target", children: h("span", null, "added") });
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
      return h(Teleport, { to: "#teleport-target", children: span });
    }
    const el = h(Comp);
    expect(target.textContent).toBe("static");

    unmount(el as HTMLElement);
    expect(target.textContent).toBe("");
  });
});
