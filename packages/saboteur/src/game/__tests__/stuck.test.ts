// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 静止与僵死回归测试
//
// 这组用例的由来：一次实测发现「走一会儿人全停下不动」。根因是三个
// 互不相关的 bug 叠加，且都只在长时间运行后显现：
//
// 1. 恐慌永不过期——behaviour 在 witnessed 时早退，moodLeft 再无人递减
// 2. 恐慌目标可能是自身格——findPath 返回空路径，陷入「有目标无路径」
// 3. **空数组是 truthy**——`path ? ... : ...` 把「已在目标格」当成成功，
//    每帧重新规划到当前格，无限空转
//
// 三者都表现为「NPC 站着不动」，靠单点单测很难区分，必须用长时程模拟。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import App from "../../app";
import { alarm, stop } from "../instance";
import { listActors } from "../state";

function createDriver(stepMs = 16) {
  const queue = new Map<number, (t: number) => void>();
  let nextId = 1;
  let clock = 0;

  const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  const caf = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id: any) => {
    queue.delete(id);
  });
  const now = vi.spyOn(performance, "now").mockImplementation(() => clock);

  return {
    tick() {
      clock += stepMs;
      const pending = [...queue.values()];
      queue.clear();
      for (const cb of pending) cb(clock);
    },
    /** 推进 frames 帧，返回期间「所有客人位置完全不变」的最长连续帧数 */
    run(frames: number): number {
      let lastKey = "";
      let still = 0;
      let worst = 0;

      for (let i = 0; i < frames; i += 1) {
        this.tick();

        const guests = listActors().filter((e) => e().role === "guest" && !e().dead);
        const key = guests.map((e) => `${Math.round(e().x)},${Math.round(e().y)}`).join("|");
        if (key === lastKey) {
          still += 1;
          worst = Math.max(worst, still);
        } else {
          still = 0;
        }
        lastKey = key;
      }

      return worst;
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
      now.mockRestore();
    },
  };
}

const guestsOf = () => listActors().filter((e) => e().role === "guest");

describe("僵死回归 / 长期运行", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
    alarm.reset();
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("无事件时：5 分钟内不存在全员静止（含游荡与驻足循环）", () => {
    const app = createApp(App);
    app.mount("#app");

    // 5 分钟 = 18750 帧。留出余量：驻足最长 3.5s（约 220 帧），
    // 全员同时驻足的窗口远小于 600 帧
    const worst = driver.run(18750);

    expect(worst).toBeLessThan(600);
    app.unmount();
  });

  test("尸体引发恐慌后：5 分钟内不存在全员静止（恐慌会结束并恢复游荡）", () => {
    const app = createApp(App);
    app.mount("#app");

    // 大厅中央放一具尸体，触发完整传播链
    const victim = guestsOf()[0];
    (victim as any)({ ...victim(), x: 16 * 32, y: 11 * 32, dead: true, path: [], goal: null });

    const worst = driver.run(18750);

    // 恐慌结束后若 goal 未被清理，NPC 会「规划到自身格」而无限空转——
    // 这正是本用例要盯住的回归
    expect(worst).toBeLessThan(600);
    app.unmount();
  });

  test("恐慌会到期结束：panic 人数最终归零", () => {
    const app = createApp(App);
    app.mount("#app");

    const victim = guestsOf()[0];
    (victim as any)({ ...victim(), x: 16 * 32, y: 11 * 32, dead: true, path: [], goal: null });

    // 先让恐慌扩散
    driver.run(1800);
    expect(guestsOf().some((e) => e().witnessed)).toBe(true);

    // 再跑 3 分钟：恐慌（30s）应早已到期
    driver.run(11250);

    const panicking = guestsOf().filter((e) => e().mood === "panic").length;
    const witnessed = guestsOf().filter((e) => e().witnessed).length;

    // 情绪结束，但记忆保留——这是两者的关键区别
    expect(panicking).toBe(0);
    expect(witnessed).toBeGreaterThan(0);

    app.unmount();
  });

  test("恐慌结束后恢复正常游荡（path 会重新变非空）", () => {
    const app = createApp(App);
    app.mount("#app");

    const victim = guestsOf()[0];
    (victim as any)({ ...victim(), x: 16 * 32, y: 11 * 32, dead: true, path: [], goal: null });

    driver.run(18750);

    // 所有客人都应处于「有路径」或「正常驻足」之一，
    // 而非「既无路径也无目标」的僵死态
    for (const guest of guestsOf()) {
      const a = guest();
      const hasWork = a.path.length > 0 || a.goal !== null || a.idleLeft > 0;
      expect(hasWork).toBe(true);
    }

    app.unmount();
  });

  test("长时间运行不产生 NaN 坐标", () => {
    const app = createApp(App);
    app.mount("#app");

    const victim = guestsOf()[0];
    (victim as any)({ ...victim(), x: 16 * 32, y: 11 * 32, dead: true, path: [], goal: null });

    driver.run(18750);

    for (const entity of listActors()) {
      const a = entity();
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
    }

    app.unmount();
  });
});
