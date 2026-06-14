// @vitest-environment happy-dom
// kiaao — props.ts 极限测试

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { setProp, setProps, EVENT_RE } from "../../src/dom/props.ts";

// ── setProp 基本路径 ────────────────────────────────

describe("setProp — basic paths", () => {
  test("null value is ignored", () => {
    const el = document.createElement("div");
    setProp(el, "id", null);
    expect(el.hasAttribute("id")).toBe(false);
  });

  test("undefined value is ignored", () => {
    const el = document.createElement("div");
    setProp(el, "id", undefined);
    expect(el.hasAttribute("id")).toBe(false);
  });

  test("prop: prefix forces property assignment", () => {
    const el = document.createElement("div");
    setProp(el, "prop:foo", "bar");
    expect((el as any).foo).toBe("bar");
    expect(el.hasAttribute("foo")).toBe(false);
  });

  test("attr: prefix forces setAttribute", () => {
    const el = document.createElement("div");
    setProp(el, "attr:data-x", "hello");
    expect(el.getAttribute("data-x")).toBe("hello");
  });
});

// ── setProp style ────────────────────────────────────

describe("setProp — style", () => {
  test("style as string sets attribute", () => {
    const el = document.createElement("div");
    setProp(el, "style", "color: red");
    expect(el.getAttribute("style")).toBe("color: red");
  });

  test("style as object assigns properties", () => {
    const el = document.createElement("div");
    setProp(el, "style", { color: "blue", fontSize: "14px" });
    expect((el as HTMLElement).style.color).toBe("blue");
    expect((el as HTMLElement).style.fontSize).toBe("14px");
  });

  test("style object removes style attribute before applying", () => {
    const el = document.createElement("div");
    el.setAttribute("style", "color: red");
    setProp(el, "style", { color: "blue" });
    // 对象路径走 removeAttr + Object.assign，不应有 style attribute
  });

  test("null style value is ignored", () => {
    const el = document.createElement("div");
    setProp(el, "style", null);
    expect(el.hasAttribute("style")).toBe(false);
  });
});

// ── setProp 事件 ─────────────────────────────────────

describe("setProp — events", () => {
  test("onClick binds click event", () => {
    const el = document.createElement("button");
    let clicked = false;
    setProp(el, "onClick", () => {
      clicked = true;
    });
    el.click();
    expect(clicked).toBe(true);
  });

  test("onInput binds input event", () => {
    const el = document.createElement("input");
    setProp(el, "onInput", (e: Event) => {
      void (e.target as HTMLInputElement).value;
    });
    el.dispatchEvent(new InputEvent("input"));
  });

  test("custom on-prefixed event", () => {
    const el = document.createElement("div");
    let fired = false;
    setProp(el, "onCustomEvent", () => {
      fired = true;
    });
    el.dispatchEvent(new Event("customevent"));
    expect(fired).toBe(true);
  });

  test("non-function event handler does not crash", () => {
    const el = document.createElement("button");
    expect(() => setProp(el, "onClick", "not-a-function" as any)).not.toThrow();
  });

  test("EVENT_RE regex matches correctly", () => {
    expect(EVENT_RE.test("onClick")).toBe(true);
    expect(EVENT_RE.test("onInput")).toBe(true);
    expect(EVENT_RE.test("onClickOutside")).toBe(true);
    expect(EVENT_RE.test("only")).toBe(false);
    expect(EVENT_RE.test("onto")).toBe(false);
    expect(EVENT_RE.test("on")).toBe(false);
    expect(EVENT_RE.test("once")).toBe(false);
  });
});

// ── setProp SVG ──────────────────────────────────────

describe("setProp — SVG", () => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  function createSVGElement(tag: string): SVGElement {
    return document.createElementNS(SVG_NS, tag);
  }

  test("SVG attribute goes through setAttribute", () => {
    const el = createSVGElement("circle");
    setProp(el, "cx", "50");
    expect(el.getAttribute("cx")).toBe("50");
  });

  test("SVG viewBox attribute", () => {
    const el = createSVGElement("svg");
    setProp(el, "viewBox", "0 0 100 100");
    expect(el.getAttribute("viewBox")).toBe("0 0 100 100");
  });

  test("SVG style as object works", () => {
    const el = createSVGElement("rect");
    setProp(el, "style", { fill: "red" });
    expect((el as unknown as HTMLElement).style.fill).toBe("red");
  });

  test("SVG event listener on path", () => {
    const el = createSVGElement("path");
    let clicked = false;
    setProp(el, "onClick", () => {
      clicked = true;
    });
    el.dispatchEvent(new MouseEvent("click"));
    expect(clicked).toBe(true);
  });
});

// ── setProp aria-* / data-* ──────────────────────────

describe("setProp — aria and data", () => {
  test("aria-label sets attribute", () => {
    const el = document.createElement("button");
    setProp(el, "aria-label", "Close");
    expect(el.getAttribute("aria-label")).toBe("Close");
  });

  test("data-id sets attribute", () => {
    const el = document.createElement("div");
    setProp(el, "data-id", "123");
    expect(el.getAttribute("data-id")).toBe("123");
  });
});

// ── setProp FORCE_ATTRIBUTE ──────────────────────────

describe("setProp — FORCE_ATTRIBUTE", () => {
  test("class sets attribute", () => {
    const el = document.createElement("div");
    setProp(el, "class", "box");
    expect(el.getAttribute("class")).toBe("box");
  });

  test("disabled true sets empty attribute", () => {
    const el = document.createElement("button");
    setProp(el, "disabled", true);
    expect(el.getAttribute("disabled")).toBe("");
  });

  test("disabled false removes attribute", () => {
    const el = document.createElement("button");
    el.setAttribute("disabled", "");
    setProp(el, "disabled", false);
    expect(el.hasAttribute("disabled")).toBe(false);
  });

  test("placeholder sets attribute", () => {
    const el = document.createElement("input");
    setProp(el, "placeholder", "Enter name");
    expect(el.getAttribute("placeholder")).toBe("Enter name");
  });

  test("hidden boolean attribute", () => {
    const el = document.createElement("div");
    setProp(el, "hidden", true);
    expect(el.getAttribute("hidden")).toBe("");

    setProp(el, "hidden", false);
    expect(el.hasAttribute("hidden")).toBe(false);
  });
});

// ── setProp 默认 property ────────────────────────────

describe("setProp — default property", () => {
  test("unknown property sets as property", () => {
    const el = document.createElement("div");
    setProp(el, "myProp", 42);
    expect((el as any).myProp).toBe(42);
  });

  test("value sets property (not attribute)", () => {
    const el = document.createElement("input");
    setProp(el, "value", "hello");
    expect((el as HTMLInputElement).value).toBe("hello");
    expect(el.hasAttribute("value")).toBe(false);
  });

  test("checked sets property (not attribute)", () => {
    const el = document.createElement("input");
    el.type = "checkbox";
    setProp(el, "checked", true);
    expect((el as HTMLInputElement).checked).toBe(true);
    expect(el.hasAttribute("checked")).toBe(false);
  });

  test("innerHTML sets property", () => {
    const el = document.createElement("div");
    setProp(el, "innerHTML", "<span>content</span>");
    expect(el.innerHTML).toBe("<span>content</span>");
  });
});

// ── setProps ─────────────────────────────────────────

describe("setProps — multiple props", () => {
  test("sets multiple static props", () => {
    const el = document.createElement("div");
    setProps(el, { id: "main", class: "box" });
    expect(el.id).toBe("main");
    expect(el.className).toBe("box");
  });

  test("ignores null props", () => {
    const el = document.createElement("div");
    expect(() => setProps(el, null)).not.toThrow();
  });

  test("ignores undefined props", () => {
    const el = document.createElement("div");
    expect(() => setProps(el, undefined)).not.toThrow();
  });

  test("ignores children key", () => {
    const el = document.createElement("div");
    setProps(el, { children: "ignored", id: "ok" });
    expect(el.id).toBe("ok");
    expect(el.hasAttribute("children")).toBe(false);
  });

  test("sets event handler alongside static props", () => {
    const el = document.createElement("button");
    let clicked = false;
    setProps(el, {
      id: "btn",
      onClick: () => {
        clicked = true;
      },
    });
    expect(el.id).toBe("btn");
    el.click();
    expect(clicked).toBe(true);
  });
});

// ── setProps 响应式属性 ──────────────────────────────

describe("setProps — reactive props", () => {
  test("reactive class binding updates on signal change", () => {
    const [cls, setCls] = use("foo");
    const el = document.createElement("div");
    setProps(el, { class: cls });
    expect(el.className).toBe("foo");

    setCls("bar");
    expect(el.className).toBe("bar");
  });

  test("reactive disabled binding", () => {
    const [disabled, setDisabled] = use(true);
    const el = document.createElement("button");
    setProps(el, { disabled });
    expect(el.disabled).toBe(true);

    setDisabled(false);
    expect(el.disabled).toBe(false);
  });

  test("multiple reactive props update independently", () => {
    const [a, setA] = use("a");
    const [b, setB] = use("b");
    const el = document.createElement("div");
    setProps(el, { "data-a": a, "data-b": b });
    expect(el.getAttribute("data-a")).toBe("a");
    expect(el.getAttribute("data-b")).toBe("b");

    setA("A");
    expect(el.getAttribute("data-a")).toBe("A");
    expect(el.getAttribute("data-b")).toBe("b");

    setB("B");
    expect(el.getAttribute("data-a")).toBe("A");
    expect(el.getAttribute("data-b")).toBe("B");
  });

  test("reactive style as string", () => {
    const [color, setColor] = use("color: red");
    const el = document.createElement("div");
    setProps(el, { style: color });
    expect(el.getAttribute("style")).toBe("color: red");

    setColor("color: blue");
    expect(el.getAttribute("style")).toBe("color: blue");
  });

  test("reactive style as object", () => {
    const [style, setStyle] = use({ color: "red" });
    const el = document.createElement("div");
    setProps(el, { style });
    expect((el as HTMLElement).style.color).toBe("red");

    setStyle({ color: "blue" });
    expect((el as HTMLElement).style.color).toBe("blue");
  });
});

// ── setProps 边界 ────────────────────────────────────

describe("setProps — edge cases", () => {
  test("setProps with non-object value", () => {
    const el = document.createElement("div");
    expect(() => setProps(el, 42 as any)).not.toThrow();
  });

  test("setProps with array value", () => {
    const el = document.createElement("div");
    expect(() => setProps(el, [] as any)).not.toThrow();
  });
});
