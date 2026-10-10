// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 实验验证：实体自己持有私有数据与方法
//
// 要验证的命题（文档 §三）：OOP 不必进内核，它可以是一个**普通系统**
// ——只负责「喊一声到你了」，具体做什么由实体自己的方法定义。
//
// 判据（文档 §3.3）：方法只能拥有「**没有系统认领的字段**」。
// 保镖的 `seen`（见过谁）正是这种字段：它由 perception 产出的
// `visibleIds` 派生，但 `visibleIds` 是「此刻可见」，看一眼就忘了；
// `seen` 是**累计记忆**，没有任何系统认领它。
//
// 这个测试关心三件事：
// 1. 私有字段与方法**真的存在且在工作**（不只是一段能编译的代码）
// 2. 它们**只属于保镖**——客人 / 玩家身上没有
// 3. 记忆是**累计**的（时间推移不丢、不被覆盖）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { setAdapter } from "kiaao/adapter";
import { browserAdapter } from "kiaao/dom";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import App from "../../app";
import { TILE } from "../../world";
import { alarm, stop } from "../instance";
import type { GuardEntity } from "../npcs/guard";
import { listActors } from "../state";
import { ACTOR_SIZE } from "../systems/locomotion";
import type { ActorEntity } from "../types";
import { createDriver } from "./helpers";
import { live, setState } from "./live";

setAdapter(browserAdapter);

describe("实验 / 实体私有数据与方法", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  const byRole = (role: string) => listActors().filter((e) => e().role === role);

  /** 实体中心所在的格——保镖记录位置时用的就是它 */
  const cellOf = (e: ActorEntity) => ({
    col: Math.floor((e.x + ACTOR_SIZE / 2) / TILE),
    row: Math.floor((e.y + ACTOR_SIZE / 2) / TILE),
  });

  test("保镖身上有私有字段与方法，客人 / 玩家没有", () => {
    const app = createApp(App);
    app.mount("#app");

    const guard = live(byRole("guard")[0]) as GuardEntity;
    expect(guard.seen).toBeInstanceOf(Map);
    expect(typeof guard.onFrame).toBe("function");
    expect(typeof guard.hasSeen).toBe("function");

    // 关键：这是**保镖专属**的，不是所有实体都有
    expect("seen" in (live(byRole("guest")[0]) as object)).toBe(false);
    expect("seen" in (live(byRole("player")[0]) as object)).toBe(false);

    app.unmount();
  });

  test("每帧钩子被调用：记忆随时间积累", () => {
    const app = createApp(App);
    app.mount("#app");

    const guards = byRole("guard");
    expect((live(guards[0]) as GuardEntity).seen.size).toBe(0);

    // 跑几秒——保镖巡逻时会看见别人
    for (let i = 0; i < 600; i += 1) {
      alarm.alarm(0);
      driver.tick();
    }

    const sizes = guards.map((g) => (live(g) as GuardEntity).seen.size);
    // 至少有一个保镖见过人（现实里两个都在巡逻，看不清具体是谁）
    expect(Math.max(...sizes)).toBeGreaterThan(0);

    app.unmount();
  });

  test("两个保镖各记各的：互不干扰", () => {
    const app = createApp(App);
    app.mount("#app");

    const guards = byRole("guard");
    for (let i = 0; i < 600; i += 1) {
      alarm.alarm(0);
      driver.tick();
    }

    const [a, b] = guards.map((g) => live(g) as GuardEntity);
    // 两份 `seen` 是不同的 Map 实例——私有数据不是共享的
    expect(a.seen).not.toBe(b.seen);

    app.unmount();
  });

  test("记忆是累计的：见过一次就记得，且首次时刻不被覆盖", () => {
    const app = createApp(App);
    app.mount("#app");

    const guard = byRole("guard")[0];
    const victim = byRole("guest")[0];

    // 把客人放到保镖**正前方**（保镖朝南），并让它站住不动。
    // 注意不能用「保镖旁边」——它开局就在巡逻，位置会变。
    const g = live(guard);
    setState(victim, {
      x: g.x,
      y: g.y + 96,
      facing: "north",
      path: [],
      goal: null,
      idleLeft: 1e6,
      moodLeft: 1e6,
    });

    // 同时把保镖钉住，避免它走开而看不到
    const pinGuard = () => {
      setState(guard, { x: g.x, y: g.y, facing: "south", path: [], goal: null, idleLeft: 1e6 });
    };

    for (let i = 0; i < 120; i += 1) {
      alarm.alarm(0);
      pinGuard();
      driver.tick();
    }

    const after = live(guard) as GuardEntity;
    const firstSighting = after.seen.get(victim.id);
    expect(after.hasSeen(victim.id)).toBe(true);
    expect(firstSighting?.firstSeenAt).toBeGreaterThan(0);
    // 最后一次见到时记住了位置——查看靠它，而不是异常源的实时坐标
    expect(firstSighting?.lastSeenAt).toEqual(cellOf(live(victim)));

    // 让客人走远（离开视野），跑一段——记忆不该消失
    setState(victim, { x: 1 * 32, y: 1 * 32, path: [], goal: null, idleLeft: 1e6 });
    for (let i = 0; i < 300; i += 1) {
      alarm.alarm(0);
      driver.tick();
    }

    const later = live(guard) as GuardEntity;
    expect(later.hasSeen(victim.id)).toBe(true);
    // 首次见到的时刻不被后续覆盖
    expect(later.seen.get(victim.id)?.firstSeenAt).toBe(firstSighting?.firstSeenAt);

    app.unmount();
  });
});
