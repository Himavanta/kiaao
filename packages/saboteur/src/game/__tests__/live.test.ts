// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 「实体信号 ≠ 活对象」这条契约的守护测试
//
// 这组的由来：迁移时曾在 `EntitySignal` 上挂 `.state` 指向活对象，好让
// 测试直接写入。但那个字段生产代码用不上（唯一一处是死代码），等于把
// 「系统的数据」挂到「组件的句柄」上——两个通道混在了一起。
//
// 现在分开：信号只给渲染快照，活对象走 `frame(id)`。这组用例把这个区分
// 钉住，避免以后有人图方便又把活对象挂回信号。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { setAdapter } from "kiaao/adapter";
import { browserAdapter } from "kiaao/dom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import App from "../../app";
import { stop } from "../instance";
import { listActors } from "../state";
import { live, setState } from "./live";

setAdapter(browserAdapter);

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
    restore() {
      raf.mockRestore();
      caf.mockRestore();
      now.mockRestore();
    },
  };
}

let driver: ReturnType<typeof createDriver>;

beforeEach(() => {
  driver = createDriver();
  document.body.innerHTML = '<div id="app"></div>';
});

afterEach(() => {
  stop();
  driver.restore();
});

test("live() 拿到的是活对象：写入后系统立即可见", () => {
  const app = createApp(App);
  app.mount("#app");
  driver.tick();

  const guest = listActors().find((e) => e().role === "guest")!;

  // 初值来自 spawn，活对象与快照一致
  expect(live(guest).mood).toBe("wander");

  // 写活对象：系统读的就是它（这里用「同一引用」直接断言）
  const state = live(guest);
  state.mood = "panic";
  expect(live(guest).mood).toBe("panic");

  app.unmount();
});

test("写信号不等于写数据：会被下一帧 flush 覆盖", () => {
  const app = createApp(App);
  app.mount("#app");
  driver.tick();

  const guest = listActors().find((e) => e().role === "guest")!;

  // 直接写渲染信号（错误做法）
  (guest as unknown as (v: unknown) => void)({ ...guest(), mood: "panic" });
  expect(guest().mood).toBe("panic");

  // 活对象没变 → 下一帧 flush 把旧值提交回去
  driver.tick();
  expect(guest().mood).toBe("wander");
  expect(live(guest).mood).toBe("wander");

  app.unmount();
});

test("setState 转发到活对象", () => {
  const app = createApp(App);
  app.mount("#app");
  driver.tick();

  const guest = listActors().find((e) => e().role === "guest")!;
  setState(guest, { dead: true, path: [], goal: null });

  expect(live(guest).dead).toBe(true);
  expect(live(guest).path).toEqual([]);

  app.unmount();
});

test("卸载后 live() 报错（实体已出池）", () => {
  const app = createApp(App);
  app.mount("#app");
  driver.tick();

  const guest = listActors().find((e) => e().role === "guest")!;
  const id = guest.id;

  app.unmount();

  expect(() => live({ id })).toThrow(/不在池里/);
});
