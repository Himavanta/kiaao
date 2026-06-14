// @vitest-environment happy-dom
// kiaao — Attribute / Property 处理策略测试

import { expect, test, describe } from "vite-plus/test";
import { use } from "../src/reactive/core.ts";
import { h } from "../src/dom/h.ts";

// ── FORCE_ATTRIBUTE ──────────────────────────────────

describe("FORCE_ATTRIBUTE — setAttribute", () => {
  test("class goes through setAttribute", () => {
    const el = h("div", { class: "foo bar" });
    expect(el.getAttribute("class")).toBe("foo bar");
    expect(el.className).toBe("foo bar");
  });

  test("disabled boolean true sets empty attribute", () => {
    const el = h("button", { disabled: true });
    expect(el.getAttribute("disabled")).toBe("");
    expect((el as HTMLButtonElement).disabled).toBe(true);
  });

  test("disabled boolean false removes attribute", () => {
    const el = h("button", { disabled: false });
    expect(el.hasAttribute("disabled")).toBe(false);
    expect((el as HTMLButtonElement).disabled).toBe(false);
  });

  test("placeholder string goes through setAttribute", () => {
    const el = h("input", { placeholder: "Enter name" });
    expect(el.getAttribute("placeholder")).toBe("Enter name");
  });

  test("hidden boolean attribute", () => {
    const el = h("div", { hidden: true });
    expect(el.getAttribute("hidden")).toBe("");
    expect((el as HTMLElement).hidden).toBe(true);

    const el2 = h("div", { hidden: false });
    expect(el2.hasAttribute("hidden")).toBe(false);
    expect((el2 as HTMLElement).hidden).toBe(false);
  });

  test("id attribute", () => {
    const el = h("div", { id: "my-id" });
    expect(el.id).toBe("my-id");
    expect(el.getAttribute("id")).toBe("my-id");
  });
});

// ── Property path — prop: prefix ─────────────────────

describe("prop: prefix — force property", () => {
  test("prop: prefix sets property directly", () => {
    const el = h("div", { "prop:foo": "bar" });
    expect((el as any).foo).toBe("bar");
    expect(el.hasAttribute("foo")).toBe(false);
  });
});

// ── Attribute path — attr: prefix ────────────────────

describe("attr: prefix — force setAttribute", () => {
  test("attr: prefix calls setAttribute", () => {
    const el = h("div", { "attr:data-custom": "hello" });
    expect(el.getAttribute("data-custom")).toBe("hello");
  });

  test("attr: prefix on property-like key", () => {
    const el = h("div", { "attr:id": "forced-id" });
    expect(el.getAttribute("id")).toBe("forced-id");
  });
});

// ── SVG Elements ─────────────────────────────────────

describe("SVG elements", () => {
  test("creates SVG element with correct namespace", () => {
    const el = h("svg", { viewBox: "0 0 100 100" });
    expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  test("creates path inside SVG", () => {
    const svg = h("svg", null, h("path", { d: "M10 10" }));
    const path = svg.firstElementChild!;
    expect(path.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  test("SVG attributes go through setAttribute", () => {
    const el = h("svg", { viewBox: "0 0 100 100" });
    expect(el.getAttribute("viewBox")).toBe("0 0 100 100");
  });
});

// ── Event Handling ───────────────────────────────────

describe("event handling", () => {
  test("onClick handler fires", () => {
    let count = 0;
    const el = h("button", { onClick: () => count++ });
    (el as HTMLElement).click();
    expect(count).toBe(1);
  });

  test("onInput handler fires", () => {
    let value = "";
    const el = h("input", {
      onInput: (e: Event) => {
        value = (e.target as HTMLInputElement).value;
      },
    });
    el.dispatchEvent(new InputEvent("input"));
    expect(value).toBe("");
  });

  test("multiple events on same element", () => {
    let clicks = 0;
    let focuses = 0;
    const el = h("button", {
      onClick: () => clicks++,
      onFocus: () => focuses++,
    });
    (el as HTMLElement).click();
    el.dispatchEvent(new FocusEvent("focus"));
    expect(clicks).toBe(1);
    expect(focuses).toBe(1);
  });
});

// ── Style Handling ───────────────────────────────────

describe("style handling", () => {
  test("style as string", () => {
    const el = h("div", { style: "color: red; font-size: 14px" });
    expect((el as HTMLElement).style.color).toBe("red");
    expect((el as HTMLElement).style.fontSize).toBe("14px");
  });

  test("style as object", () => {
    const el = h("div", { style: { color: "blue", fontSize: "16px" } });
    expect((el as HTMLElement).style.color).toBe("blue");
    expect((el as HTMLElement).style.fontSize).toBe("16px");
  });

  test("style object applies correctly via property", () => {
    const el = h("div", { style: { color: "red", backgroundColor: "black" } });
    expect((el as HTMLElement).style.color).toBe("red");
    expect((el as HTMLElement).style.backgroundColor).toBe("black");
  });
});

// ── aria-* / data-* ─────────────────────────────────

describe("aria-* and data-* attributes", () => {
  test("aria-label goes through setAttribute", () => {
    const el = h("button", { "aria-label": "Close" });
    expect(el.getAttribute("aria-label")).toBe("Close");
  });

  test("data-id goes through setAttribute", () => {
    const el = h("div", { "data-id": "123" });
    expect(el.getAttribute("data-id")).toBe("123");
  });

  test("aria-expanded boolean", () => {
    const el = h("button", { "aria-expanded": true });
    expect(el.getAttribute("aria-expanded")).toBe("true");

    const el2 = h("button", { "aria-expanded": false });
    expect(el2.getAttribute("aria-expanded")).toBe("false");
  });
});

// ── Reactive attributes ──────────────────────────────

describe("reactive attributes with signal", () => {
  test("reactive class binding", () => {
    const [cls, setCls] = use("foo");
    const el = h("div", { class: cls });
    expect(el.className).toBe("foo");

    setCls("bar");
    expect(el.className).toBe("bar");
  });

  test("reactive style binding", () => {
    const [color, setColor] = use("color: red");
    const el = h("div", { style: color });
    expect(el.getAttribute("style")).toBe("color: red");

    setColor("color: blue");
    expect(el.getAttribute("style")).toBe("color: blue");
  });

  test("reactive disabled binding", () => {
    const [disabled, setDisabled] = use(true);
    const el = h("button", { disabled });
    expect((el as HTMLButtonElement).disabled).toBe(true);

    setDisabled(false);
    expect((el as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── special attributes: value, checked ────────────────

describe("value and checked attributes", () => {
  test("value sets property", () => {
    const el = h("input", { value: "hello" });
    expect((el as HTMLInputElement).value).toBe("hello");
  });

  test("checked sets property", () => {
    const el = h("input", { type: "checkbox", checked: true });
    expect((el as HTMLInputElement).checked).toBe(true);
  });
});
