// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 输入映射与移动系统单测
//
// 输入映射的错误（键码写错、方向反了）不会崩溃，只会「按了没反应」
// 或「走向反方向」；移动系统的错误（朝向不更新、潜行不生效）同理。
// 这类问题靠肉眼极难定位，须在纯逻辑与系统层分别锁死。
//
// 迁移后的差别：`frame(id)` 返回**活对象**，改完立即可读，不再需要
// 手工 flush 缓存。测试台见 `helpers.ts`。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { setAdapter } from "kiaao/adapter";
import { browserAdapter } from "kiaao/dom";
import { describe, expect, test } from "vite-plus/test";

import { createGrid, setTile, TILE, Tile } from "../../world";
import { createInputSystem, DIRECTION_KEYS, readDirection } from "../systems/input";
import { ACTOR_SIZE, createLocomotionSystem, IDLE } from "../systems/locomotion";
import { facingFromVector } from "../types";
import { countWrites, makeActorState, mountActor } from "./helpers";

setAdapter(browserAdapter);

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
  /** 装好移动系统与一个实体 */
  function setup(options: { cols?: number; rows?: number } = {}) {
    const grid = createGrid(options.cols ?? 20, options.rows ?? 20);
    const locomotion = createLocomotionSystem(grid);

    const actor = mountActor({
      enters: [locomotion.enter],
      state: makeActorState({
        ...locomotion.spawn({ x: 100, y: 100, speed: 200, facing: "south" }),
        role: "player",
      }),
    });

    return { grid, locomotion, ...actor };
  }

  test("按意图方向移动，距离 = 速度 × 时间", () => {
    const { locomotion, entity, frame } = setup();
    locomotion.setIntent("player", () => ({ dx: 1, dy: 0, sneaking: false }));

    locomotion.update(frame, 0.5);

    // 200 px/s × 0.5s = 100px
    expect(entity().x).toBeCloseTo(200, 6);
    expect(entity().y).toBeCloseTo(100, 6);
  });

  test("无意图时位置不变，且不产生帧写入", () => {
    const { locomotion, state, id } = setup();
    locomotion.setIntent("player", () => IDLE);

    // 代理帧管理器：任何属性赋值都被计入
    const counter = countWrites(state, id);
    locomotion.update(counter.frame, 0.5);

    expect(counter.writes()).toBe(0);
    expect(state.x).toBe(100);
  });

  test("潜行降低速度", () => {
    const { locomotion, entity, frame } = setup();
    locomotion.setIntent("player", () => ({ dx: 1, dy: 0, sneaking: true }));

    locomotion.update(frame, 1);

    expect(entity().x).toBeGreaterThan(0);
    expect(entity().x).toBeLessThan(200); // 慢于常速
    expect(entity().sneaking).toBe(true);
  });

  /**
   * S3 收口：意图来源按**驱动方式**（player / npc）分派，而非按角色。
   *
   * 原来为 guest 与 guard 各注册一条逐字相同的来源，于是每加一种 NPC
   * 都要再加一行——线性增长的白白重复。
   */
  test("NPC 共用同一条意图来源：guard 与 guest 都命中", () => {
    const grid = createGrid(20, 20);
    const locomotion = createLocomotionSystem(grid);
    const hitRoles: string[] = [];

    // 只注册一次 "npc"
    locomotion.setIntent("npc", (e) => {
      hitRoles.push(e.role);
      return IDLE;
    });

    for (const role of ["guest", "guard"] as const) {
      const actor = mountActor({
        enters: [locomotion.enter],
        state: makeActorState({ ...locomotion.spawn(mkSpawn()), role }),
      });
      locomotion.update(actor.frame, 0.1);
    }

    expect(hitRoles).toEqual(["guest", "guard"]);
  });

  test("未注册驱动方式的 NPC 原地不动（默认静止）", () => {
    const grid = createGrid(20, 20);
    const locomotion = createLocomotionSystem(grid);

    const actor = mountActor({
      enters: [locomotion.enter],
      state: makeActorState({ ...locomotion.spawn(mkSpawn()), role: "guard" }),
    });

    locomotion.update(actor.frame, 1);

    expect(actor.entity().x).toBe(100);
    expect(actor.entity().y).toBe(100);
  });
});

/** 出生参数的公共部分（各用例只关心角色派生差异） */
function mkSpawn() {
  return { x: 100, y: 100, speed: 100, facing: "south" as const };
}

describe("locomotion / 朝向", () => {
  function setup() {
    const grid = createGrid(30, 30);
    const locomotion = createLocomotionSystem(grid);
    let intent = { dx: 1, dy: 0, sneaking: false };
    locomotion.setIntent("player", () => intent);

    const actor = mountActor({
      enters: [locomotion.enter],
      state: makeActorState({
        ...locomotion.spawn({ x: 100, y: 100, speed: 100, facing: "north" }),
        role: "player",
      }),
    });

    return {
      ...actor,
      move(dx: number, dy: number) {
        intent = { dx, dy, sneaking: false };
        locomotion.update(actor.frame, 0.1);
      },
    };
  }

  test("朝向随移动方向改变", () => {
    const t = setup();

    t.move(1, 0);
    expect(t.entity().facing).toBe("east");

    t.move(0, 1);
    expect(t.entity().facing).toBe("south");

    t.move(-1, 0);
    expect(t.entity().facing).toBe("west");

    t.move(0, -1);
    expect(t.entity().facing).toBe("north");
  });

  test("顶着墙走不改变朝向（无位移即无转向）", () => {
    const grid = createGrid(10, 10);
    // 紧贴实体右侧放墙：实体右边缘恰好贴住该格左沿
    const offset = (TILE - ACTOR_SIZE) / 2;
    const startX = 3 * TILE - ACTOR_SIZE;
    setTile(grid, 3, 3, Tile.Wall);

    const locomotion = createLocomotionSystem(grid);
    locomotion.setIntent("player", () => ({ dx: 1, dy: 0, sneaking: false }));

    const actor = mountActor({
      enters: [locomotion.enter],
      state: makeActorState({
        ...locomotion.spawn({
          x: startX,
          y: 3 * TILE + offset,
          speed: 100,
          facing: "north",
        }),
        role: "player",
      }),
    });

    // 向右移动但已贴墙 → x 不变 → 朝向保持 north
    locomotion.update(actor.frame, 0.5);

    expect(actor.entity().x).toBe(startX);
    expect(actor.entity().facing).toBe("north");
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
