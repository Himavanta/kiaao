// @vitest-environment happy-dom
// Attribute / Property 处理策略测试

import { expect, test, describe } from "vite-plus/test";
import { define } from "../src/index.ts";
import { h } from "../src/core/h.ts";

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
  });

  test("tabindex goes through setAttribute", () => {
    const el = h("div", { tabindex: "0" });
    expect(el.getAttribute("tabindex")).toBe("0");
    expect((el as HTMLElement).tabIndex).toBe(0);
  });

  test("readonly on input", () => {
    const el = h("input", { readonly: true });
    expect(el.hasAttribute("readonly")).toBe(true);
  });

  test("href goes through setAttribute", () => {
    const el = h("a", { href: "/page" });
    expect(el.getAttribute("href")).toBe("/page");
  });

  test("src goes through setAttribute", () => {
    const el = h("img", { src: "/img.png", alt: "pic" });
    expect(el.getAttribute("src")).toBe("/img.png");
    expect(el.getAttribute("alt")).toBe("pic");
  });
});

// ── 非 FORCE_ATTRIBUTE（默认走 property） ────────────

describe("default property assignment", () => {
  test("value goes through property (controlled component)", () => {
    const el = h("input", { value: "initial" }) as HTMLInputElement;
    expect(el.getAttribute("value")).toBeNull(); // setAttribute 未调用
    expect(el.value).toBe("initial");
  });

  test("checked goes through property (controlled component)", () => {
    const el = h("input", { type: "checkbox", checked: true }) as HTMLInputElement;
    expect(el.hasAttribute("checked")).toBe(false); // setAttribute 未调用
    expect(el.checked).toBe(true);
  });

  test("innerHTML goes through property", () => {
    const el = h("div", { innerHTML: "<span>hello</span>" });
    expect(el.getAttribute("innerHTML")).toBeNull();
    expect(el.innerHTML).toBe("<span>hello</span>");
  });

  test("textContent goes through property", () => {
    const el = h("div", { textContent: "hello world" });
    expect(el.getAttribute("textContent")).toBeNull();
    expect(el.textContent).toBe("hello world");
  });

  test("unknown custom property goes through property", () => {
    const el = h("div", { customProp: "custom-value" } as any);
    expect(el.hasAttribute("customProp")).toBe(false);
    expect((el as any).customProp).toBe("custom-value");
  });
});

// ── attr: 前缀 ──────────────────────────────────────

describe("attr: prefix — force setAttribute", () => {
  test("attr:value outputs as attribute even though value defaults to property", () => {
    const el = h("input", { "attr:value": "explicit" });
    expect(el.getAttribute("value")).toBe("explicit");
  });

  test("attr:class works same as unprefixed class", () => {
    const el = h("div", { "attr:class": "box" });
    expect(el.getAttribute("class")).toBe("box");
  });

  test("attr:disabled with boolean sets 'true' string", () => {
    const el = h("button", { "attr:disabled": true });
    // attr: 走 setAttr(el, key, String(value)), true → "true"
    expect(el.getAttribute("disabled")).toBe("true");
  });

  test("attr:data-custom outputs as attribute", () => {
    const el = h("div", { "attr:data-custom": "val" });
    expect(el.getAttribute("data-custom")).toBe("val");
  });

  test("attr:non-existent-property creates attribute", () => {
    const el = h("div", { "attr:some-attr": "anything" });
    expect(el.getAttribute("some-attr")).toBe("anything");
  });
});

// ── prop: 前缀 ──────────────────────────────────────

describe("prop: prefix — force property assignment", () => {
  test("prop:className sets className directly", () => {
    const el = h("div", { "prop:className": "direct-prop" });
    expect(el.className).toBe("direct-prop");
    expect(el.hasAttribute("className")).toBe(false); // setAttribute 未调用
  });

  test("prop:disabled sets property even though FORCE_ATTRIBUTE", () => {
    const el = h("button", { "prop:disabled": true });
    expect((el as HTMLButtonElement).disabled).toBe(true);
    // prop: 走 property 赋值, 未调用 setAttribute
    // 但浏览器可能将某些 property 同步回 attribute, 不对此做断言
  });

  test("prop:value sets value property", () => {
    const el = h("input", { "prop:value": "prop-val" }) as HTMLInputElement;
    expect(el.value).toBe("prop-val");
  });

  test("prop:innerHTML sets innerHTML", () => {
    const el = h("div", { "prop:innerHTML": "<b>bold</b>" });
    expect(el.innerHTML).toBe("<b>bold</b>");
  });

  test("prop:style does not throw (developer responsibility)", () => {
    // prop:style 走 property 赋值, 替换整个 CSSStyleDeclaration
    // 这是开发者责任, 框架只保证不抛出异常
    expect(() => {
      h("div", { "prop:style": { color: "red" } } as any);
    }).not.toThrow();
  });
});

// ── aria-* / data-* ─────────────────────────────────

describe("aria-* / data-* — always setAttribute", () => {
  test("aria-label goes through setAttribute", () => {
    const el = h("div", { "aria-label": "Close" });
    expect(el.getAttribute("aria-label")).toBe("Close");
  });

  test("aria-hidden goes through setAttribute", () => {
    const el = h("div", { "aria-hidden": "true" });
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  test("data-id goes through setAttribute", () => {
    const el = h("div", { "data-id": "123" });
    expect(el.getAttribute("data-id")).toBe("123");
  });

  test("data-custom-value goes through setAttribute", () => {
    const el = h("div", { "data-custom-value": "abc" });
    expect(el.getAttribute("data-custom-value")).toBe("abc");
  });
});

// ── SVG 元素 ────────────────────────────────────────

describe("SVG elements — always setAttribute", () => {
  test("SVG element with viewBox", () => {
    const el = h("svg", { viewBox: "0 0 100 100", width: "100", height: "100" });
    expect(el.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(el.getAttribute("width")).toBe("100");
    expect(el.getAttribute("height")).toBe("100");
  });

  test("SVG circle with cx cy r", () => {
    const el = h("circle", { cx: "50", cy: "50", r: "40" });
    expect(el.getAttribute("cx")).toBe("50");
    expect(el.getAttribute("cy")).toBe("50");
    expect(el.getAttribute("r")).toBe("40");
  });

  test("SVG g element with nested circle", () => {
    const el = h("g", { fill: "none" });
    // SVG element 本身是 SVGElement
    expect(el.getAttribute("fill")).toBe("none");
  });

  test("SVG path with d attribute", () => {
    const el = h("path", { d: "M10 10 L90 90", stroke: "red" });
    expect(el.getAttribute("d")).toBe("M10 10 L90 90");
    expect(el.getAttribute("stroke")).toBe("red");
  });

  test("SVG class attribute works", () => {
    const el = h("circle", { class: "icon-red" });
    expect(el.getAttribute("class")).toBe("icon-red");
  });

  test("SVG ignores prop: prefix (always setAttribute)", () => {
    const el = h("circle", { "prop:cx": "99" } as any);
    // SVG 忽略前缀，所以 prop: 和 attr: 都走 setAttribute
    // 但 key 被剥离前缀，所以 'cx' 被 setAttribute
    expect(el.getAttribute("cx")).toBe("99");
  });

  test("SVG style as string works", () => {
    const el = h("circle", { style: "fill: red; stroke: blue" }) as HTMLElement;
    expect(el.getAttribute("style")).toBe("fill: red; stroke: blue");
    expect(el.style.fill).toBe("red");
  });

  test("SVG style as object works", () => {
    const el = h("circle", { style: { fill: "green", strokeWidth: "2" } }) as HTMLElement;
    expect(el.style.fill).toBe("green");
    expect(el.style.strokeWidth).toBe("2");
  });
});

// ── 前缀 + 响应式 ──────────────────────────────────

describe("prefix with reactive bindings", () => {
  test("reactive attr:value updates attribute on change", () => {
    const [val, setVal] = define("initial");
    const el = h("input", { "attr:value": val });
    expect(el.getAttribute("value")).toBe("initial");

    setVal("updated");
    expect(el.getAttribute("value")).toBe("updated");
  });

  test("reactive prop:disabled sets property on change", () => {
    const [disabled, setDisabled] = define(false);
    const el = h("button", { "prop:disabled": disabled }) as HTMLButtonElement;
    expect(el.disabled).toBe(false);

    setDisabled(true);
    expect(el.disabled).toBe(true);

    setDisabled(false);
    expect(el.disabled).toBe(false);
  });
});
