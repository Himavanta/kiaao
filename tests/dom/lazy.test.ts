// @vitest-environment happy-dom
// kiaao — lazy 极限测试

import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";
import { h } from "../../src/index.ts";
import { mount, unmount } from "../../src/dom/component.ts";
import { lazy } from "../../src/dom/lazy.ts";

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(() => {
  container.remove();
});

describe("lazy — basic", () => {
  test("renders after module loads", async () => {
    const Async = lazy(() => Promise.resolve({ default: () => h("p", null, "loaded") }));
    const el = h(Async);
    mount(el as HTMLElement, container);

    expect((el as HTMLElement).style.display).toBe("contents");

    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toBe("loaded");
    unmount(el as HTMLElement);
  });

  test("accepts module without default export", async () => {
    const Async = lazy(() => Promise.resolve((() => h("span", null, "direct")) as any));
    const el = h(Async);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toBe("direct");
    unmount(el as HTMLElement);
  });
});

describe("lazy — error handling", () => {
  test("displays error text when loader rejects", async () => {
    const orig = console.error;
    console.error = () => {};

    const Async = lazy(() => Promise.reject(new Error("fail")));
    const el = h(Async);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 10));

    expect(el.textContent).toContain("fail");
    console.error = orig;
    unmount(el as HTMLElement);
  });
});

describe("lazy — cleanup", () => {
  test("unmount before resolve does not crash", async () => {
    const Async = lazy(() => Promise.resolve({ default: () => h("p", null, "never") }));
    const el = h(Async);
    mount(el as HTMLElement, container);
    unmount(el as HTMLElement);
    await new Promise((r) => setTimeout(r, 10));
  });
});

describe("lazy — nested", () => {
  test("lazy component containing sync component", async () => {
    const Async = lazy(() =>
      Promise.resolve({ default: () => h("div", null, h("span", null, "nested")) }),
    );
    const el = h(Async);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toBe("nested");
    unmount(el as HTMLElement);
  });

  test("lazy component with props", async () => {
    const Async = lazy(() => Promise.resolve({ default: (props: any) => h("p", null, props.msg) }));
    const el = h(Async, { msg: "prop-value" });
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toBe("prop-value");
    unmount(el as HTMLElement);
  });
});
