// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 实体方法调用器的契约
//
// 这个机制的「坑」都是静默的——不会崩，只会让个体行为**不生效**：
// - 没挂 `actor.enter` 的实体：方法永不被调用（装配错误，无报错）
// - 无 `onFrame` 的实体：应当被跳过而非崩溃（可选字段的语义）
// - 卸载后仍在池里：每帧对着已销毁的实体调方法
// - `delta` 传错：计时类行为整体走偏，且看起来「只是有点怪」
//
// 这些必须靠测试锁定。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context } from "kiaao";
import { use } from "kiaao";
import { describe, expect, test, vi } from "vite-plus/test";

import { createActorSystem, type ActorContext } from "../actor.ts";
import { createGame, type FrameManager } from "../game.ts";

/** requestAnimationFrame 替身：手动驱动帧，可控可观 */
function createRaf() {
  const queue = new Map<number, (t: number) => void>();
  let nextId = 1;

  const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  const caf = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id: any) => {
    queue.delete(id);
  });

  return {
    tick() {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const callback of callbacks) callback(performance.now());
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
    },
  };
}

/** 最小组件 ctx：onMount / onUnmount 收集回调，供测试手动触发 */
function createTestContext() {
  const mounts: Array<() => void> = [];
  const unmounts: Array<() => void> = [];
  const ctx = {
    use,
    onMount: (fn: () => void) => mounts.push(fn),
    onUnmount: (fn: () => void) => unmounts.push(fn),
    owner: {},
  } as unknown as Context;
  return { ctx, mounts, unmounts };
}

type Probe = {
  frames: number;
  lastDelta: number;
  ticks: number;
  onFrame?: (ctx: ActorContext<Probe>) => void;
};

/** 造一个带 `onFrame` 的实体状态 */
function probe(): Probe {
  return {
    frames: 0,
    lastDelta: 0,
    ticks: 0,
    onFrame(ctx) {
      this.frames += 1;
      this.lastDelta = ctx.delta;
      this.ticks += 1;
    },
  };
}

describe("createActorSystem / 池的独立性", () => {
  test("每次调用建自己的池：两个实例互不干扰", () => {
    const a = createActorSystem<Probe>();
    const b = createActorSystem<Probe>();
    // enter 是不同的函数实例 ⇒ 池也不同
    expect(a.enter).not.toBe(b.enter);
  });
});

describe("createActorSystem / 调用契约", () => {
  test("登记且有 onFrame：每帧被调用一次，delta 正确", () => {
    const raf = createRaf();
    const actor = createActorSystem<Probe>();
    const game = createGame<Probe>([actor.update], { autostart: false });

    const { ctx, mounts } = createTestContext();
    const state = probe();
    game.define(ctx, actor.enter)(state);
    mounts.forEach((fn) => fn());

    game.start();
    raf.tick();
    raf.tick();

    expect(state.frames).toBe(2);
    expect(state.ticks).toBe(2);
    // delta 是秒且在合理范围（rAF 替身下两次 tick 间隔极小，≥ 0）
    expect(state.lastDelta).toBeGreaterThanOrEqual(0);

    raf.restore();
  });

  test("无 onFrame 的实体被跳过：不崩、不调用", () => {
    const raf = createRaf();
    const actor = createActorSystem<Probe>();
    const game = createGame<Probe>([actor.update], { autostart: false });

    const { ctx, mounts } = createTestContext();
    const withHook = probe();
    const withoutHook: Probe = { frames: 0, lastDelta: 0, ticks: 0 };
    game.define(ctx, actor.enter)(withHook);
    game.define(ctx, actor.enter)(withoutHook);
    mounts.forEach((fn) => fn());

    game.start();
    expect(() => raf.tick()).not.toThrow();

    expect(withHook.frames).toBe(1);
    expect(withoutHook.frames).toBe(0);

    raf.restore();
  });

  test("未注册 actor.enter 的实体：方法不生效（装配错误的静默形态）", () => {
    const raf = createRaf();
    const actor = createActorSystem<Probe>();
    // update 在流水线里，但实体没挂 actor.enter
    const game = createGame<Probe>([actor.update], { autostart: false });

    const { ctx, mounts } = createTestContext();
    const state = probe();
    game.define(ctx)(state);
    mounts.forEach((fn) => fn());

    game.start();
    raf.tick();

    expect(state.frames).toBe(0);

    raf.restore();
  });

  test("卸载后出池：不是「不再调用」，而是池里真的没有它了", () => {
    const actor = createActorSystem<Probe>();
    const game = createGame<Probe>([], { autostart: false });

    const { ctx, mounts, unmounts } = createTestContext();
    const signal = game.define(ctx, actor.enter)(probe()) as unknown as { id: symbol };
    const id = signal.id;
    mounts.forEach((fn) => fn());

    /** 探子帧管理器：记录池里到底遍历了哪些 id */
    const visited: symbol[] = [];
    const spyFrame = ((target: symbol) => {
      visited.push(target);
      return game.frame(target);
    }) as FrameManager<Probe>;

    actor.update(spyFrame, 0.016);
    expect(visited).toEqual([id]);

    // 卸载后：池里应当**没有**它。
    // 不能只断言「onFrame 不再被调」——卸载时 gamePool 也删了实体，
    // frame(id) 返回 undefined，可选链会静默跳过。**池泄没泄漏，
    // 行为完全一样**（真实代价是 Set 无界增长，不是行为错误）。
    // 所以必须直接观察遍历。
    visited.length = 0;
    unmounts.forEach((fn) => fn());
    actor.update(spyFrame, 0.016);
    expect(visited).toEqual([]);
  });

  test("空池：update 不崩（流水线里挂着但没有实体）", () => {
    const raf = createRaf();
    const actor = createActorSystem<Probe>();
    const game = createGame<Probe>([actor.update], { autostart: false });

    game.start();
    expect(() => raf.tick()).not.toThrow();

    raf.restore();
  });
});

describe("createActorSystem / 上下文", () => {
  test("ctx.frame 拿到实体自己的活对象（可读写）", () => {
    const raf = createRaf();
    const actor = createActorSystem<Probe>();
    const game = createGame<Probe>([actor.update], { autostart: false });

    const { ctx, mounts } = createTestContext();
    const state = probe();
    const signal = game.define(ctx, actor.enter)(state) as unknown as { id: symbol };
    mounts.forEach((fn) => fn());

    // 方法内按 id 取回自己，改字段——验证 frame 能用
    state.onFrame = (c) => {
      const self = c.frame(signal.id);
      if (self) self.ticks = 99;
    };

    game.start();
    raf.tick();

    expect(state.ticks).toBe(99);
    expect(game.frame(signal.id)).toBe(state);

    raf.restore();
  });

  test("多个实体共享同一个 ctx 对象（每帧建一次，不是每实体一次）", () => {
    const raf = createRaf();
    const actor = createActorSystem<Probe>();
    const game = createGame<Probe>([actor.update], { autostart: false });

    const { ctx, mounts } = createTestContext();
    let first: ActorContext<Probe> | undefined;
    let second: ActorContext<Probe> | undefined;

    const a: Probe = { frames: 0, lastDelta: 0, ticks: 0, onFrame: (c) => (first = c) };
    const b: Probe = { frames: 0, lastDelta: 0, ticks: 0, onFrame: (c) => (second = c) };
    game.define(ctx, actor.enter)(a);
    game.define(ctx, actor.enter)(b);
    mounts.forEach((fn) => fn());

    game.start();
    raf.tick();

    expect(first).toBeDefined();
    expect(first).toBe(second);

    raf.restore();
  });
});
