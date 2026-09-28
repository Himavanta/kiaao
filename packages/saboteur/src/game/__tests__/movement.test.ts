// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 输入映射与移动系统单测
//
// 输入映射的错误（键码写错、方向反了）不会崩溃，只会「按了没反应」
// 或「走向反方向」；移动系统的错误（朝向不更新、潜行不生效）同理。
// 这类问题靠肉眼极难定位，须在纯逻辑与系统层分别锁死。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use } from "kiaao";
import { setAdapter } from "kiaao/adapter";
import { browserAdapter } from "kiaao/dom";
import { describe, expect, test, vi } from "vite-plus/test";

import { createGame } from "../../engine/game";
import { createGrid, setTile, TILE, Tile } from "../../world";
import { createInputSystem, DIRECTION_KEYS, readDirection } from "../systems/input";
import { ACTOR_SIZE, createLocomotionSystem, IDLE } from "../systems/locomotion";
import { facingFromVector, type ActorEntity } from "../types";

setAdapter(browserAdapter);

// ── 测试台：真实 createGame + 真实 use，池行为完全一致 ──

/**
 * 测试台：帧管理器替身 + 把提交写回真实信号。
 *
 * 必须写回信号——否则验的是测试内部的 Map，而不是框架行为。
 */
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
    // 信号写入走 setter 形态（带参调用），与引擎的 flush 一致
    for (const data of cache.values()) (signal as any)(data);
    cache.clear();
  };

  return { frame, flush };
}

/** 用真实引擎注册实体，返回实体信号与测试台 */
function mountActor(
  game: ReturnType<typeof createGame<ActorEntity>>,
  enters: Array<(id: symbol, ctx: any) => Partial<ActorEntity>>,
) {
  const mounts: Array<() => void> = [];
  const unmounts: Array<() => void> = [];
  const ctx = {
    use,
    onMount: (fn: () => void) => mounts.push(fn),
    onUnmount: (fn: () => void) => unmounts.push(fn),
    owner: {},
  } as any;

  const entity = game.useEntity(ctx, ...(enters as any));
  return { entity, mounts, unmounts };
}

describe("readDirection / 方向映射", () => {
  test("四方向键码映射正确", () => {
    expect(DIRECTION_KEYS.KeyW).toEqual({ dx: 0, dy: -1 });
    expect(DIRECTION_KEYS.KeyS).toEqual({ dx: 0, dy: 1 });
    expect(DIRECTION_KEYS.KeyA).toEqual({ dx: -1, dy: 0 });
    expect(DIRECTION_KEYS.KeyD).toEqual({ dx: 1, dy: 0 });
  });

  test("方向键与 WASD 等价", () => {
    expect(DIRECTION_KEYS.ArrowUp).toEqual(DIRECTION_KEYS.KeyW);
    expect(DIRECTION_KEYS.ArrowLeft).toEqual(DIRECTION_KEYS.KeyA);
    expect(DIRECTION_KEYS.ArrowDown).toEqual(DIRECTION_KEYS.KeyS);
    expect(DIRECTION_KEYS.ArrowRight).toEqual(DIRECTION_KEYS.KeyD);
  });

  test("无按键时为零向量", () => {
    expect(readDirection(new Set())).toEqual({ dx: 0, dy: 0 });
  });

  test("取最近按下的键：后按的覆盖先按的", () => {
    // Set 保持插入顺序，末位为最近按下——「按着左不放再按下」应立即向右
    expect(readDirection(new Set(["KeyA", "KeyD"]))).toEqual({ dx: 1, dy: 0 });
  });

  test("未知键码被忽略", () => {
    expect(readDirection(new Set(["F1"]))).toEqual({ dx: 0, dy: 0 });
  });
});

describe("facingFromVector", () => {
  test("四向映射正确", () => {
    expect(facingFromVector(0, -1)).toBe("north");
    expect(facingFromVector(0, 1)).toBe("south");
    expect(facingFromVector(-1, 0)).toBe("west");
    expect(facingFromVector(1, 0)).toBe("east");
  });

  test("零向量不改变朝向", () => {
    expect(facingFromVector(0, 0)).toBeUndefined();
  });

  test("斜向取主轴优先", () => {
    expect(facingFromVector(1, 1)).toBe("east");
    expect(facingFromVector(-1, 1)).toBe("west");
  });
});

describe("locomotion / 位移", () => {
  /** 装好移动系统与一个实体的测试台 */
  function setup(options: { cols?: number; rows?: number } = {}) {
    const grid = createGrid(options.cols ?? 20, options.rows ?? 20);
    const locomotion = createLocomotionSystem(grid);
    const game = createGame<ActorEntity>([locomotion.update], { autostart: false });

    return { grid, locomotion, game };
  }

  test("按意图方向移动，距离 = 速度 × 时间", () => {
    const { locomotion, game } = setup();
    locomotion.setIntent(() => ({ dx: 1, dy: 0, sneaking: false }));

    const { entity, mounts } = mountActor(game, [
      locomotion.enter({ x: 100, y: 100, speed: 200, facing: "south" }),
    ]);
    mounts.forEach((fn) => fn());

    const harness = createHarness(entity, (entity as any).id);
    locomotion.update(harness.frame, 0.5);
    harness.flush();

    // 200 px/s × 0.5s = 100px
    expect(entity().x).toBeCloseTo(200, 6);
    expect(entity().y).toBeCloseTo(100, 6);
  });

  test("无意图时位置不变，且不产生帧写入", () => {
    const { locomotion, game } = setup();
    locomotion.setIntent(() => IDLE);

    const { entity, mounts } = mountActor(game, [
      locomotion.enter({ x: 100, y: 100, speed: 200, facing: "south" }),
    ]);
    mounts.forEach((fn) => fn());

    const harness = createHarness(entity, (entity as any).id);
    const writes = vi.fn();
    const frame: any = (id: symbol, mutate?: any) => {
      if (mutate) writes();
      return harness.frame(id, mutate);
    };

    locomotion.update(frame, 0.5);

    expect(writes).not.toHaveBeenCalled();
    expect(entity().x).toBe(100);
  });

  test("潜行降低速度", () => {
    const { locomotion, game } = setup();
    locomotion.setIntent(() => ({ dx: 1, dy: 0, sneaking: true }));

    const { entity, mounts } = mountActor(game, [
      locomotion.enter({ x: 0, y: 0, speed: 200, facing: "south" }),
    ]);
    mounts.forEach((fn) => fn());

    const harness = createHarness(entity, (entity as any).id);
    locomotion.update(harness.frame, 1);
    harness.flush();

    expect(entity().x).toBeGreaterThan(0);
    expect(entity().x).toBeLessThan(200); // 慢于常速
    expect(entity().sneaking).toBe(true);
  });
});

describe("locomotion / 朝向", () => {
  function setup() {
    const grid = createGrid(30, 30);
    const locomotion = createLocomotionSystem(grid);
    const game = createGame<ActorEntity>([locomotion.update], { autostart: false });

    let intent = { dx: 1, dy: 0, sneaking: false };
    locomotion.setIntent(() => intent);

    const { entity, mounts } = mountActor(game, [
      locomotion.enter({ x: 100, y: 100, speed: 100, facing: "north" }),
    ]);
    mounts.forEach((fn) => fn());

    const harness = createHarness(entity, (entity as any).id);

    return {
      entity,
      move(dx: number, dy: number) {
        intent = { dx, dy, sneaking: false };
        locomotion.update(harness.frame, 0.1);
        harness.flush();
      },
      facing: () => entity().facing,
    };
  }

  test("朝向随移动方向改变", () => {
    const t = setup();

    t.move(1, 0);
    expect(t.facing()).toBe("east");

    t.move(0, 1);
    expect(t.facing()).toBe("south");

    t.move(-1, 0);
    expect(t.facing()).toBe("west");

    t.move(0, -1);
    expect(t.facing()).toBe("north");
  });

  test("顶着墙走不改变朝向（无位移即无转向）", () => {
    const grid = createGrid(10, 10);
    // 紧贴实体右侧放墙：实体右边缘恰好贴住该格左沿
    const offset = (TILE - ACTOR_SIZE) / 2;
    const startX = 3 * TILE - ACTOR_SIZE;
    setTile(grid, 3, 3, Tile.Wall);

    const locomotion = createLocomotionSystem(grid);
    const game = createGame<ActorEntity>([locomotion.update], { autostart: false });
    locomotion.setIntent(() => ({ dx: 1, dy: 0, sneaking: false }));

    const { entity, mounts } = mountActor(game, [
      locomotion.enter({ x: startX, y: 3 * TILE + offset, speed: 100, facing: "north" }),
    ]);
    mounts.forEach((fn) => fn());

    const harness = createHarness(entity, (entity as any).id);

    // 向右移动但已贴墙 → x 不变 → 朝向保持 north
    locomotion.update(harness.frame, 0.5);
    harness.flush();

    expect(entity().x).toBe(startX);
    expect(entity().facing).toBe("north");
  });
});

describe("input / 键盘事件", () => {
  test("按下与抬起维护 pressed 集合", () => {
    const input = createInputSystem();
    const mounts: Array<() => void> = [];
    input.attach({ onMount: (fn) => mounts.push(fn), onUnmount: () => {} });
    mounts.forEach((fn) => fn());

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect([...input.pressed()]).toEqual(["KeyW"]);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect([...input.pressed()]).toEqual(["KeyW", "KeyD"]);

    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
    expect([...input.pressed()]).toEqual(["KeyD"]);
  });

  test("Shift 切换潜行状态", () => {
    const input = createInputSystem();
    const mounts: Array<() => void> = [];
    input.attach({ onMount: (fn) => mounts.push(fn), onUnmount: () => {} });
    mounts.forEach((fn) => fn());

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }));
    expect(input.sneaking()).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ShiftLeft" }));
    expect(input.sneaking()).toBe(false);
  });

  test("失焦清空按键：避免切窗口回来一直走", () => {
    const input = createInputSystem();
    const mounts: Array<() => void> = [];
    input.attach({ onMount: (fn) => mounts.push(fn), onUnmount: () => {} });
    mounts.forEach((fn) => fn());

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }));
    window.dispatchEvent(new Event("blur"));

    expect([...input.pressed()]).toEqual([]);
    expect(input.sneaking()).toBe(false);
  });

  test("卸载后不再响应键盘事件", () => {
    const input = createInputSystem();
    const mounts: Array<() => void> = [];
    const unmounts: Array<() => void> = [];
    input.attach({ onMount: (fn) => mounts.push(fn), onUnmount: (fn) => unmounts.push(fn) });
    mounts.forEach((fn) => fn());
    unmounts.forEach((fn) => fn());

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect([...input.pressed()]).toEqual([]);
  });
});
