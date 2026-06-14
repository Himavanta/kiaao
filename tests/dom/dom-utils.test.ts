// @vitest-environment happy-dom
// kiaao — dom-utils 极限测试

import { expect, test, describe } from "vite-plus/test";
import {
  createElement,
  createTextNode,
  createComment,
  createFragment,
  setAttr,
  removeAttr,
  getAttr,
  addEvent,
  firstChild,
  parentNode,
  prevSibling,
  isConnected,
  nodeType,
  stripPrefix,
  splitSet,
  FORCE_ATTRIBUTE,
  qs,
  escapeHtml,
  escapeAttr,
} from "../../src/dom/dom-utils.ts";

// ── splitSet ─────────────────────────────────────────

describe("splitSet", () => {
  test("splits space-separated string into Set", () => {
    const result = splitSet("a b c");
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
    expect(result.has("c")).toBe(true);
    expect(result.size).toBe(3);
  });

  test("trims extra whitespace", () => {
    const result = splitSet("  foo   bar  ");
    expect(result.size).toBe(2);
    expect(result.has("foo")).toBe(true);
  });
});

// ── FORCE_ATTRIBUTE ──────────────────────────────────

describe("FORCE_ATTRIBUTE", () => {
  test("contains class", () => {
    expect(FORCE_ATTRIBUTE.has("class")).toBe(true);
  });
  test("contains id", () => {
    expect(FORCE_ATTRIBUTE.has("id")).toBe(true);
  });
  test("contains disabled", () => {
    expect(FORCE_ATTRIBUTE.has("disabled")).toBe(true);
  });
  test("does NOT contain value", () => {
    expect(FORCE_ATTRIBUTE.has("value")).toBe(false);
  });
  test("does NOT contain checked", () => {
    expect(FORCE_ATTRIBUTE.has("checked")).toBe(false);
  });
});

// ── stripPrefix ──────────────────────────────────────

describe("stripPrefix", () => {
  test("attr: prefix returns attr mode", () => {
    expect(stripPrefix("attr:data-x")).toEqual({ prefix: "attr", key: "data-x" });
  });
  test("prop: prefix returns prop mode", () => {
    expect(stripPrefix("prop:foo")).toEqual({ prefix: "prop", key: "foo" });
  });
  test("no prefix returns null mode", () => {
    expect(stripPrefix("class")).toEqual({ prefix: null, key: "class" });
  });
  test("attr: with colon in value", () => {
    expect(stripPrefix("attr:namespace:prop")).toEqual({ prefix: "attr", key: "namespace:prop" });
  });
});

// ── createElement ────────────────────────────────────

describe("createElement", () => {
  test("creates HTML element", () => {
    const el = createElement("div");
    expect(el.tagName).toBe("DIV");
    expect(el.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
  });

  test("creates SVG element", () => {
    const el = createElement("svg");
    expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  test("creates SVG child elements", () => {
    expect(createElement("circle").namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(createElement("path").namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(createElement("rect").namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(createElement("text").namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  test("shared HTML/SVG tags create HTML elements by default", () => {
    expect(createElement("a").namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(createElement("title").namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(createElement("style").namespaceURI).toBe("http://www.w3.org/1999/xhtml");
  });
});

// ── createTextNode / createComment / createFragment ───

describe("DOM creation utilities", () => {
  test("createTextNode creates text node", () => {
    const tn = createTextNode("hello");
    expect(tn.nodeType).toBe(Node.TEXT_NODE);
    expect(tn.textContent).toBe("hello");
  });

  test("createTextNode with empty string", () => {
    const tn = createTextNode("");
    expect(tn.textContent).toBe("");
  });

  test("createComment creates comment node", () => {
    const cm = createComment("test");
    expect(cm.nodeType).toBe(Node.COMMENT_NODE);
    expect(cm.textContent).toBe("test");
  });

  test("createFragment creates document fragment", () => {
    const frag = createFragment();
    expect(frag.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE);
  });
});

// ── setAttr / removeAttr / getAttr ───────────────────

describe("attribute utilities", () => {
  test("setAttr sets attribute", () => {
    const el = document.createElement("div");
    setAttr(el, "class", "foo");
    expect(el.getAttribute("class")).toBe("foo");
  });

  test("removeAttr removes attribute", () => {
    const el = document.createElement("div");
    el.setAttribute("class", "foo");
    removeAttr(el, "class");
    expect(el.hasAttribute("class")).toBe(false);
  });

  test("getAttr returns attribute value", () => {
    const el = document.createElement("div");
    el.setAttribute("data-x", "y");
    expect(getAttr(el, "data-x")).toBe("y");
  });

  test("getAttr returns null for missing attribute", () => {
    const el = document.createElement("div");
    expect(getAttr(el, "nonexistent")).toBeNull();
  });
});

// ── addEvent ─────────────────────────────────────────

describe("addEvent", () => {
  test("binds click event", () => {
    const el = document.createElement("button");
    let clicked = false;
    addEvent(el, "click", () => {
      clicked = true;
    });
    el.click();
    expect(clicked).toBe(true);
  });

  test("binds custom event", () => {
    const el = document.createElement("div");
    let fired = false;
    addEvent(el, "testevent", () => {
      fired = true;
    });
    el.dispatchEvent(new Event("testevent"));
    expect(fired).toBe(true);
  });
});

// ── DOM traversal ────────────────────────────────────

describe("DOM traversal", () => {
  test("firstChild returns first child", () => {
    const parent = document.createElement("div");
    const a = document.createElement("span");
    const b = document.createElement("span");
    parent.append(a, b);
    expect(firstChild(parent)).toBe(a);
  });

  test("firstChild returns null for empty element", () => {
    const el = document.createElement("div");
    expect(firstChild(el)).toBeNull();
  });

  test("parentNode returns parent", () => {
    const parent = document.createElement("div");
    const child = document.createElement("span");
    parent.append(child);
    expect(parentNode(child)).toBe(parent);
  });

  test("prevSibling returns previous sibling", () => {
    const parent = document.createElement("div");
    const a = document.createElement("span");
    const b = document.createElement("span");
    parent.append(a, b);
    expect(prevSibling(b)).toBe(a);
    expect(prevSibling(a)).toBeNull();
  });

  test("isConnected", () => {
    const el = document.createElement("div");
    expect(isConnected(el)).toBe(false);
    document.body.append(el);
    expect(isConnected(el)).toBe(true);
    el.remove();
  });

  test("nodeType returns correct type", () => {
    expect(nodeType(document.createElement("div"))).toBe(Node.ELEMENT_NODE);
    expect(nodeType(document.createTextNode(""))).toBe(Node.TEXT_NODE);
    expect(nodeType(document.createComment(""))).toBe(Node.COMMENT_NODE);
  });
});

// ── Query ─────────────────────────────────────────────

describe("query selector", () => {
  test("qs returns null for non-existent selector", () => {
    expect(qs("#nonexistent")).toBeNull();
  });
});

// ── HTML escaping ────────────────────────────────────

describe("HTML escaping", () => {
  test("escapeHtml escapes < > &", () => {
    expect(escapeHtml("<div>&</div>")).toBe("&lt;div&gt;&amp;&lt;/div&gt;");
  });

  test("escapeHtml leaves safe strings unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  test("escapeAttr escapes quotes and brackets", () => {
    expect(escapeAttr(`"<&>"`)).toBe("&quot;&lt;&amp;&gt;&quot;");
  });

  test("escapeAttr leaves safe strings unchanged", () => {
    expect(escapeAttr("hello")).toBe("hello");
  });
});
