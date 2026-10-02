// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 帧循环的时序契约
//
// 这些契约出错不会崩溃，只会让行为「看起来有点怪」，必须靠测试锁定：
// - start / stop 幂等
// - update 按参数顺序执行
// - **帧内 stop 生效**（终局判定后停止游戏，不该继续空转）
// - **帧内 stop 再 start 不重复排队**（否则帧率翻倍）
// - 帧内写入在帧末统一提交给信号（延迟快照）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context, Signal } from "kiaao";
import { use } from "kiaao";
import { describe, expect, test, vi } from "vite-plus/test";

import { createGame } from "../game.ts";

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
    /** 驱动一帧：执行当前已排队的全部回调 */
    tick() {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const callback of callbacks) callback(performance.now());
    },
    /** 待排队的回调数 */
    pending: () => queue.size,
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

describe("帧循环开关", () => {
  test("start / stop 幂等：重复调用只生效一次", () => {
    const raf = createRaf();
    const game = createGame([], { autostart: false });

    game.start();
    game.start();
    expect(raf.pending()).toBe(1);

    game.stop();
    game.stop();
    expect(raf.pending()).toBe(0);

    raf.restore();
  });

  test("autostart 默认为 true", () => {
    const raf = createRaf();
    createGame([]);
    expect(raf.pending()).toBe(1);
    raf.restore();
  });

  test("stop 后状态保留，start 可恢复", () => {
    const raf = createRaf();
    const game = createGame([], { autostart: false });

    game.start();
    game.stop();
    game.start();

    expect(raf.pending()).toBe(1);
    raf.restore();
  });
});

describe("帧内 stop", () => {
  test("在 update 里 stop：本帧跑完后不再排队", () => {
    const raf = createRaf();
    let frames = 0;

    const game = createGame(
      [
        () => {
          frames += 1;
          game.stop();
        },
      ],
      { autostart: false },
    );

    game.start();
    raf.tick();

    expect(frames).toBe(1);
    expect(raf.pending()).toBe(0);

    // 再驱动若干次也不该有新帧（已无排队回调）
    raf.tick();
    raf.tick();
    expect(frames).toBe(1);

    raf.restore();
  });

  test("帧内 stop 再 start：不重复排队（帧率不翻倍）", () => {
    const raf = createRaf();
    let frames = 0;

    const game = createGame(
      [
        () => {
          frames += 1;
          if (frames === 1) {
            game.stop();
            game.start();
          }
        },
      ],
      { autostart: false },
    );

    game.start();
    raf.tick();
    // 关键：停在 1 而不是 2。旧实现会自己排一次、loop 尾部再排一次
    expect(raf.pending()).toBe(1);

    raf.tick();
    expect(frames).toBe(2);
    expect(raf.pending()).toBe(1);

    raf.restore();
  });

  test("帧内 stop 后 start：恢复时重置时间基准，不计入暂停时长", () => {
    const raf = createRaf();
    const deltas: number[] = [];
    let frames = 0;

    // performance.now 手动推进，模拟「暂停很久后恢复」
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);

    const game = createGame(
      [
        (_frame, delta) => {
          frames += 1;
          deltas.push(delta);
          if (frames === 1) {
            game.stop();
            clock += 5000; // 暂停 5 秒
            game.start();
          }
        },
      ],
      { autostart: false },
    );

    game.start();
    raf.tick();
    raf.tick();

    // 第 2 帧的 delta 是「恢复瞬间」的间隔，应接近 0 而非 5 秒
    expect(deltas[1]).toBeLessThan(0.1);

    raf.restore();
  });
});

describe("系统执行", () => {
  test("update 按参数顺序执行", () => {
    const raf = createRaf();
    const order: string[] = [];

    const game = createGame([() => order.push("first"), () => order.push("second")]);

    game.start();
    raf.tick();

    expect(order).toEqual(["first", "second"]);
    raf.restore();
  });
});

describe("dispose", () => {
  test("dispose 停止帧循环", () => {
    const raf = createRaf();
    let frames = 0;
    const game = createGame(
      [
        () => {
          frames += 1;
        },
      ],
      { autostart: false },
    );

    game.start();
    game.dispose();

    expect(raf.pending()).toBe(0);
    raf.tick();
    expect(frames).toBe(0);

    raf.restore();
  });
});

describe("定义实体与帧末提交", () => {
  test("define 登记实体：帧内改 state，帧末提交给渲染信号", () => {
    const raf = createRaf();
    const game = createGame<{ x: number }>(
      [
        (frame, _delta) => {
          const entry = frame(entityId);
          if (entry) entry.x = 42;
        },
      ],
      { autostart: false },
    );

    const { ctx, mounts } = createTestContext();
    const signal = game.define(ctx)({ x: 0 }) as unknown as Signal<{ x: number }>;
    const entityId = (signal as unknown as { id: symbol }).id;

    mounts.forEach((fn) => fn());

    // 未跑帧：信号是初值
    expect(signal().x).toBe(0);

    game.start();
    raf.tick();

    // 帧末已提交：活对象的改动反映到信号
    expect(signal().x).toBe(42);

    raf.restore();
  });

  test("卸载后实体出池：frame 返回 undefined", () => {
    const raf = createRaf();
    const seen: Array<unknown> = [];
    const game = createGame<{ x: number }>(
      [
        (frame) => {
          seen.push(frame(entityId));
        },
      ],
      { autostart: false },
    );

    const { ctx, mounts, unmounts } = createTestContext();
    const signal = game.define(ctx)({ x: 0 }) as unknown as { id: symbol };
    const entityId = signal.id;

    mounts.forEach((fn) => fn());
    game.start();
    raf.tick();
    expect(seen[0]).toBeDefined();

    unmounts.forEach((fn) => fn());
    raf.tick();
    expect(seen[1]).toBeUndefined();

    raf.restore();
  });
});
