// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 保镖的私有记忆与「查看」行为
//
// 这次改动的核心是把「私有记忆」从**死字段**变成**行为驱动力**：
// 原先 `seen` 只被测试读，没有任何 gameplay 消费它；现在它决定
// 「保镖看见尸体后去哪」。
//
// 要验证的三件事：
// 1. 记忆记的是**对方的格**——不是「我在哪看见的」（这个 bug 我犯过，
//    后果是保镖「查看」时走向自己）
// 2. 保镖对**尸体**的反应是 `investigate`，不是 `panic`
// 3. 查看**真的走向记忆点**（不是进了状态却一步不动——也犯过）
//
// 第 3 条只能端到端验证：它依赖 perception → actor → alarm 的**顺序**，
// 顺序错了表现为「进入状态却不动」，单测看不见。
//
// **隔离是本文件的关键**：传播链会污染每个用例——同场别的角色看见尸体
// 会恐慌，而保镖对「狂奔的人」会跟着逃（`reaction` 按类别分派）。不隔离
// 就分不清「保镖在看尸体」还是「保镖在躲恐慌的人」。隔离点选地图右下角
// （远离所有用例的舞台），逐帧重钉。
//
// 另外：`listActors()` 的第一项是**玩家**，不是客人——取角色务必按 role 过滤。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { setAdapter } from "kiaao/adapter";
import { browserAdapter } from "kiaao/dom";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import App from "../../app";
import { TILE } from "../../world";
import { alarm, level, stop } from "../instance";
import type { GuardEntity } from "../npcs/guard";
import { listActors } from "../state";
import type { ActorEntity } from "../types";
import { createDriver } from "./helpers";
import { live, setState } from "./live";

setAdapter(browserAdapter);

const actorsOf = (role: string) => listActors().filter((e) => e().role === role);

/** 实体中心所在格——记忆里存的就是它 */
const cellOf = (e: ActorEntity) => ({
  col: Math.floor((e.x + TILE / 2) / TILE),
  row: Math.floor((e.y + TILE / 2) / TILE),
});

/** 停住一个实体：清路线、清停留计时（否则它自己会走开） */
function freeze(
  e: ReturnType<typeof listActors>[number],
  pos: { x: number; y: number },
  facing?: ActorEntity["facing"],
) {
  setState(e, {
    x: pos.x,
    y: pos.y,
    path: [],
    goal: null,
    idleLeft: 1e6,
    moodLeft: 1e6,
    ...(facing ? { facing } : {}),
  });
}

describe("保镖 / 记忆与查看", () => {
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

  /** 除保留者外，全部钉到地图右下角角落、背朝场地 */
  const isolate = (keep: Array<ReturnType<typeof listActors>[number]>) => {
    const corner = { x: (level.grid.cols - 2) * TILE + 6, y: (level.grid.rows - 2) * TILE + 6 };
    for (const actor of listActors()) {
      if (keep.includes(actor)) continue;
      freeze(actor, corner, "south");
    }
  };

  test("记忆记的是对方的格（不是自己的）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guard = actorsOf("guard")[0];
    const guest = actorsOf("guest")[0];

    // 钉住双方：保镖在 (5,7) 朝东，客人在正东 4 格。
    // 两者都停住，于是「记录的格」只可能来自对方——若错记成自己的格，
    // 断言立刻不等。
    const guardPos = { x: 5 * TILE + 6, y: 7 * TILE + 6 };
    const guestPos = { x: 9 * TILE + 6, y: 7 * TILE + 6 };

    for (let i = 0; i < 30; i += 1) {
      alarm.alarm(0);
      isolate([guard, guest]);
      freeze(guard, guardPos, "east");
      freeze(guest, guestPos, "west");
      driver.tick();
    }

    const memory = (live(guard) as GuardEntity).seen.get(guest.id);
    expect(memory).toBeDefined();
    // 存的必须是**客人**的格
    expect(memory?.lastSeenAt).toEqual(cellOf(live(guest)));
    // 且不等于保镖自己的格（对调两者位置即可排除）
    expect(memory?.lastSeenAt).not.toEqual(cellOf(live(guard)));

    app.unmount();
  });

  test("保镖对尸体去查看（而不是像客人那样逃跑）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guard = actorsOf("guard")[0];
    const corpse = actorsOf("guest")[0];
    const corpsePos = { x: 5 * TILE + 6, y: 10 * TILE + 6 };

    const seen = new Set<string>();
    for (let i = 0; i < 900; i += 1) {
      alarm.alarm(0);
      isolate([guard, corpse]);
      setState(corpse, { x: corpsePos.x, y: corpsePos.y, dead: true, path: [], goal: null });
      driver.tick();
      seen.add(live(guard).mood);
    }

    expect(seen.has("investigate")).toBe(true);
    // 尸体不该让保镖逃跑——那是客人的反应
    expect(seen.has("panic")).toBe(false);

    app.unmount();
  });

  test("查看真的走向记忆点（不是进了状态却一步不动）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guard = actorsOf("guard")[0];
    const corpse = actorsOf("guest")[0];
    const corpsePos = { x: 5 * TILE + 6, y: 10 * TILE + 6 };

    let entered = false;
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 900; i += 1) {
      alarm.alarm(0);
      isolate([guard, corpse]);
      setState(corpse, { x: corpsePos.x, y: corpsePos.y, dead: true, path: [], goal: null });
      driver.tick();

      const g = live(guard);
      if (g.mood === "investigate") {
        entered = true;
        closest = Math.min(closest, Math.abs(g.x - corpsePos.x) + Math.abs(g.y - corpsePos.y));
      } else if (entered) {
        break; // 查看结束，收工
      }
    }

    expect(entered).toBe(true);
    // 真的走近了记忆点——「进入状态却原地不动」会让这条失败
    // （实测：修复感知/记忆顺序前，最近距离始终 ≈ 初始距离）
    expect(closest).toBeLessThan(TILE * 1.5);

    app.unmount();
  });
});
