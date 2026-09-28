// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M0/M1 端到端验证：真实挂载 App，确认整条渲染通路打通
//
// 覆盖构建成功无法证明的部分：帧循环是否真在跑、实体是否真注册、
// 指令是否真拿到元素、StyleMemo 是否真在写 DOM。
//
// 注：happy-dom 的 `getContext("2d")` 返回 null，因此 canvas 的绘制
// 结果在测试环境不可验证——绘制逻辑的纯计算部分由 `paint.test.ts`
// 覆盖，此处只验证指令确实作用于子元素。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import App from "../../app";
import { level, frameSystem, stop } from "../instance";

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

describe("端到端 / 生命周期", () => {
  let driver: ReturnType<typeof createRafDriver>;

  beforeEach(() => {
    driver = createRafDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    stop();
    driver.restore();
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

describe("端到端 / 关卡渲染", () => {
  let driver: ReturnType<typeof createRafDriver>;

  beforeEach(() => {
    driver = createRafDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("canvas 元素被渲染到 DOM", () => {
    const app = createApp(App);
    app.mount("#app");

    const canvas = document.querySelector("#app canvas");
    expect(canvas).not.toBeNull();

    app.unmount();
  });

  test("Tilemap 指令确实在子元素上执行（而非静默跳过）", () => {
    // 指令作用于子元素而非指令元素本身——写成自闭合形态时指令不会执行，
    // 且失败是静默的（页面只是空白）。此处用 getContext 调用证明其已运行。
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

    const app = createApp(App);
    app.mount("#app");

    expect(spy).toHaveBeenCalledWith("2d");

    app.unmount();
    spy.mockRestore();
  });

  test("舞台世界层尺寸与关卡网格一致", () => {
    const app = createApp(App);
    app.mount("#app");

    // 世界层承载地图尺寸——尺寸错了地图会被裁切或留白
    const expectedW = level.grid.cols * 32;
    const expectedH = level.grid.rows * 32;
    const worldLayer = [...document.querySelectorAll("#app div[style]")].find((el) => {
      const s = el.getAttribute("style") ?? "";
      return s.includes(`${expectedW}px`) && s.includes(`${expectedH}px`);
    });

    expect(worldLayer).toBeDefined();
    app.unmount();
  });

  test("相机夹在世界边界内：初始位置为 0 起始（出生点靠左上时）", () => {
    const app = createApp(App);
    app.mount("#app");

    // 世界层 translate 应被夹在 <= 0 的范围内（相机坐标非负）
    const styles = [...document.querySelectorAll("#app div[style]")].map(
      (el) => el.getAttribute("style") ?? "",
    );
    const translated = styles.filter((s) => s.includes("translate"));

    expect(translated.length).toBeGreaterThan(0);
    for (const s of translated) {
      const match = /translate:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(s);
      if (!match) continue;
      // 相机 x/y >= 0 → translate 为负值或 0
      expect(Number(match[1])).toBeLessThanOrEqual(0);
      expect(Number(match[2])).toBeLessThanOrEqual(0);
    }

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

  test("帧率按采样间隔写入，而非每帧", () => {
    const app = createApp(App);
    app.mount("#app");

    // 采样窗口（250ms）内连续推进数帧，帧率信号不应变化
    const fpsBefore = frameSystem.fps();
    for (let i = 0; i < 3; i += 1) driver.tick();
    expect(frameSystem.fps()).toBe(fpsBefore);

    app.unmount();
  });
});
