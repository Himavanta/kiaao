// @vitest-environment happy-dom
// kiaao — createMotion (when mode) tests

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";
import { mount, unmount } from "../../src/dom/component.ts";
import { createMotion } from "../../src/motion/index.ts";

describe("createMotion — basics", () => {
  test("returns [play, Motion] tuple", () => {
    const [signal] = use(true);
    const [play, Motion] = createMotion(signal);
    expect(typeof play).toBe("function");
    expect(typeof Motion).toBe("function");
  });

  test("play updates the signal after animations", async () => {
    const [signal] = use(true);
    const [play] = createMotion(signal);

    const playPromise = play(false);
    expect(signal()).toBe(true); // 尚未更新

    await playPromise;
    expect(signal()).toBe(false); // 动画完成后更新
  });

  test("play(true) on already-true signal is no-op", async () => {
    const [signal] = use(true);
    const [play] = createMotion(signal);

    await play(true);
    expect(signal()).toBe(true);
  });

  test("play(false) on already-false signal is no-op", async () => {
    const [signal] = use(false);
    const [play] = createMotion(signal);

    await play(false);
    expect(signal()).toBe(false);
  });
});

describe("createMotion — with context", () => {
  test("works with component context", () => {
    const [signal] = use(true);
    const mockContext = { use };
    const [play] = createMotion(signal, mockContext);
    expect(typeof play).toBe("function");
  });

  test("without context: module-level signal works", () => {
    const [signal] = use(true);
    const [play] = createMotion(signal);
    expect(typeof play).toBe("function");
  });
});

describe("createMotion — Motion directive with when", () => {
  test("Motion inside when renders children", () => {
    const [visible] = use(true);
    const [, Motion] = createMotion(visible);

    const el = h("section", { when: visible }, h(Motion as any, null, h("p", null, "content")));
    mount(el as HTMLElement, document.body);

    expect(el.textContent).toContain("content");

    unmount(el as HTMLElement);
  });

  test("play(false) updates signal then when removes content", async () => {
    const [visible] = use(true);
    const [play, Motion] = createMotion(visible);

    const el = h("section", { when: visible }, h(Motion as any, null, h("p", null, "content")));
    mount(el as HTMLElement, document.body);
    expect(el.textContent).toContain("content");

    await play(false);

    expect(visible()).toBe(false);
    expect(el.children.length).toBe(0);

    unmount(el as HTMLElement);
  });

  test("play(true) when already visible — no change", async () => {
    const [visible] = use(true);
    const [play, Motion] = createMotion(visible);

    const el = h("section", { when: visible }, h(Motion as any, null, h("p", null, "content")));
    mount(el as HTMLElement, document.body);

    await play(true);
    expect(el.textContent).toContain("content");

    unmount(el as HTMLElement);
  });

  test("toggle off then on", async () => {
    const [visible, setVisible] = use(true);
    const [play, Motion] = createMotion(visible);

    const el = h("section", { when: visible }, h(Motion as any, null, h("p", null, "content")));
    mount(el as HTMLElement, document.body);
    expect(el.textContent).toContain("content");

    await play(false);
    expect(el.children.length).toBe(0);

    // 重新打开
    setVisible(true);
    mount(el as HTMLElement, document.body);
    expect(el.textContent).toContain("content");

    unmount(el as HTMLElement);
  });
});

describe("createMotion — rapid calls", () => {
  test("rapid play calls: only last setter takes effect", async () => {
    const [signal] = use(true);
    const [play] = createMotion(signal);

    // 快速连续调用（先发起的 play 被丢弃）
    void play(false);
    void play(true);
    await play(false);

    expect(signal()).toBe(false);
  });
});

describe("createMotion — without from/to", () => {
  test("Motion without from prop does not crash on exit", async () => {
    const [visible] = use(true);
    const [play, Motion] = createMotion(visible);

    const el = h(
      "section",
      { when: visible },
      h(Motion as any, { to: { opacity: 1 } }, h("p", null, "no-from")),
    );
    mount(el as HTMLElement, document.body);

    await play(false);
    expect(visible()).toBe(false);

    unmount(el as HTMLElement);
  });

  test("Motion without to prop does not crash on mount", () => {
    const [visible] = use(true);
    const [, Motion] = createMotion(visible);

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
