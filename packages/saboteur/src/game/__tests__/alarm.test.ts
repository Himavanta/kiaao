// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M6 端到端：目击 → 恐慌 → 传播 → 报警
//
// 验收标准：「杀人被看见 → 目击者逃离并传播 → 报警触发」。
// 这是整个项目的核心里程碑——它消费 M4 的 visibleIds 与 M5 的尸体，
// 把侦测链闭合。任何一环接线错误都只表现为「NPC 反应怪」，必须端到端验证。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import App from "../../app";
import { alarm, level, stop } from "../instance";
import { listActors } from "../state";
import { ALARM_PER_WITNESS } from "../systems/alarm";
import type { ActorEntity } from "../types";

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
    /** 推进足够多帧让感知跑过至少一轮（感知间隔 6 帧） */
    perceive() {
      this.tickTimes(8);
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
      now.mockRestore();
    },
  };
}

const playerOf = () => listActors().find((e) => e().role === "player")!;
const guestsOf = () => listActors().filter((e) => e().role === "guest");

/**
 * 把实体放到指定像素位置并指定朝向。
 *
 * `idleLeft` 给一个很大的值：客人会自动寻路并**边走边转向**，几帧内
 * 朝向就变了。要隔离「视线判定」这件事，必须让被观察者保持静止——
 * 否则测的是「它转身之后能否看见」，而不是「背对时看不见」。
 */
function place(
  entity: ReturnType<typeof playerOf>,
  pos: { x: number; y: number },
  facing: ActorEntity["facing"],
) {
  (entity as any)({
    ...entity(),
    x: pos.x,
    y: pos.y,
    facing,
    path: [],
    goal: null,
    idleLeft: 1e6,
    moodLeft: 1e6,
  });
}

/** 每帧重新钉住位置与朝向，用于需要多轮感知的用例 */
function pin(
  entity: ReturnType<typeof playerOf>,
  pos: { x: number; y: number },
  facing: ActorEntity["facing"],
) {
  (entity as any)({
    ...entity(),
    x: pos.x,
    y: pos.y,
    facing,
    path: [],
    goal: null,
    idleLeft: 1e6,
    moodLeft: 1e6,
  });
}

/**
 * 把除 `keep` 之外的角色全部挪到地图边角并背对场地。
 *
 * 隔离是必需的：**传播链本身会污染用例**——其他客人游荡时看见尸体就会
 * 恐慌，而恐慌者又会被本用例的观察者看见，于是「A 看见尸体」变成
 * 「A 看见恐慌的 B」。不隔离就分不清在测哪条路径。
 *
 * 隔离点沿地图下边缘排开，彼此间距远大于视距（7 格），且背朝北——
 * 挤在同一格会让它们互相进入对方视野，隔离就失效了。
 */
function isolate(keep: Array<ReturnType<typeof playerOf>>) {
  const bottom = level.grid.rows - 2;
  let slot = 0;

  for (const entity of listActors()) {
    if (keep.includes(entity)) continue;
    // 沿底边每隔 8 格放一个（> 视距 7 格）
    const col = 1 + slot * 8;
    pin(entity, { x: col * 32 + 6, y: bottom * 32 + 6 }, "north");
    slot += 1;
  }
}

/**
 * 逐帧重钉所有角色，跑满 `frames` 帧。
 *
 * **必须逐帧重钉，而不是「钉一次 → 跑 8 帧」**：客人会自动寻路并边走边
 * 转向，8 帧内朝向就变了——于是「背对尸体」的用例会因角色自己转身而
 * 失败，看起来像判定坏了。逐帧钉住才能隔离出「视线判定」这一件事。
 */
function holdIsolation(
  keep: Array<ReturnType<typeof playerOf>>,
  frames: number,
  driver: ReturnType<typeof createDriver>,
  each?: () => void,
) {
  for (let i = 0; i < frames; i += 1) {
    isolate(keep);
    each?.();
    driver.tick();
  }
}

describe("M6 / 目击与恐慌", () => {
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

  test("初始警报为 0、无目击者", () => {
    const app = createApp(App);
    app.mount("#app");

    expect(alarm.alarm()).toBe(0);
    expect(alarm.witnessCount()).toBe(0);

    app.unmount();
  });

  test("客人看见尸体 → 恐慌并计入警报", () => {
    const app = createApp(App);
    app.mount("#app");

    const guest = guestsOf()[0];
    const victim = guestsOf()[1];
    // 尸体在客人正东 2 格
    place(victim, { x: 7 * 32, y: 10 * 32 }, "west");
    (victim as any)({ ...victim(), dead: true, path: [], goal: null });

    holdIsolation([guest, victim], 40, driver, () => {
      pin(guest, { x: 5 * 32, y: 10 * 32 }, "east");
    });

    expect(guest().witnessed).toBe(true);
    expect(guest().mood).toBe("panic");
    expect(alarm.alarm()).toBeGreaterThan(0);
    expect(alarm.witnessCount()).toBeGreaterThan(0);

    app.unmount();
  });

  test("背对尸体：不恐慌（视线判定生效）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guest = guestsOf()[0];
    const victim = guestsOf()[1];
    place(victim, { x: 7 * 32, y: 10 * 32 }, "west");
    (victim as any)({ ...victim(), dead: true, path: [], goal: null });

    // 隔离其他角色：否则它们会发现尸体并传播恐慌，污染本用例
    holdIsolation([guest, victim], 40, driver, () => {
      pin(guest, { x: 5 * 32, y: 10 * 32 }, "west");
    });

    expect(guest().witnessed).toBe(false);
    expect(alarm.alarm()).toBe(0);

    app.unmount();
  });

  test("同一具尸体只计入一次（去重）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guest = guestsOf()[0];
    const victim = guestsOf()[1];
    place(victim, { x: 7 * 32, y: 10 * 32 }, "west");
    (victim as any)({ ...victim(), dead: true, path: [], goal: null });

    // 让感知跑多轮（每 6 帧一轮）
    holdIsolation([guest, victim], 120, driver, () => {
      pin(guest, { x: 5 * 32, y: 10 * 32 }, "east");
    });

    // 只该计入一次：若缺去重，警报会瞬间爆表
    expect(alarm.alarm()).toBe(ALARM_PER_WITNESS);

    app.unmount();
  });

  test("恐慌状态不可逆（不会冷静下来）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guest = guestsOf()[0];
    const victim = guestsOf()[1];
    place(victim, { x: 7 * 32, y: 10 * 32 }, "west");
    (victim as any)({ ...victim(), dead: true, path: [], goal: null });

    holdIsolation([guest, victim], 40, driver, () => {
      pin(guest, { x: 5 * 32, y: 10 * 32 }, "east");
    });
    expect(guest().witnessed).toBe(true);

    // 推进 40 秒：远超 panic 计时（30s）
    driver.tickTimes(2500);

    expect(guest().witnessed).toBe(true);
    expect(guest().mood).toBe("panic");

    app.unmount();
  });
});

describe("M6 / 传播链", () => {
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

  test("恐慌者会让看见他的人也恐慌（无需额外传播机制）", () => {
    const app = createApp(App);
    app.mount("#app");

    // A 看见尸体 → 恐慌
    const a = guestsOf()[0];
    const corpse = guestsOf()[1];
    const b = guestsOf()[2];

    place(corpse, { x: 7 * 32, y: 10 * 32 }, "west");
    (corpse as any)({ ...corpse(), dead: true, path: [], goal: null });

    // A 朝东正对尸体；B 在 A 的正西、面朝东（能看见 A）。
    // 三者都逐帧钉住——传的是「A 的恐慌状态」，不是位置变化。
    holdIsolation([a, b, corpse], 60, driver, () => {
      pin(a, { x: 5 * 32, y: 10 * 32 }, "east");
      pin(b, { x: 3 * 32, y: 10 * 32 }, "east");
    });

    // A 目击尸体、B 目击「恐慌中的 A」——传播链无需额外机制
    expect(a().witnessed).toBe(true);
    expect(b().witnessed).toBe(true);
    expect(alarm.witnessCount()).toBeGreaterThanOrEqual(2);

    app.unmount();
  });

  test("传播使警报持续上升（多人目击累加）", () => {
    const app = createApp(App);
    app.mount("#app");

    const corpse = guestsOf()[0];
    place(corpse, { x: 16 * 32, y: 11 * 32 }, "south");
    (corpse as any)({ ...corpse(), dead: true, path: [], goal: null });

    // 把观察者放在尸体的同侧、彼此背对的位置。
    // 不能围成一圈：两侧的观察者会互相进入对方视野，于是「看见尸体」
    // 与「看见恐慌的别人」混在一起，警报值就不再等于目击者数 × 增量。
    // 三个位置都经过几何验证：能看见位于 (16,11) 的尸体，
    // 且彼此不在对方视锥内（否则会数到「看见恐慌的别人」）。
    const watchers = guestsOf().slice(1, 4);
    const offsets = [
      { x: 13 * 32, y: 11 * 32, facing: "east" as const },
      { x: 16 * 32, y: 13 * 32, facing: "north" as const },
      { x: 15 * 32, y: 13 * 32, facing: "north" as const },
    ];

    // 逐帧钉住观察者：它们会自动寻路并转向，钉一次撑不过 8 帧
    holdIsolation([corpse, ...watchers], 20, driver, () => {
      watchers.forEach((w, i) => {
        const o = offsets[i];
        if (o) pin(w, { x: o.x, y: o.y }, o.facing);
      });
    });

    const expected = watchers.length * ALARM_PER_WITNESS;
    expect(alarm.alarm()).toBe(expected);

    app.unmount();
  });
});

describe("M6 / 玩家不参与恐慌链", () => {
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

  test("玩家看见尸体不会恐慌（也不会变成传播源）", () => {
    const app = createApp(App);
    app.mount("#app");

    const player = playerOf();
    place(player, { x: 5 * 32, y: 10 * 32 }, "east");

    const corpse = guestsOf()[0];
    place(corpse, { x: 7 * 32, y: 10 * 32 }, "west");
    (corpse as any)({ ...corpse(), dead: true, path: [], goal: null });

    driver.perceive();

    expect(player().witnessed).toBe(false);
    expect(player().mood).not.toBe("panic");

    app.unmount();
  });

  test("玩家不在目击者计数中", () => {
    const app = createApp(App);
    app.mount("#app");

    // 让一个客人恐慌，确认计数只含客人（其余角色全部隔离）
    const guest = guestsOf()[0];
    const corpse = guestsOf()[1];
    place(corpse, { x: 7 * 32, y: 10 * 32 }, "west");
    (corpse as any)({ ...corpse(), dead: true, path: [], goal: null });

    holdIsolation([guest, corpse], 40, driver, () => {
      pin(guest, { x: 5 * 32, y: 10 * 32 }, "east");
    });

    // 只有那一个客人目击；玩家即使也在场也不计入
    expect(alarm.witnessCount()).toBe(1);
    expect(playerOf()().witnessed).toBe(false);

    app.unmount();
  });
});

describe("M6 / 恐慌者逃离", () => {
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

  test("恐慌后不再驻足等待（idleLeft 清零，立即出发）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guest = guestsOf()[0];
    const corpse = guestsOf()[1];
    place(corpse, { x: 7 * 32, y: 10 * 32 }, "west");
    (corpse as any)({ ...corpse(), dead: true, path: [], goal: null });

    // 逐帧钉住直到恐慌发生（隔离其余角色）。
    // 帧数需覆盖至少一轮感知（间隔 6 帧）
    for (let i = 0; i < 40 && !guest().witnessed; i += 1) {
      isolate([guest, corpse]);
      pin(guest, { x: 5 * 32, y: 10 * 32 }, "east");
      driver.tick();
    }

    expect(guest().witnessed).toBe(true);
    // 恐慌瞬间清零停留计时——否则会站着等完剩余驻足才动
    expect(guest().idleLeft).toBe(0);

    app.unmount();
  });

  test("恐慌者会实际移动（远离原地）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guest = guestsOf()[0];
    const corpse = guestsOf()[1];
    place(corpse, { x: 7 * 32, y: 10 * 32 }, "west");
    (corpse as any)({ ...corpse(), dead: true, path: [], goal: null });

    // 钉住到恐慌发生为止（其余角色隔离），随后放开让它跑
    for (let i = 0; i < 40 && !guest().witnessed; i += 1) {
      isolate([guest, corpse]);
      pin(guest, { x: 5 * 32, y: 10 * 32 }, "east");
      driver.tick();
    }
    expect(guest().witnessed).toBe(true);

    const start = { x: guest().x, y: guest().y };
    // 放开后推进 5 秒：恐慌者应主动远离
    for (let i = 0; i < 320; i += 1) {
      isolate([guest, corpse]);
      driver.tick();
    }

    const travelled = Math.hypot(guest().x - start.x, guest().y - start.y);
    expect(travelled).toBeGreaterThan(30);

    app.unmount();
  });
});
