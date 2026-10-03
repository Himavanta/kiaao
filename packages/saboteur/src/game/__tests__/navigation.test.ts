// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 状态机与导航服务
//
// 架构调整后的测试重点变了：此前测「系统之间的字段握手」，现在测
// 「每个状态自己的行为」。这也让用例更短——状态是一段可读的时间线，
// 可以直接喂给它一个上下文，断言它请求了什么。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { setAdapter } from "kiaao/adapter";
import { browserAdapter } from "kiaao/dom";
import { describe, expect, test } from "vite-plus/test";

import { createGrid, createRandom, setTile, Tile, type Cell } from "../../world";
import { createBehaviourSystem } from "../systems/behaviour";
import { createLocomotionSystem } from "../systems/locomotion";
import { ACTOR_SIZE } from "../systems/locomotion";
import { createNavigationService, pathIntent } from "../systems/navigation";
import { createStates, type StateContext } from "../systems/states";
import type { ActorEntity } from "../types";
import { makeActorState, mountActor } from "./helpers";

setAdapter(browserAdapter);

const openGrid = () => createGrid(20, 20);

describe("导航服务 / 挑目的地", () => {
  test("随机目标不落在当前格", () => {
    const nav = createNavigationService({ grid: openGrid(), random: createRandom(1) });
    const from: Cell = { col: 5, row: 5 };

    for (let i = 0; i < 50; i += 1) {
      const goal = nav.pickRandomGoal(from);
      if (goal) expect(goal.col !== from.col || goal.row !== from.row).toBe(true);
    }
  });

  test("逃跑目标远离威胁点", () => {
    const nav = createNavigationService({ grid: openGrid(), random: createRandom(2) });
    const from: Cell = { col: 1, row: 1 };
    const threat: Cell = { col: 2, row: 2 };

    for (let i = 0; i < 30; i += 1) {
      const goal = nav.pickFleeGoal(from, threat);
      if (!goal) continue;
      const dist = Math.abs(goal.col - threat.col) + Math.abs(goal.row - threat.row);
      // 应显著远离威胁（地图 20×20，最远约 36）
      expect(dist).toBeGreaterThan(10);
    }
  });

  test("逃跑目标排除自身格（否则会「规划到自身」而空转）", () => {
    const nav = createNavigationService({ grid: openGrid(), random: createRandom(3) });
    const from: Cell = { col: 19, row: 19 };
    const threat: Cell = { col: 0, row: 0 };

    for (let i = 0; i < 50; i += 1) {
      const goal = nav.pickFleeGoal(from, threat);
      if (!goal) continue;
      expect(goal.col === from.col && goal.row === from.row).toBe(false);
    }
  });

  test("固定种子：目的地序列可复现", () => {
    const run = () => {
      const nav = createNavigationService({ grid: openGrid(), random: createRandom(42) });
      return Array.from({ length: 20 }, () => nav.pickRandomGoal({ col: 5, row: 5 }))
        .filter((c): c is Cell => !!c)
        .map((c) => `${c.col},${c.row}`);
    };
    expect(run()).toEqual(run());
  });
});

describe("导航服务 / 走一帧", () => {
  /** 装好一个客人实体与帧替身 */
  function setup(options: { cols?: number; rows?: number } = {}) {
    const grid = createGrid(options.cols ?? 20, options.rows ?? 20);
    const nav = createNavigationService({ grid, random: createRandom(7) });
    const actor = mountActor({
      enters: [],
      state: makeActorState({ x: 5 * 32, y: 5 * 32, moodLeft: 100 }),
    });
    return { grid, nav, ...actor };
  }

  test("无路径时规划：产生路径且终点即目标", () => {
    const { nav, entity, frame, id } = setup();
    entity({ goal: { col: 15, row: 15 } });

    nav.moveTowardGoal(frame, id, 1 / 60);

    expect(entity().path.length).toBeGreaterThan(0);
    expect(entity().path[entity().path.length - 1]).toEqual({ col: 15, row: 15 });
  });

  test("目标不可达时清空目标（留待状态重挑，而非空转）", () => {
    const grid = createGrid(10, 10);
    // 用整列墙把左右隔开
    for (let row = 0; row < 10; row += 1) setTile(grid, 5, row, Tile.Wall);

    const nav = createNavigationService({ grid, random: createRandom(11) });
    const actor = mountActor({
      enters: [],
      state: makeActorState({
        x: 1 * 32,
        y: 5 * 32,
        goal: { col: 9, row: 5 },
        moodLeft: 100,
      }),
    });
    const { entity, frame } = actor;
    nav.moveTowardGoal(frame, actor.id, 1 / 60);

    expect(entity().goal).toBeNull();
    expect(entity().path).toEqual([]);
  });

  test("到达路径点即弹出", () => {
    const { nav, entity, frame, id } = setup();
    entity({ goal: { col: 15, row: 15 } });
    nav.moveTowardGoal(frame, id, 1 / 60);

    const before = entity().path.length;
    expect(before).toBeGreaterThan(0);

    // 搬到首个路径点中心
    const [first] = entity().path;
    entity({
      x: first.col * 32 + (32 - ACTOR_SIZE) / 2,
      y: first.row * 32 + (32 - ACTOR_SIZE) / 2,
    });

    nav.moveTowardGoal(frame, id, 1 / 60);

    expect(entity().path.length).toBe(before - 1);
  });

  test("走完最后一点即清空目标（状态据此得知「到了」）", () => {
    const { nav, entity, frame, id } = setup();
    // 目标就是相邻格：路径只有一步
    entity({ goal: { col: 6, row: 5 } });
    nav.moveTowardGoal(frame, id, 1 / 60);

    const last = entity().path[entity().path.length - 1];
    entity({
      x: last.col * 32 + (32 - ACTOR_SIZE) / 2,
      y: last.row * 32 + (32 - ACTOR_SIZE) / 2,
    });

    nav.moveTowardGoal(frame, id, 1 / 60);

    expect(entity().path).toEqual([]);
    expect(entity().goal).toBeNull();
  });

  test("看门狗：长时间无推进则放弃路径", () => {
    const { nav, entity, frame, id } = setup();
    entity({ goal: { col: 15, row: 15 } });
    nav.moveTowardGoal(frame, id, 1 / 60);
    expect(entity().path.length).toBeGreaterThan(0);

    // 不动，推进 5 秒
    for (let i = 0; i < 300; i += 1) {
      nav.moveTowardGoal(frame, id, 1 / 60);
    }

    expect(entity().path).toEqual([]);
    expect(entity().goal).toBeNull();
  });

  test("未知死者的位置不推进（x/y 未写出的瞬间）", () => {
    const { nav, entity, frame, id } = setup();
    entity({ x: Number.NaN, goal: { col: 15, row: 15 } });

    expect(() => nav.moveTowardGoal(frame, id, 1 / 60)).not.toThrow();
    expect(entity().path).toEqual([]);
  });
});

describe("状态对象 / 单元行为", () => {
  /**
   * 直接调用某个状态的 `update`，观察它请求了什么。
   *
   * 状态不依赖 frame / 系统，只依赖上下文——所以可以这样直测。
   */
  function runState(options: {
    mood: "wander" | "linger" | "panic" | "patrol";
    /** 取哪个角色的状态集（默认客人） */
    role?: "guest" | "guard";
    self: Partial<ActorEntity>;
    delta?: number;
  }) {
    const states = createStates(createRandom(5));
    const state = states[options.role ?? "guest"].states[options.mood]!;

    const patches: Array<Partial<ActorEntity>> = [];
    const transitions: string[] = [];

    const self = {
      x: 5 * 32,
      y: 5 * 32,
      path: [],
      goal: null,
      followTime: 0,
      dead: false,
      mood: options.mood,
      moodLeft: 1,
      idleLeft: 0,
      fleeFrom: null,
      witnessed: false,
      role: "guest",
      ...options.self,
    } as unknown as Readonly<ActorEntity>;

    /** 记录每次 patch 实际改动的键（对比改动前后） */
    const patchKeys = new Set<string>();

    const ctx = {
      self,
      cell: { col: 5, row: 5 },
      patch: (fn: (e: ActorEntity) => void) => {
        const draft = { ...self } as ActorEntity;
        fn(draft);
        patches.push(draft);
        for (const k of Object.keys(draft)) {
          if (draft[k as keyof ActorEntity] !== self[k as keyof ActorEntity]) patchKeys.add(k);
        }
      },
      transition: (next: string) => {
        transitions.push(next);
      },
      services: {
        moveTowardGoal: () => {},
        pickRandomGoal: () => ({ col: 9, row: 9 }),
        pickFleeGoal: () => ({ col: 18, row: 18 }),
      },
    } as unknown as StateContext;

    state.update(ctx, options.delta ?? 1 / 60);

    // merged 只含被 patch 真正写过的键——否则「没写」与「写成 null」
    // 无法区分，断言会失去意义
    const last = patches[patches.length - 1] ?? ({} as Partial<ActorEntity>);
    const merged: Record<string, unknown> = {};
    for (const k of patchKeys) merged[k] = (last as Record<string, unknown>)[k];

    return { patches, merged, transitions, patchKeys };
  }

  test("闲游：未到达时推进移动，不切状态", () => {
    const { transitions } = runState({
      mood: "wander",
      self: { moodLeft: 10, path: [{ col: 6, row: 5 }] },
    });
    expect(transitions).toEqual([]);
  });

  test("闲游：已到达且休息够了才挑新目标", () => {
    const { merged } = runState({
      mood: "wander",
      self: { moodLeft: 10, path: [], goal: null, idleLeft: 0 },
    });
    expect(merged.goal).toEqual({ col: 9, row: 9 });
  });

  test("闲游：未休息够不挑新目标", () => {
    const { patchKeys, merged } = runState({
      mood: "wander",
      self: { moodLeft: 10, path: [], goal: null, idleLeft: 2 },
    });
    expect(patchKeys.has("goal")).toBe(false);
    expect(merged.idleLeft).toBeLessThan(2);
  });

  test("闲游：半路（有路径）不切状态——否则会停在空地中央", () => {
    const { transitions } = runState({
      mood: "wander",
      self: { moodLeft: 0.001, path: [{ col: 6, row: 5 }] },
    });
    expect(transitions).toEqual([]);
  });

  test("闲游：已到达且超时 → 切到驻足", () => {
    const { transitions } = runState({
      mood: "wander",
      self: { moodLeft: 0.001, path: [], goal: null },
    });
    expect(transitions).toEqual(["linger"]);
  });

  test("驻足：超时 → 切回闲游", () => {
    const { transitions } = runState({ mood: "linger", self: { moodLeft: 0.001 } });
    expect(transitions).toEqual(["wander"]);
  });

  test("驻足：未超时不切", () => {
    const { transitions } = runState({ mood: "linger", self: { moodLeft: 5 } });
    expect(transitions).toEqual([]);
  });

  test("恐慌：清掉逃离参照点后再切回闲游（witnessed 保留）", () => {
    const { merged, transitions, patchKeys } = runState({
      mood: "panic",
      self: { moodLeft: 0.001, fleeFrom: { col: 1, row: 1 }, witnessed: true },
    });
    expect(transitions).toEqual(["wander"]);
    expect(merged.fleeFrom).toBeNull();
    // witnessed 不被 patch——它是记忆，不由状态清除
    expect(patchKeys.has("witnessed")).toBe(false);
  });

  test("恐慌：路径走空则挑新的逃跑点（中途不休息）", () => {
    const { merged, patchKeys } = runState({
      mood: "panic",
      self: { moodLeft: 20, path: [], goal: null, fleeFrom: { col: 1, row: 1 } },
    });
    expect(merged.goal).toEqual({ col: 18, row: 18 });
    // 恐慌不设 idleLeft——逃到一处立刻奔向下一处
    expect(patchKeys.has("idleLeft")).toBe(false);
  });

  test("恐慌：有路径时继续走，不重挑目标", () => {
    const { patchKeys } = runState({
      mood: "panic",
      self: { moodLeft: 20, path: [{ col: 6, row: 5 }], fleeFrom: { col: 1, row: 1 } },
    });
    expect(patchKeys.has("goal")).toBe(false);
  });

  test("恐慌：无 fleeFrom 时不挑目标（不崩）", () => {
    const { patchKeys } = runState({
      mood: "panic",
      self: { moodLeft: 20, path: [], goal: null, fleeFrom: null },
    });
    expect(patchKeys.has("goal")).toBe(false);
  });

  test("恐慌：enter 清掉既有路径与目标", () => {
    const states = createStates(createRandom(5));
    let cleared: Partial<ActorEntity> = {};
    const self = { path: [{ col: 1, row: 1 }], goal: { col: 2, row: 2 }, idleLeft: 5 } as any;

    states.guest.states.panic!.enter?.({
      self,
      cell: { col: 5, row: 5 },
      patch: (fn: (e: ActorEntity) => void) => {
        const draft = { ...self };
        fn(draft);
        cleared = { ...cleared, ...draft };
      },
      transition: () => {},
      services: {} as any,
    } as unknown as StateContext);

    expect(cleared.path).toEqual([]);
    expect(cleared.goal).toBeNull();
    expect(cleared.idleLeft).toBe(0);
  });
});

describe("行为系统 / 状态机驱动", () => {
  test("初始为闲游", () => {
    const nav = createNavigationService({ grid: openGrid(), random: createRandom(1) });
    const bhv = createBehaviourSystem({ random: createRandom(1), navigation: nav });

    const { entity } = mountActor({
      enters: [bhv.enter],
      state: makeActorState(bhv.spawn({ role: "guest" })),
    });

    expect(entity().mood).toBe("wander");
    expect(entity().moodLeft).toBeGreaterThan(0);
  });

  test("死者不被驱动（尸体不入状态机）", () => {
    const nav = createNavigationService({ grid: openGrid(), random: createRandom(1) });
    const bhv = createBehaviourSystem({ random: createRandom(1), navigation: nav });

    const { entity, frame } = mountActor({
      enters: [bhv.enter],
      state: makeActorState({ ...bhv.spawn({ role: "guest" }), dead: true, moodLeft: 5 }),
    });

    bhv.update(frame, 1);

    // moodLeft 不变：死者不被处理
    expect(entity().moodLeft).toBe(5);
  });

  test("长期运行：NPC 在移动（不会因状态切换而全体停住）", () => {
    const grid = createGrid(30, 30);
    const random = createRandom(9);
    const nav = createNavigationService({ grid, random });
    const bhv = createBehaviourSystem({ random, navigation: nav });
    const loco = createLocomotionSystem(grid);
    loco.setIntent("guest", (e) => pathIntent(e));

    // 必须连 locomotion 一起装：behaviour 只决定「去哪」，
    // 真正的位移由 locomotion 消费 `path` 完成
    const guests = Array.from({ length: 3 }, () =>
      mountActor({
        enters: [loco.enter, bhv.enter],
        state: makeActorState({
          ...loco.spawn({ x: 5 * 32, y: 5 * 32, speed: 78, facing: "south" }),
          ...bhv.spawn({ role: "guest" }),
        }),
      }),
    );

    const start = guests.map((g) => ({ x: g.entity().x, y: g.entity().y }));

    // 跑 20 秒：behaviour 决定去哪、locomotion 真正位移，两者缺一不可
    for (let f = 0; f < 1200; f += 1) {
      for (const g of guests) {
        bhv.update(g.frame, 1 / 60);
        loco.update(g.frame, 1 / 60);
      }
    }

    // 至少有一个 NPC 真的移动过——若状态机在某处卡死，这里会失败
    const moved = guests.filter(
      (g, i) => Math.abs(g.entity().x - start[i].x) > 1 || Math.abs(g.entity().y - start[i].y) > 1,
    );
    expect(moved.length).toBeGreaterThan(0);
  });
});

describe("状态机 / 各 NPC 类型持有自己的状态集", () => {
  test("客人有 wander / linger / panic，默认闲游", () => {
    const sets = createStates(createRandom(3));

    expect(sets.guest.entry).toBe("wander");
    for (const name of ["wander", "linger", "panic"] as const) {
      const state = sets.guest.states[name];
      expect(state?.name).toBe(name);
      expect(state!.duration.min).toBeGreaterThan(0);
      expect(state!.duration.max).toBeGreaterThanOrEqual(state!.duration.min);
    }
  });

  test("保镖有 patrol / panic，默认巡逻；**没有** wander / linger", () => {
    const sets = createStates(createRandom(3));

    expect(sets.guard.entry).toBe("patrol");
    expect(sets.guard.states.patrol?.name).toBe("patrol");
    expect(sets.guard.states.panic?.name).toBe("panic");

    // 这是 S2 的核心：不同 NPC 拥有的状态不同
    expect(sets.guard.states.wander).toBeUndefined();
    expect(sets.guard.states.linger).toBeUndefined();
  });

  test("panic 是共享状态，两类型都有（消退后各回自己的默认态）", () => {
    const sets = createStates(createRandom(3));

    expect(sets.guest.states.panic).toBeDefined();
    expect(sets.guard.states.panic).toBeDefined();
    // 归宿不同——panic 不能写死 transition("wander")
    expect(sets.guest.entry).not.toBe(sets.guard.entry);
  });
});
