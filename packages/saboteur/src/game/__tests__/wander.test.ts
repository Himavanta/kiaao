// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M3 端到端：NPC 真的在房间里游荡
//
// 单测覆盖了寻路与各系统，但「三个系统接起来 NPC 是否真会走」
// 只有端到端能验证——信号未接线、意图未分派、路径未推进，
// 任何一处断开都会表现为「NPC 站着不动」。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import App from "../../app";
import { TILE } from "../../world";
import { alarm, level, stop } from "../instance";
import { listActors } from "../state";
import { createDriver } from "./helpers";
import { live, setState } from "./live";

/** 从 DOM 读出所有角色的位置（按 translate 解析） */
function actorPositions(): Array<{ x: number; y: number }> {
  return (
    [...document.querySelectorAll("#app div[style]")]
      .map((el) => /translate:\s*([\d.-]+)px\s+([\d.-]+)px/.exec(el.getAttribute("style") ?? ""))
      .filter((m): m is RegExpExecArray => m !== null)
      // 世界层也有 translate，其值为 0 且元素很大；按尺寸排除
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
      .filter((_, i) => i > 0)
  );
}

describe("M3 端到端 / NPC 游荡", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("关卡中的 NPC 全部被渲染", () => {
    const app = createApp(App);
    app.mount("#app");

    // 玩家 + NPC 的角色元素都存在
    const positions = actorPositions();
    expect(positions.length).toBeGreaterThanOrEqual(1 + level.npcSpawns.length);

    app.unmount();
  });

  test("推帧后 NPC 会移动（不只是玩家）", () => {
    const app = createApp(App);
    app.mount("#app");

    const before = actorPositions();
    // 游荡需要几秒才起步（初始有停留计时），给足帧数
    driver.tickTimes(400);
    const after = actorPositions();

    expect(after.length).toBe(before.length);

    // 至少一个角色位置发生变化
    const moved = after.some((pos, i) => pos.x !== before[i]?.x || pos.y !== before[i]?.y);
    expect(moved).toBe(true);

    app.unmount();
  });

  test("长时间游荡：NPC 始终待在可通行格内（不穿墙）", () => {
    const app = createApp(App);
    app.mount("#app");

    // 模拟约 50 秒
    for (let batch = 0; batch < 10; batch += 1) {
      driver.tickTimes(300);

      for (const { x, y } of actorPositions().slice(1)) {
        const col = Math.floor((x + 10) / 32);
        const row = Math.floor((y + 10) / 32);

        // 角色中心不能位于墙内
        const tile = level.grid.tiles[row * level.grid.cols + col];
        expect(tile).toBe(0); // Tile.Floor
      }
    }

    app.unmount();
  });

  test("多个 NPC 最终分散在不同位置（不是叠在一起）", () => {
    const app = createApp(App);
    app.mount("#app");

    driver.tickTimes(600);

    const npcPositions = actorPositions().slice(1);
    const unique = new Set(npcPositions.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));

    // 完全重合说明寻路或行为系统没生效
    expect(unique.size).toBe(npcPositions.length);

    app.unmount();
  });

  test("深度排序：zIndex 随 y 变化（俯视遮挡）", () => {
    const app = createApp(App);
    app.mount("#app");
    driver.tickTimes(200);

    const zValues = [...document.querySelectorAll("#app div[style]")]
      .map((el) => /z-index:\s*(\d+)/.exec(el.getAttribute("style") ?? ""))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]));

    expect(zValues.length).toBeGreaterThan(0);
    // 不同 y 的角色应有不同层级
    expect(new Set(zValues).size).toBeGreaterThan(1);

    app.unmount();
  });
});

describe("异质 NPC / 保镖（S1）", () => {
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

  test("关卡里有保镖，且与客人区分开", () => {
    const app = createApp(App);
    app.mount("#app");

    expect(byRole("guard").length).toBeGreaterThan(0);
    expect(byRole("guest").length).toBeGreaterThan(0);

    app.unmount();
  });

  /**
   * 回归：新增类型时最容易漏的是「出生了但不工作」——
   * `actor.tsx` 只给 guest 注册 `behaviour.enter`、`instance.ts` 只为
   * player/guest 注册意图来源，于是 guard 站着不动。
   * 这类断链不报错，只表现为「NPC 不动」，必须端到端验证。
   */
  test("保镖真的在动（不只是被出生）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guards = byRole("guard");
    const start = guards.map((g) => ({ x: live(g).x, y: live(g).y }));

    driver.tickTimes(400);

    const moved = guards.filter((g, i) => {
      const s = start[i];
      return Math.hypot(live(g).x - s.x, live(g).y - s.y) > 5;
    });
    expect(moved.length).toBeGreaterThan(0);

    app.unmount();
  });

  test("保镖与客人数值不同（参数轴，同一套系统）", () => {
    const app = createApp(App);
    app.mount("#app");

    const [guard] = byRole("guard");
    const [guest] = byRole("guest");

    expect(live(guard).speed).not.toBe(live(guest).speed);
    expect(live(guard).sightRange).not.toBe(live(guest).sightRange);

    app.unmount();
  });

  /**
   * S2 的核心：不同 NPC 拥有**不同的状态集**。
   *
   * 保镖从 `patrol` 开始（没有 wander），客人从 `wander` 开始。
   * 若初值仍写死 `wander`，保镖会因查不到该状态而整个不跑——
   * 不报错，只表现为「站着不动」。
   */
  test("各 NPC 从自己的默认状态开始（保镖 patrol / 客人 wander）", () => {
    const app = createApp(App);
    app.mount("#app");

    const [guard] = byRole("guard");
    const [guest] = byRole("guest");

    expect(live(guard).mood).toBe("patrol");
    expect(live(guest).mood).toBe("wander");

    app.unmount();
  });

  test("保镖长期只处于自己的状态集内（不游荡）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guards = byRole("guard");
    const seen = new Set<string>();

    for (let i = 0; i < 400; i += 1) {
      driver.tick();
      for (const g of guards) seen.add(live(g).mood);
    }

    // 保镖只有 {patrol, panic}；无外部刺激时不应出现 wander / linger
    expect([...seen]).toEqual(["patrol"]);

    app.unmount();
  });

  test("保镖留守岗位附近（巡逻不是全图游荡）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guards = byRole("guard");
    const posts = guards.map((g) => live(g).post!);
    expect(posts.every((p) => p !== null)).toBe(true);

    driver.tickTimes(900);

    for (const [i, g] of guards.entries()) {
      const a = live(g);
      const col = Math.floor((a.x + 10) / TILE);
      const row = Math.floor((a.y + 10) / TILE);
      const dist = Math.abs(col - posts[i].col) + Math.abs(row - posts[i].row);
      // 巡逻半径是 4 格；留一格余量给「正在走过去」的中间态
      expect(dist).toBeLessThanOrEqual(6);
    }

    app.unmount();
  });

  /**
   * S2 最易错的一步：`panic` 是**共享状态**，但消退后的归宿因 NPC 而异。
   *
   * 若写死 `transition("wander")`，保镖会因查不到 `wander` 而静默失效
   * （`transition` 对不存在的状态是忽略而非报错），表现为恐慌后卡死。
   * 这条路径只能端到端验证。
   */
  test("保镖恐慌消退后回到 patrol（不是 wander）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guard = byRole("guard")[0];
    const victim = byRole("guest")[0];

    // 让保镖恐慌需要「异常源是**恐慌的人**」：尸体现在会让保镖去查看
    // （`reaction` 按类别分派，见 guard.ts），只有狂奔的同类才会让它跟着逃。
    // 钉住这个恐慌者，否则它几帧就走出视锥。
    const pin = () => {
      const g = live(guard);
      setState(victim, {
        x: g.x + 32,
        y: g.y,
        witnessed: true,
        path: [],
        goal: null,
        idleLeft: 1e6,
        moodLeft: 1e6,
      });
    };

    const seen = new Set<string>();
    // 记录状态迁移序列，用于断言「确实从 panic 回过 patrol」
    const transitions: Array<[string, string]> = [];
    let prev = live(guard).mood;

    // 40 秒（恐慌 30s + 余量）；全程压警报以免终局停住帧循环
    for (let i = 0; i < 2500; i += 1) {
      alarm.alarm(0);
      pin();
      driver.tick();
      const now = live(guard).mood;
      if (now !== prev) transitions.push([prev, now]);
      prev = now;
      seen.add(now);
    }

    expect(seen.has("panic")).toBe(true);
    // 关键：全程不得出现 wander——保镖根本没有这个状态
    expect(seen.has("wander")).toBe(false);

    // 断言「契约」而非「某一帧恰好是什么」：恐慌消退后回到本角色的
    // 默认状态（patrol）。不能断言「结束时是 patrol」——恐慌会**传播**，
    // 保镖可能被另一个恐慌者再次传染。
    expect(transitions).toContainEqual(["panic", "patrol"]);

    app.unmount();
  });

  /**
   * 新增行为：保镖对**尸体**的反应不是逃跑，而是前去查看。
   *
   * 区分「异常类别」是这次改动的核心：客人对所有异常都逃，保镖对尸体
   * 上前（职责）、对恐慌的人也跟着逃。若 `reaction` 不再收类别，这条会失败。
   */
  test("保镖看见尸体去查看，且查看结束后回岗（不变成 wander）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guard = byRole("guard")[0];
    const corpse = byRole("guest")[0];

    // 尸体放在墙外、看得到的地方——逐帧重钉，否则它会被其他系统移动
    const pin = () => {
      setState(corpse, { x: 5 * TILE + 6, y: 10 * TILE + 6, dead: true, path: [], goal: null });
    };

    const seen = new Set<string>();
    const transitions: Array<[string, string]> = [];
    let prev = live(guard).mood;

    for (let i = 0; i < 2500; i += 1) {
      alarm.alarm(0);
      pin();
      driver.tick();
      const now = live(guard).mood;
      if (now !== prev) transitions.push([prev, now]);
      prev = now;
      seen.add(now);
    }

    expect(seen.has("investigate")).toBe(true);
    expect(seen.has("wander")).toBe(false);

    // 只断言「进入过查看」与「从不 wander」——**不断言「查看后必回 patrol」**：
    // 尸体会让同场的客人也恐慌，而保镖对「狂奔的人」的反应是跟着逃
    // （`reaction` 按类别分派），于是查看常被传播链打断（实测：进入查看
    // 后 43 帧就被传染）。那条转换本身是**对的**，只是不稳定，不能当契约。
    // 「走完查看再回岗」由 `guard.ts` 的时长机制保证，不必靠动态模拟断言。

    app.unmount();
  });
});
