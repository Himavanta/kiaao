// @vitest-environment happy-dom
// kiaao — createMotion (when mode) tests — 新 API

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";
import { mount, unmount } from "../../src/dom/component.ts";
import { createMotion } from "../../src/motion/index.ts";

describe("createMotion — basics", () => {
  test("returns [visible, Motion] tuple", () => {
    const [signal] = use(true);
    const [visible, Motion] = createMotion(signal);
    expect(typeof visible).toBe("function");
    expect(typeof Motion).toBe("function");
  });

  test("visible initial value equals state initial value", () => {
    const [state] = use(true);
    const [visible] = createMotion(state);
    expect(visible()).toBe(true);
  });

  test("visible initial value is false when state starts false", () => {
    const [state] = use(false);
    const [visible] = createMotion(state);
    expect(visible()).toBe(false);
  });

  test("state(true) updates visible immediately (no exit animation needed)", () => {
    const [state, setState] = use(false);
    const [visible] = createMotion(state);
    expect(visible()).toBe(false);

    setState(true);
    expect(visible()).toBe(true);
  });

  test("state(false) triggers exit animation, visible updates after animation", async () => {
    const [state, setState] = use(true);
    const [visible] = createMotion(state);

    setState(false);

    await new Promise((r) => setTimeout(r, 100));

    expect(visible()).toBe(false);
  });
});

describe("createMotion — with context", () => {
  test("works with component context", () => {
    const [state] = use(true);
    const mockContext = { use };
    const [visible] = createMotion(state, mockContext);
    expect(typeof visible).toBe("function");
  });

  test("without context: module-level signal works", () => {
    const [state] = use(true);
    const [visible] = createMotion(state);
    expect(typeof visible).toBe("function");
  });
});

describe("createMotion — Motion directive with when", () => {
  test("Motion inside when renders children", () => {
    const [state] = use(true);
    const [visible, Motion] = createMotion(state);

    const el = h("section", { when: visible }, h(Motion as any, null, h("p", null, "content")));
    mount(el as HTMLElement, document.body);

    expect(el.textContent).toContain("content");

    unmount(el as HTMLElement);
  });

  test("state(false) triggers exit animation then when removes content", async () => {
    const [state, setState] = use(true);
    const [visible, Motion] = createMotion(state);

    const el = h("section", { when: visible }, h(Motion as any, null, h("p", null, "content")));
    mount(el as HTMLElement, document.body);
    expect(el.textContent).toContain("content");

    setState(false);

    // 等待动画完成 + visible 更新
    await new Promise((r) => setTimeout(r, 500));

    expect(visible()).toBe(false);
    expect(el.children.length).toBe(0);

    unmount(el as HTMLElement);
  });

  test("state(true) when already visible — content stays", async () => {
    const [state, setState] = use(true);
    const [visible, Motion] = createMotion(state);

    const el = h("section", { when: visible }, h(Motion as any, null, h("p", null, "content")));
    mount(el as HTMLElement, document.body);

    setState(true);
    expect(visible()).toBe(true);
    expect(el.textContent).toContain("content");

    unmount(el as HTMLElement);
  });

  test("toggle off then on", async () => {
    const [state, setState] = use(true);
    const [visible, Motion] = createMotion(state);

    const el = h("section", { when: visible }, h(Motion as any, null, h("p", null, "content")));
    mount(el as HTMLElement, document.body);
    expect(el.textContent).toContain("content");

    setState(false);
    await new Promise((r) => setTimeout(r, 500));
    expect(el.children.length).toBe(0);

    // 重新打开
    setState(true);
    expect(visible()).toBe(true);
    expect(el.textContent).toContain("content");

    unmount(el as HTMLElement);
  });
});

describe("createMotion — rapid calls", () => {
  test("rapid toggles: final visible matches final state", async () => {
    const [state, setState] = use(true);
    const [visible] = createMotion(state);

    // 快速连续切换
    setState(false);
    setState(true);
    setState(false);

    // 等待动画完成
    await new Promise((r) => setTimeout(r, 500));

    expect(visible()).toBe(false);
  });

  test("mid-reversal: cancel exit on state(true)", async () => {
    const [state, setState] = use(true);
    const [visible] = createMotion(state);

    setState(false);
    // 退出动画播放中 → 反悔
    setState(true);

    expect(visible()).toBe(true);

    await new Promise((r) => setTimeout(r, 500));
    expect(visible()).toBe(true);
  });
});

describe("createMotion — without from/to", () => {
  test("Motion without from prop does not crash on exit", async () => {
    const [state, setState] = use(true);
    const [visible, Motion] = createMotion(state);

    const el = h(
      "section",
      { when: visible },
      h(Motion as any, { to: { opacity: 1 } }, h("p", null, "no-from")),
    );
    mount(el as HTMLElement, document.body);

    setState(false);
    await new Promise((r) => setTimeout(r, 500));
    expect(visible()).toBe(false);

    unmount(el as HTMLElement);
  });

  test("Motion without to prop does not crash on mount", () => {
    const [state] = use(true);
    const [visible, Motion] = createMotion(state);

    const el = h(
      "section",
      { when: visible },
      h(Motion as any, { from: { opacity: 0 } }, h("p", null, "no-to")),
    );
    mount(el as HTMLElement, document.body);
    expect(el.textContent).toContain("no-to");

    unmount(el as HTMLElement);
  });
});
