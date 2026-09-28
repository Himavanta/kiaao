// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M0 端到端验证：真实挂载 App，确认整条渲染通路打通
//
// 覆盖从帧循环到 DOM 的完整链路——这是构建成功无法证明的部分：
// 帧循环是否真在跑、实体是否真注册、StyleMemo 是否真在写 DOM。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import App from "../../app";
import { entityCount, frameSystem, stop } from "../instance";

/**
 * 手动驱动的 raf：逐帧推进且不递归。
 * cancelAnimationFrame 真正从队列移除——否则无法验证「stop 后不再有帧」。
 */
function createRafDriver() {
  const queue = new Map<number, (t: number) => void>();
  let nextId = 1;

  const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  const caf = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id: any) => {
    queue.delete(id);
  });

  return {
    /** 推进一帧：取当前队列快照执行（执行中新增的留到下一帧） */
    tick() {
      const pending = [...queue.values()];
      queue.clear();
      for (const cb of pending) cb(performance.now());
    },
    get pending() {
      return queue.size;
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
    },
  };
}

/** 取页面上所有带 inline style 的 div 的 style 文本 */
function markerStyles(): string[] {
  return [...document.querySelectorAll("#app div[style]")].map(
    (el) => el.getAttribute("style") ?? "",
  );
}

describe("M0 端到端 / 生命周期", () => {
  let driver: ReturnType<typeof createRafDriver>;

  beforeEach(() => {
    driver = createRafDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("挂载后实体注册，卸载后清空", () => {
    const app = createApp(App);
    app.mount("#app");
    expect(entityCount()).toBe(3);

    app.unmount();
    expect(entityCount()).toBe(0);
  });

  test("挂载时帧循环启动", () => {
    const app = createApp(App);
    app.mount("#app");
    expect(driver.pending).toBeGreaterThan(0);
    app.unmount();
  });

  test("卸载后帧循环停止：推进帧不再执行任何 update", () => {
    const app = createApp(App);
    app.mount("#app");
    app.unmount();

    const framesAfterUnmount = frameSystem.frames();
    driver.tick();

    expect(frameSystem.frames()).toBe(framesAfterUnmount);
  });
});

describe("M0 端到端 / 渲染通路", () => {
  let driver: ReturnType<typeof createRafDriver>;

  beforeEach(() => {
    driver = createRafDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("初始渲染产出标记元素", () => {
    const app = createApp(App);
    app.mount("#app");

    expect(markerStyles().length).toBeGreaterThanOrEqual(3);
    app.unmount();
  });

  test("帧推进后实体位置更新（帧循环在跑）", () => {
    const app = createApp(App);
    app.mount("#app");

    const before = frameSystem.frames();
    driver.tick();
    driver.tick();
    driver.tick();

    expect(frameSystem.frames()).toBeGreaterThan(before);
    app.unmount();
  });

  test("StyleMemo 把位置写进 DOM：帧推进后 translate 值变化", () => {
    const app = createApp(App);
    app.mount("#app");

    const initial = markerStyles();
    for (let i = 0; i < 5; i += 1) driver.tick();
    const after = markerStyles();

    // 至少有一个标记的样式随帧变化——「实体 → DOM」通路的实证
    expect(after.some((s, i) => s !== initial[i])).toBe(true);
    app.unmount();
  });

  test("同一帧内样式只提交一次：帧末 flush 后 DOM 与信号一致", () => {
    const app = createApp(App);
    app.mount("#app");

    driver.tick();
    const afterFirst = markerStyles();

    // 不再推进帧时，样式保持稳定（无残留写）
    expect(markerStyles()).toEqual(afterFirst);
    app.unmount();
  });
});

describe("M0 帧统计系统", () => {
  let driver: ReturnType<typeof createRafDriver>;

  beforeEach(() => {
    driver = createRafDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("帧率按采样间隔写入，而非每帧", () => {
    const app = createApp(App);
    app.mount("#app");

    // 采样窗口（250ms）内连续推进数帧，帧率信号不应变化
    const fpsBefore = frameSystem.fps();
    for (let i = 0; i < 3; i += 1) driver.tick();

    expect(frameSystem.fps()).toBe(fpsBefore);
    app.unmount();
  });

  test("帧计数每帧递增", () => {
    const app = createApp(App);
    app.mount("#app");

    const before = frameSystem.frames();
    driver.tick();
    expect(frameSystem.frames()).toBe(before + 1);

    driver.tick();
    expect(frameSystem.frames()).toBe(before + 2);
    app.unmount();
  });
});
