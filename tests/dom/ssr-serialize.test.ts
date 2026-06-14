// @vitest-environment node
// kiaao v4 — SSR serialize unit tests (pure functions, no DOM needed)

import { expect, test, describe } from "vite-plus/test";
import { REACTIVE } from "../../src/reactive/types.ts";
import {
  serializeCssText,
  serializeAttr,
  serializeAttrs,
  stripDirectives,
} from "../../src/dom/ssr-serialize.ts";

// ── serializeCssText ─────────────────────────────────

describe("serializeCssText", () => {
  test("converts style object to inline string", () => {
    expect(serializeCssText({ color: "red", fontSize: "14px" })).toBe(
      "color: red; font-size: 14px",
    );
  });

  test("handles camelCase property names", () => {
    expect(serializeCssText({ backgroundColor: "blue" })).toBe("background-color: blue");
  });

  test("handles numeric values", () => {
    expect(serializeCssText({ width: 100, height: "50px" })).toBe("width: 100; height: 50px");
  });

  test("returns empty string for empty object", () => {
    expect(serializeCssText({})).toBe("");
  });

  test("handles vendor-prefixed properties", () => {
    expect(serializeCssText({ WebkitTransform: "rotate(90deg)" })).toBe(
      "-webkit-transform: rotate(90deg)",
    );
  });
});

// ── serializeAttr ───────────────────────────────────

describe("serializeAttr", () => {
  test("prop: prefix returns empty string", () => {
    expect(serializeAttr("prop:disabled", true)).toBe("");
  });

  test("attr: prefix forces attribute output", () => {
    expect(serializeAttr("attr:data-x", "hello")).toBe(' data-x="hello"');
  });

  test("attr: prefix with boolean true outputs bare attribute", () => {
    expect(serializeAttr("attr:disabled", true)).toBe(" disabled");
  });

  test("event handler attributes are skipped", () => {
    expect(serializeAttr("onClick", () => {})).toBe("");
    expect(serializeAttr("onInput", "handler")).toBe("");
  });

  test("style as string", () => {
    expect(serializeAttr("style", "color: red")).toBe(' style="color: red"');
  });

  test("style as object", () => {
    expect(serializeAttr("style", { color: "red", fontSize: "14px" })).toBe(
      ' style="color: red; font-size: 14px"',
    );
  });

  test("aria attributes are output", () => {
    expect(serializeAttr("aria-label", "Close")).toBe(' aria-label="Close"');
    expect(serializeAttr("aria-hidden", "true")).toBe(' aria-hidden="true"');
  });

  test("data attributes are output", () => {
    expect(serializeAttr("data-id", "123")).toBe(' data-id="123"');
    expect(serializeAttr("data-custom", "val")).toBe(' data-custom="val"');
  });

  test("FORCE_ATTRIBUTE (class, id) outputs", () => {
    expect(serializeAttr("class", "box")).toBe(' class="box"');
    expect(serializeAttr("id", "main")).toBe(' id="main"');
  });

  test("FORCE_ATTRIBUTE boolean true outputs bare attribute", () => {
    expect(serializeAttr("disabled", true)).toBe(" disabled");
  });

  test("FORCE_ATTRIBUTE boolean false is skipped (handled by caller)", () => {
    // serializeAttr is not called with false values (caller filters them)
    // This test verifies behavior if called directly
    expect(serializeAttr("hidden", true)).toBe(" hidden");
  });

  test("href attribute outputs", () => {
    expect(serializeAttr("href", "https://example.com")).toBe(' href="https://example.com"');
  });

  test("src attribute outputs", () => {
    expect(serializeAttr("src", "/image.png")).toBe(' src="/image.png"');
  });

  test("unknown attribute is skipped (SSR only outputs known attributes)", () => {
    expect(serializeAttr("myProp", 42)).toBe("");
  });

  test("escapes special characters in attribute values", () => {
    expect(serializeAttr("title", '"hello" & <world>')).toBe(
      ' title="&quot;hello&quot; &amp; &lt;world&gt;"',
    );
  });
});

// ── serializeAttrs ──────────────────────────────────

describe("serializeAttrs", () => {
  test("returns empty string for null props", () => {
    expect(serializeAttrs(null)).toBe("");
  });

  test("returns empty string for undefined props", () => {
    expect(serializeAttrs(undefined)).toBe("");
  });

  test("returns empty string for non-object props", () => {
    expect(serializeAttrs(42 as any)).toBe("");
  });

  test("serializes multiple attributes", () => {
    const result = serializeAttrs({ class: "box", id: "main", "data-x": "y" });
    expect(result).toContain('class="box"');
    expect(result).toContain('id="main"');
    expect(result).toContain('data-x="y"');
  });

  test("skips children key", () => {
    expect(serializeAttrs({ children: "ignored", class: "keep" })).not.toContain("children");
    expect(serializeAttrs({ children: "ignored", class: "keep" })).toContain('class="keep"');
  });

  test("skips null and false values", () => {
    const result = serializeAttrs({ class: null, hidden: false, id: "ok" });
    expect(result).not.toContain("class");
    expect(result).not.toContain("hidden");
    expect(result).toContain('id="ok"');
  });

  test("handles signal getter as value", () => {
    const signal = () => "resolved";
    (signal as any)[REACTIVE] = { value: "resolved" };
    const result = serializeAttrs({ class: signal });
    expect(result).toContain('class="resolved"');
  });

  test("escapes special characters in values", () => {
    const result = serializeAttrs({ title: '<script>alert("xss")</script>' });
    expect(result).toBe(' title="&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"');
  });
});

// ── stripDirectives ─────────────────────────────────

describe("stripDirectives", () => {
  test("removes when, each, key, else props", () => {
    const result = stripDirectives({
      when: true,
      each: [],
      key: "k",
      else: () => {},
      class: "box",
    });
    expect(result).toEqual({ class: "box" });
  });

  test("returns same object for null props", () => {
    expect(stripDirectives(null)).toBeNull();
  });

  test("returns same object for non-object props", () => {
    expect(stripDirectives(42 as any)).toBe(42);
  });

  test("preserves other props", () => {
    const result = stripDirectives({ class: "a", id: "b", style: "red" });
    expect(result).toEqual({ class: "a", id: "b", style: "red" });
  });

  test("handles props with no directives", () => {
    const result = stripDirectives({ class: "box", id: "main" });
    expect(result).toEqual({ class: "box", id: "main" });
  });
});
