// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// flock 的两种范式分工
//
// 这个 demo 的意义是「让分工可见」，所以测试也锁这一点：
//
//   个体方法（createActorSystem）  写「意图」——vx / vy、自己的 trail
//   共享机制（createPool）         把意图变成位置——x / y、越界反弹
//
// 若哪次重构让个体方法直接写 x/y，或让机制开始读 trail，这些断言就会
// 失败——那说明分工被打破了。
//
// **不经过 `define`**：本文件测的是「池 + 机制」的契约，直接调 `enter`
// 入池、手造帧管理器，比搭一个完整组件上下文更直接（也不需要 `ctx.use`）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createActorSystem, type Enter, type FrameManager } from "engine";
import { describe, expect, test } from "vite-plus/test";

import { WORLD, createBird, type BirdState } from "../bird";
import { createBoundarySystem, createMovementSystem } from "../systems";

/** 把实体登记进一组 enter（收集 onMount 并触发，等价于组件挂载） */
function attach(enters: Array<Enter<any>>, state: unknown): { id: symbol } {
  const mounts: Array<() => void> = [];
  const ctx = {
    onMount: (fn: () => void) => mounts.push(fn),
    onUnmount: () => {},
  } as never;
  const id = Symbol();
  for (const enter of enters) enter(id, ctx, state);
  mounts.forEach((fn) => fn());
  return { id };
}

/** 单实体帧管理器：只有这个 id 能取到 state */
function frameOf(id: symbol, state: BirdState): FrameManager<BirdState> {
  return (target) => (target === id ? state : undefined);
}

describe("flock / 个体方法只表达意图", () => {
  test("onFrame 改速度与轨迹，但不写位置", () => {
    const bird = createBird({ x: 100, y: 100, color: "#fff" });
    const before = { x: bird.x, y: bird.y };

    bird.onFrame({ frame: () => undefined, delta: 1 / 60 });

    // 位置没动——那是 movement 的活
    expect(bird.x).toBe(before.x);
    expect(bird.y).toBe(before.y);
    // 但速度动了（意图变了）
    expect(bird.vx !== 0 || bird.vy !== 0).toBe(true);
    // 轨迹记了一个点（私有记忆）
    expect(bird.trail.length).toBe(1);
  });

  test("轨迹有上限，不会无界增长", () => {
    const bird = createBird({ x: 10, y: 10, color: "#fff" });
    for (let i = 0; i < 200; i += 1) bird.onFrame({ frame: () => undefined, delta: 1 / 60 });
    expect(bird.trail.length).toBe(24);
  });

  test("每只鸟的轨迹是各自的——不共享容器", () => {
    const a = createBird({ x: 10, y: 10, color: "#fff" });
    const b = createBird({ x: 300, y: 200, color: "#000" });

    a.onFrame({ frame: () => undefined, delta: 1 / 60 });
    a.onFrame({ frame: () => undefined, delta: 1 / 60 });

    expect(a.trail).not.toBe(b.trail);
    expect(a.trail.length).toBe(2);
    expect(b.trail.length).toBe(0);
  });
});

describe("flock / 机制把意图变成位置", () => {
  test("movement 积分：x += vx·dt（个体方法未挂，速度不会被改）", () => {
    const movement = createMovementSystem();
    const bird = createBird({ x: 100, y: 100, color: "#fff" });
    bird.vx = 60;
    bird.vy = 0;

    const { id } = attach([movement.enter], bird);
    movement.update(frameOf(id, bird), 1 / 60);

    expect(bird.x).toBeCloseTo(100 + 60 * (1 / 60), 5);
  });

  test("boundary 反弹：越界被推回，速度反向", () => {
    const boundary = createBoundarySystem({ ...WORLD, pad: 14 });
    const bird = createBird({ x: 5, y: 100, color: "#fff" });

    const { id } = attach([boundary.enter], bird);
    boundary.update(frameOf(id, bird));

    expect(bird.x).toBe(14);
    expect(bird.vx).toBeGreaterThan(0);
  });

  test("两机制互不知情：一个池只处理注册了它的实体", () => {
    const movement = createMovementSystem();
    const boundary = createBoundarySystem({ ...WORLD, pad: 14 });

    const bird = createBird({ x: 100, y: 100, color: "#fff" });
    bird.vx = 60;
    // 只注册 movement，不注册 boundary
    const { id } = attach([movement.enter], bird);

    // boundary 的池里没有它 ⇒ 边界不会被应用（即便它越界了）
    bird.x = 5;
    boundary.update(frameOf(id, bird));
    expect(bird.x).toBe(5); // 没被推回
  });
});

describe("flock / 两机制并在一只实体上（顺序有效）", () => {
  test("个体表态先于机制位移：位移方向与个体意图一致", () => {
    const movement = createMovementSystem();
    const boundary = createBoundarySystem({ ...WORLD, pad: 14 });
    const actor = createActorSystem<BirdState>();

    const bird = createBird({ x: 200, y: 200, color: "#fff" });
    bird.vx = 0;
    bird.vy = 0;
    // 注册全部三个：机制两个 + 个体一个
    const { id } = attach([movement.enter, boundary.enter, actor.enter], bird);
    const frame = frameOf(id, bird);

    const beforeX = bird.x;
    // 与生产同序：个体表态 → 位移 → 边界
    actor.update(frame, 1 / 60);
    const intentVx = bird.vx;
    movement.update(frame, 1 / 60);
    boundary.update(frame);

    // 个体确实产生了意图
    expect(intentVx !== 0 || bird.vy !== 0).toBe(true);
    // 机制按那个意图动了位置（方向一致）
    expect(bird.x).not.toBe(beforeX);
    expect(Math.sign(bird.x - beforeX)).toBe(Math.sign(intentVx));
    // 个体方法顺带记了轨迹（私有记忆在跑）
    expect(bird.trail.length).toBe(1);
  });
});

describe("flock / 世界尺寸单一来源", () => {
  test("WORLD 是一处常量，机制与视图共用", () => {
    expect(WORLD.w).toBeGreaterThan(0);
    expect(WORLD.h).toBeGreaterThan(0);
  });
});
