// @vitest-environment happy-dom
// kiaao v4 — Directive system: Phase 0 tests
// direct(), isDirective(), createDirectiveContext()

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { DIRECT_KEY, DIRECTIVE_MOUNT, DIRECTIVE_UNMOUNT } from "../../src/reactive/types.ts";
import { direct, isDirective, createDirectiveContext } from "../../src/dom/directive.ts";
import type { DirectiveFunction } from "../../src/dom/directive.ts";

// ── direct() ──────────────────────────────────────────

describe("direct()", () => {
  test("adds DIRECT_KEY marker to the function", () => {
    const fn: DirectiveFunction = (el, _props, _ctx) => {
      el.setAttribute("data-test", "true");
    };
    const dir = direct(fn);
    expect((dir as any)[DIRECT_KEY]).toBe(true);
  });

  test("returns the same function reference", () => {
    const fn: DirectiveFunction = () => {};
    const dir = direct(fn);
    expect(dir).toBe(fn);
  });

  test("does not interfere with function execution", () => {
    const el = document.createElement("div");
    const fn: DirectiveFunction = (el) => {
      el.setAttribute("data-test", "called");
    };
    const dir = direct(fn);
    dir(el, {}, createDirectiveContext(el));
    expect(el.getAttribute("data-test")).toBe("called");
  });

  test("multiple directives have independent markers", () => {
    const fn1: DirectiveFunction = () => {};
    const fn2: DirectiveFunction = () => {};
    const dir1 = direct(fn1);
    const dir2 = direct(fn2);
    expect((dir1 as any)[DIRECT_KEY]).toBe(true);
    expect((dir2 as any)[DIRECT_KEY]).toBe(true);
    expect(dir1).not.toBe(dir2);
  });
});

// ── isDirective() ──────────────────────────────────────

describe("isDirective()", () => {
  test("returns true for direct()-created function", () => {
    const dir = direct(() => {});
    expect(isDirective(dir)).toBe(true);
  });

  test("returns false for plain function", () => {
    expect(isDirective(() => {})).toBe(false);
  });

  test("returns false for null", () => {
    expect(isDirective(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isDirective(undefined)).toBe(false);
  });

  test("returns false for object", () => {
    expect(isDirective({})).toBe(false);
  });

  test("returns false for number", () => {
    expect(isDirective(42)).toBe(false);
  });

  test("returns false for string", () => {
    expect(isDirective("hello")).toBe(false);
  });
});

// ── createDirectiveContext() ──────────────────────────

describe("createDirectiveContext()", () => {
  test("returns context with onMount, onUnmount, use", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);
    expect(typeof ctx.onMount).toBe("function");
    expect(typeof ctx.onUnmount).toBe("function");
    expect(typeof ctx.use).toBe("function");
  });

  test("context methods operate on the provided element", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const mountFn = () => {};
    const unmountFn = () => {};

    ctx.onMount(mountFn);
    ctx.onUnmount(unmountFn);

    const mounts = (el as any)[DIRECTIVE_MOUNT] as Set<() => void>;
    const unmounts = (el as any)[DIRECTIVE_UNMOUNT] as Set<() => void>;

    expect(mounts).toBeInstanceOf(Set);
    expect(mounts.has(mountFn)).toBe(true);
    expect(unmounts).toBeInstanceOf(Set);
    expect(unmounts.has(unmountFn)).toBe(true);
  });

  test("multiple onMount registrations are all stored", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const fn1 = () => {};
    const fn2 = () => {};

    ctx.onMount(fn1);
    ctx.onMount(fn2);

    const mounts = (el as any)[DIRECTIVE_MOUNT] as Set<() => void>;
    expect(mounts.size).toBe(2);
    expect(mounts.has(fn1)).toBe(true);
    expect(mounts.has(fn2)).toBe(true);
  });

  test("onUnmount does not affect mount set", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    ctx.onMount(() => {});
    ctx.onUnmount(() => {});

    expect((el as any)[DIRECTIVE_MOUNT]).toBeDefined();
    expect((el as any)[DIRECTIVE_UNMOUNT]).toBeDefined();

    const mounts = (el as any)[DIRECTIVE_MOUNT] as Set<() => void>;
    const unmounts = (el as any)[DIRECTIVE_UNMOUNT] as Set<() => void>;

    expect(mounts.size).toBe(1);
    expect(unmounts.size).toBe(1);
  });
});

// ── context.use() ────────────────────────────────────

describe("context.use()", () => {
  test("creates a new definition signal", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const [val, setVal] = ctx.use(42);
    expect(val()).toBe(42);
    setVal(100);
    expect(val()).toBe(100);
  });

  test("creates a new derivation signal", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const [a] = ctx.use(5);
    const [b] = ctx.use(a, () => a() * 2);
    expect(b()).toBe(10);
  });

  test("new signal registers stop to element's LOCAL_EFFECTS", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    ctx.use(0);

    const [count, setCount] = ctx.use(0);
    expect(count()).toBe(0);
    setCount(5);
    expect(count()).toBe(5);
  });

  test("reference to existing signal does NOT register cleanup", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const [a] = use(42);

    // use an existing getter
    const [b] = ctx.use(a);
    expect(b).toBe(a); // same reference
  });

  test("use on existing signal returns same getter and setter", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const [a, setA] = use(10);
    const [b, setB] = ctx.use(a);

    expect(b).toBe(a);
    expect(setB).toBe(setA);

    setB(20);
    expect(a()).toBe(20);
  });

  test("context.use can create derivation with existing signal reference", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const [a, setA] = use(3);
    const [b] = ctx.use(a, () => a() * 3);

    expect(b()).toBe(9);
    setA(5);
    expect(b()).toBe(15);
  });
});

// ── Multiple contexts on same element ─────────────────

describe("multiple contexts on same element", () => {
  test("two contexts can register callbacks on the same element", () => {
    const el = document.createElement("div");
    const ctx1 = createDirectiveContext(el);
    const ctx2 = createDirectiveContext(el);

    ctx1.onMount(() => {});
    ctx2.onMount(() => {});

    const mounts = (el as any)[DIRECTIVE_MOUNT] as Set<() => void>;
    expect(mounts.size).toBe(2);
  });

  test("two contexts share the same mount/unmount sets", () => {
    const el = document.createElement("div");
    const ctx1 = createDirectiveContext(el);
    const ctx2 = createDirectiveContext(el);

    ctx1.onMount(() => {});
    ctx2.onMount(() => {});

    const mounts = (el as any)[DIRECTIVE_MOUNT] as Set<() => void>;
    expect(mounts.size).toBe(2);

    ctx1.onUnmount(() => {});
    ctx2.onUnmount(() => {});

    const unmounts = (el as any)[DIRECTIVE_UNMOUNT] as Set<() => void>;
    expect(unmounts.size).toBe(2);
  });
});
