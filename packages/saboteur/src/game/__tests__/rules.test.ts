// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M7 端到端：胜负判定与重开
//
// 验收标准：「一个可完整玩完的循环（胜或败，可重开）」。
// 重开依赖声明式重建——局号递增使全部实体 key 变化，框架卸载旧条目、
// 挂载新条目。这条链跨引擎、框架与视图三层，必须端到端验证。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import App from "../../app";
import { alarm, frameSystem, level, resetGameState, rules, stop } from "../instance";
import { gameState, listActors } from "../state";

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
    tickTimes(n: number) {
      for (let i = 0; i < n; i += 1) this.tick();
    },
    get pending() {
      return queue.size;
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
      now.mockRestore();
    },
  };
}

const guestsOf = () => listActors().filter((e) => e().role === "guest");

/**
 * 每例前复位全局状态。
 *
 * **`gameState` 是模块级单例，在同一测试文件内跨用例共享**——上一例改过的
 * 时限、击杀数会带到下一例（例如时限被压到 0.05 后，后续用例一开局就
 * timeout）。框架的实体随组件卸载而清理，但这些信号不会。
 */
function resetAll() {
  alarm.reset();
  resetGameState(level.objective.timeLimit);
}

describe("M7 / 目标与时限", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
    resetAll();
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("关卡目标：击杀数与时限都已配置", () => {
    expect(level.objective.killGoal).toBeGreaterThan(0);
    expect(level.objective.timeLimit).toBeGreaterThan(0);
    // 目标数应低于客人总数——否则「杀光」没有取舍余地
    expect(level.objective.killGoal).toBeLessThan(level.npcSpawns.length);
  });

  test("初始阶段为 playing，时限已装载", () => {
    const app = createApp(App);
    app.mount("#app");

    expect(gameState.phase()).toBe("playing");
    expect(gameState.timeLeft()).toBeGreaterThan(0);

    app.unmount();
  });

  test("时限递减", () => {
    const app = createApp(App);
    app.mount("#app");

    const before = gameState.timeLeft();
    driver.tickTimes(60);
    expect(gameState.timeLeft()).toBeLessThan(before);

    app.unmount();
  });

  test("时限耗尽 → timeout，且帧循环停止", () => {
    const app = createApp(App);
    app.mount("#app");

    // 把时限压到极短
    gameState.timeLeft(0.05);
    driver.tickTimes(10);

    expect(gameState.phase()).toBe("timeout");
    // 终局后不再排队新帧
    expect(driver.pending).toBe(0);

    app.unmount();
  });
});

describe("M7 / 胜负判定", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
    resetAll();
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("警报满值 → caught", () => {
    const app = createApp(App);
    app.mount("#app");

    alarm.alarm(100);
    driver.tickTimes(3);

    expect(gameState.phase()).toBe("caught");
    expect(driver.pending).toBe(0);

    app.unmount();
  });

  test("达成击杀目标 → won", () => {
    const app = createApp(App);
    app.mount("#app");

    gameState.kills(level.objective.killGoal);
    driver.tickTimes(3);

    expect(gameState.phase()).toBe("won");
    expect(driver.pending).toBe(0);

    app.unmount();
  });

  test("达成目标优先于被抓：同一帧内两者同时满足时判胜", () => {
    const app = createApp(App);
    app.mount("#app");

    gameState.kills(level.objective.killGoal);
    alarm.alarm(100);
    driver.tickTimes(3);

    // 否则「杀了最后一个目标但警报恰好满值」会误判为失败
    expect(gameState.phase()).toBe("won");

    app.unmount();
  });

  test("终局后不再判定：阶段稳定不再变化", () => {
    const app = createApp(App);
    app.mount("#app");

    alarm.alarm(100);
    driver.tickTimes(3);
    expect(gameState.phase()).toBe("caught");

    // 即使条件变化，阶段也不应再改（结算界面是静态的）
    alarm.alarm(0);
    gameState.timeLeft(100);
    driver.tickTimes(10);

    expect(gameState.phase()).toBe("caught");

    app.unmount();
  });

  test("击杀数由死亡事件累加（不需规则系统轮询）", () => {
    const app = createApp(App);
    app.mount("#app");

    expect(gameState.kills()).toBe(0);

    // 直接让一个客人中毒致死
    const guest = guestsOf()[0];
    Object.assign(guest.state, { poisonLeft: 0.01 });
    driver.tickTimes(5);

    expect(gameState.kills()).toBe(1);

    app.unmount();
  });
});

describe("M7 / 重开", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
    resetAll();
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("重开后阶段回到 playing、计数归零、时限复位", () => {
    const app = createApp(App);
    app.mount("#app");

    alarm.alarm(100);
    driver.tickTimes(3);
    expect(gameState.phase()).toBe("caught");

    rules.restart();
    driver.tickTimes(2);

    expect(gameState.phase()).toBe("playing");
    expect(gameState.kills()).toBe(0);
    expect(gameState.timeLeft()).toBeGreaterThan(0);

    app.unmount();
  });

  /**
   * 回归：重开后帧循环必须真的恢复。
   *
   * 此前 `restart` 只调 `stop()`，以为「组件重建时会 start」——但 `start()`
   * 只在根组件 `onMount` 执行一次，递增 `runId` 只重建 `Each` 的子项。
   * 结果是重开后画面冻在终局那一帧。此用例用帧计数锁定这条契约。
   */
  test("重开后帧循环恢复（不依赖组件重新挂载）", () => {
    const app = createApp(App);
    app.mount("#app");
    driver.tickTimes(3);

    alarm.alarm(100);
    driver.tickTimes(3);
    expect(gameState.phase()).toBe("caught");

    const framesAtEnd = frameSystem.frames();

    rules.restart();
    driver.tickTimes(5);

    expect(frameSystem.frames()).toBeGreaterThan(framesAtEnd);
    // 时限确实在前进（而不只是帧计数在动）
    expect(gameState.timeLeft()).toBeLessThan(level.objective.timeLimit);

    app.unmount();
  });

  test("重开后实体被重建：注册表不累积、位置回到出生点", () => {
    const app = createApp(App);
    app.mount("#app");

    const before = listActors().length;
    expect(before).toBe(1 + level.npcSpawns.length);

    // 先把一个客人挪走并杀死
    const guest = guestsOf()[0];
    Object.assign(guest.state, { x: 999, y: 999, dead: true });
    driver.tickTimes(2);

    rules.restart();
    driver.tickTimes(2);

    // 实体数不变（旧的已卸载、新的已挂载），不是翻倍
    expect(listActors().length).toBe(before);

    // 新实体的状态是干净的
    const fresh = guestsOf();
    expect(fresh.every((e) => !e().dead)).toBe(true);
    expect(fresh.every((e) => e().witnessed === false)).toBe(true);

    app.unmount();
  });

  test("重开后警报归零", () => {
    const app = createApp(App);
    app.mount("#app");

    alarm.alarm(100);
    driver.tickTimes(3);

    rules.restart();
    driver.tickTimes(2);

    expect(alarm.alarm()).toBe(0);
    expect(alarm.witnessCount()).toBe(0);

    app.unmount();
  });

  test("重开后可以再次玩到终局（循环可重复）", () => {
    const app = createApp(App);
    app.mount("#app");

    for (let round = 0; round < 3; round += 1) {
      expect(gameState.phase()).toBe("playing");

      alarm.alarm(100);
      driver.tickTimes(3);
      expect(gameState.phase()).toBe("caught");
      expect(driver.pending).toBe(0);

      rules.restart();
      driver.tickTimes(2);
    }

    app.unmount();
  });

  test("R 键触发重开", () => {
    const app = createApp(App);
    app.mount("#app");

    alarm.alarm(100);
    driver.tickTimes(3);
    expect(gameState.phase()).toBe("caught");

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR" }));
    driver.tickTimes(2);

    expect(gameState.phase()).toBe("playing");

    app.unmount();
  });
});

describe("M7 / 结算界面", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
    resetAll();
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("进行中不显示结算面板", () => {
    const app = createApp(App);
    app.mount("#app");

    // 覆盖层始终在 DOM 中，但未结算时不可见（pointer-events: none）
    const overlay = document.querySelector("#app div[class*='overlay']");
    expect(overlay).not.toBeNull();
    expect(overlay!.className).not.toContain("visible");

    app.unmount();
  });

  test("被抓住时显示结算面板与统计", () => {
    const app = createApp(App);
    app.mount("#app");

    alarm.alarm(100);
    driver.tickTimes(3);

    const overlay = document.querySelector("#app div[class*='overlay']");
    expect(overlay!.className).toContain("visible");

    const text = overlay!.textContent ?? "";
    expect(text).toContain("已被发现");
    expect(text).toContain(`/${level.objective.killGoal}`);

    app.unmount();
  });

  test("胜利时显示对应文案", () => {
    const app = createApp(App);
    app.mount("#app");

    gameState.kills(level.objective.killGoal);
    driver.tickTimes(3);

    const text = document.querySelector("#app div[class*='overlay']")!.textContent ?? "";
    expect(text).toContain("任务完成");

    app.unmount();
  });

  test("超时时显示对应文案", () => {
    const app = createApp(App);
    app.mount("#app");

    gameState.timeLeft(0.05);
    driver.tickTimes(10);

    const text = document.querySelector("#app div[class*='overlay']")!.textContent ?? "";
    expect(text).toContain("时间耗尽");

    app.unmount();
  });
});
