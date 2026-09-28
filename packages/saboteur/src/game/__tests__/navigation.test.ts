// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 导航系统单测：目标规划、路径推进、卡死看门狗
//
// 导航的错误是静默的：NPC 仍会走，只是走错地方、卡在墙角不动、
// 或永远停不下来。这类问题表现为「AI 有点怪」，必须在系统层锁死。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use } from "kiaao";
import { setAdapter } from "kiaao/adapter";
import { browserAdapter } from "kiaao/dom";
import { describe, expect, test } from "vite-plus/test";

import { createGame } from "../../engine/game";
import { createGrid, createRandom, isBlocked, setTile, Tile } from "../../world";
import { cellCenter } from "../../world/path";
import { createBehaviourSystem } from "../systems/behaviour";
import { ACTOR_SIZE, createLocomotionSystem } from "../systems/locomotion";
import { createNavigationSystem } from "../systems/navigation";
import type { ActorEntity } from "../types";

setAdapter(browserAdapter);

/** 帧管理器替身：写回真实信号 */
function createHarness(signal: () => ActorEntity | undefined, id: symbol) {
  const cache = new Map<symbol, ActorEntity>();

  const frame: any = (target: symbol, mutate?: (v: ActorEntity) => void) => {
    if (target !== id) return;
    if (mutate) {
      let base = cache.get(id);
      if (!base) {
        base = { ...(signal() as ActorEntity) };
        cache.set(id, base);
      }
      mutate(base);
      return;
    }
    return cache.get(id) ?? signal();
  };

  const flush = () => {
    for (const data of cache.values()) (signal as any)(data);
    cache.clear();
  };

  return { frame, flush };
}

/** 挂载一个客人实体（注册 role，使意图分派命中） */
function mountGuest(
  game: ReturnType<typeof createGame<ActorEntity>>,
  enters: Array<(id: symbol, ctx: any) => Partial<ActorEntity>>,
) {
  const mounts: Array<() => void> = [];
  const ctx = {
    use,
    onMount: (fn: () => void) => mounts.push(fn),
    onUnmount: () => {},
    owner: {},
  } as any;

  const entity = game.useEntity(ctx, ...(enters as any), () => ({ role: "guest" as const }));
  mounts.forEach((fn) => fn());
  return entity;
}

/** 空场地 */
const openGrid = () => createGrid(20, 20);

/** navigation 需要实体位置才能规划；单独注册 nav 时补上 x/y */
const withPosition =
  (x = 300, y = 300) =>
  () => ({ x, y });

describe("navigation / 目标规划", () => {
  test("实体在首次 update 后获得路径或目标", () => {
    const grid = openGrid();
    const nav = createNavigationSystem({ grid, random: createRandom(1) });
    const game = createGame<ActorEntity>([nav.update], { autostart: false });

    const entity = mountGuest(game, [withPosition(), nav.enter()]);
    const harness = createHarness(entity, (entity as any).id);

    nav.update(harness.frame, 0.016);
    harness.flush();

    // 首次 update 会规划路径（或目标不可达时留空）
    const data = entity() as ActorEntity;
    const planned = data.path.length > 0 || data.goal !== null;
    expect(planned).toBe(true);
  });

  test("路径终点即目标格", () => {
    const grid = openGrid();
    const nav = createNavigationSystem({ grid, random: createRandom(2) });
    const game = createGame<ActorEntity>([nav.update], { autostart: false });

    const entity = mountGuest(game, [withPosition(), nav.enter()]);
    const harness = createHarness(entity, (entity as any).id);

    nav.update(harness.frame, 0.016);
    harness.flush();

    const { path, goal } = entity() as ActorEntity;
    if (path.length > 0 && goal) {
      const last = path[path.length - 1];
      expect(last).toEqual(goal);
    }
  });

  test("路径全程可通行（不穿墙）", () => {
    // 带一道墙的地图，强制绕行
    const grid = openGrid();
    for (let row = 0; row < 15; row += 1) setTile(grid, 10, row, Tile.Wall);

    const nav = createNavigationSystem({ grid, random: createRandom(3) });
    const game = createGame<ActorEntity>([nav.update], { autostart: false });

    const entity = mountGuest(game, [withPosition(), nav.enter()]);
    const harness = createHarness(entity, (entity as any).id);

    // 多次规划，每次都检查路径可通行
    for (let round = 0; round < 20; round += 1) {
      nav.update(harness.frame, 0.016);
      harness.flush();

      for (const cell of (entity() as ActorEntity).path) {
        expect(isBlocked(grid, cell.col, cell.row)).toBe(false);
      }
    }
  });

  test("固定种子：目的地序列可复现", () => {
    const run = () => {
      const grid = openGrid();
      const nav = createNavigationSystem({ grid, random: createRandom(42) });
      const game = createGame<ActorEntity>([nav.update], { autostart: false });
      const entity = mountGuest(game, [withPosition(), nav.enter()]);
      const harness = createHarness(entity, (entity as any).id);

      const goals: string[] = [];
      for (let i = 0; i < 30; i += 1) {
        nav.update(harness.frame, 5); // 大步长跨过停留
        harness.flush();
        const { goal } = entity() as ActorEntity;
        if (goal) goals.push(`${goal.col},${goal.row}`);
      }
      return goals;
    };

    // 同种子两次运行必须完全一致
    expect(run()).toEqual(run());
  });
});

describe("navigation / 路径推进", () => {
  test("走到路径点时弹出该点", () => {
    const grid = openGrid();
    const nav = createNavigationSystem({ grid, random: createRandom(7) });
    const game = createGame<ActorEntity>([nav.update], { autostart: false });

    const entity = mountGuest(game, [withPosition(), nav.enter()]);
    const harness = createHarness(entity, (entity as any).id);
    nav.update(harness.frame, 0.016);
    harness.flush();

    const before = (entity() as ActorEntity).path.length;
    if (before === 0) return; // 无路径的情形由其他用例覆盖

    // 把实体直接搬到首个路径点中心，下一帧应弹出
    const [first] = (entity() as ActorEntity).path;
    const center = cellCenter(first);
    (entity as any)({ ...entity(), x: center.x - ACTOR_SIZE / 2, y: center.y - ACTOR_SIZE / 2 });

    nav.update(harness.frame, 0.016);
    harness.flush();

    expect((entity() as ActorEntity).path.length).toBe(before - 1);
  });
});

describe("navigation / 卡死看门狗", () => {
  test("长时间无推进则放弃路径，等重规划", () => {
    const grid = openGrid();
    const nav = createNavigationSystem({ grid, random: createRandom(11) });
    const game = createGame<ActorEntity>([nav.update], { autostart: false });

    const entity = mountGuest(game, [withPosition(), nav.enter()]);
    const harness = createHarness(entity, (entity as any).id);
    nav.update(harness.frame, 0.016);
    harness.flush();

    if ((entity() as ActorEntity).path.length === 0) return;

    // 实体不动（模拟被卡住），推进 5 秒
    for (let i = 0; i < 300; i += 1) {
      nav.update(harness.frame, 1 / 60);
      harness.flush();
    }

    // 看门狗应已放弃原路径（而非永久跟随同一段）
    const data = entity() as ActorEntity;
    expect(data.followTime).toBe(0);
  });

  test("正常推进不会触发看门狗：长路径能走完", () => {
    const grid = createGrid(40, 40);
    const nav = createNavigationSystem({ grid, random: createRandom(13) });
    const locomotion = createLocomotionSystem(grid);

    const game = createGame<ActorEntity>([nav.update, locomotion.update], { autostart: false });
    locomotion.setIntent("guest", () => ({ dx: 1, dy: 0, sneaking: false }));

    const entity = mountGuest(game, [
      locomotion.enter({ x: 100, y: 100, speed: 78, facing: "east" }),
      nav.enter(),
    ]);
    const harness = createHarness(entity, (entity as any).id);

    // 沿路径点直走：每帧把实体推向当前路径点，模拟正常跟随
    let completed = false;
    for (let i = 0; i < 3000 && !completed; i += 1) {
      nav.update(harness.frame, 1 / 60);
      harness.flush();

      const data = entity() as ActorEntity;
      const [next] = data.path;
      if (next) {
        const center = cellCenter(next);
        const step = 78 / 60;
        (entity as any)({
          ...data,
          x: data.x + Math.sign(center.x - ACTOR_SIZE / 2 - data.x) * step,
          y: data.y + Math.sign(center.y - ACTOR_SIZE / 2 - data.y) * step,
        });
        // 走到位即视为到达（由下一轮 nav.update 弹出）
      } else if (i > 100) {
        completed = true; // 路径走完
      }
    }

    expect(completed).toBe(true);
  });
});

describe("behaviour / 状态切换", () => {
  test("时间推进后状态切换且停留时长被重新掷定", () => {
    const bhv = createBehaviourSystem({ random: createRandom(17) });
    const game = createGame<ActorEntity>([bhv.update], { autostart: false });

    // behaviour 会读 path 判断是否该推迟切换；单独注册时补上空路径
    const entity = mountGuest(game, [() => ({ path: [] }), bhv.enter()]);
    const harness = createHarness(entity, (entity as any).id);

    const initialMood = (entity() as ActorEntity).mood;
    // 跨过初始时长（wander 最长 18s）
    for (let i = 0; i < 1200; i += 1) {
      bhv.update(harness.frame, 1 / 60);
      harness.flush();
    }

    // 至少切换过一次（可能切回原状态，故断言 moodLeft 已被重置）
    expect((entity() as ActorEntity).moodLeft).toBeGreaterThan(0);
    expect((entity() as ActorEntity).mood).toBeTypeOf("string");
    void initialMood;
  });

  test("路径未走完时推迟状态切换", () => {
    const bhv = createBehaviourSystem({ random: createRandom(19) });
    const game = createGame<ActorEntity>([bhv.update], { autostart: false });

    // 直接以「有未走完路径且计时归零」的状态注册。
    // 覆盖切片必须排在 bhv.enter() 之后——useEntity 按顺序 Object.assign，
    // 后注册的切片覆盖先注册的。
    const entity = mountGuest(game, [
      bhv.enter(),
      () => ({ path: [{ col: 5, row: 5 }], moodLeft: 0 }),
    ]);
    const harness = createHarness(entity, (entity as any).id);

    const moodBefore = (entity() as ActorEntity).mood;
    bhv.update(harness.frame, 1 / 60);
    // 必须 flush：写入在帧缓存里，帧末才提交回信号
    harness.flush();

    // 状态不变、计时被推后（给 0.5s 余量）
    expect((entity() as ActorEntity).mood).toBe(moodBefore);
    expect((entity() as ActorEntity).moodLeft).toBe(0.5);
  });
});
