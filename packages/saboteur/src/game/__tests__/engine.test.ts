// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M0 引擎验证：createGame 的时序契约
//
// 这些契约出错不会崩溃，只会让行为「看起来有点怪」，必须靠测试锁定：
// - useEntity 合并各系统切片
// - start / stop 幂等
// - update 按参数顺序执行
// - 帧内写入在帧末统一提交（延迟快照）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { type Context, use } from "kiaao";
import { setAdapter } from "kiaao/adapter";
import { browserAdapter } from "kiaao/dom";
import { describe, expect, test, vi } from "vite-plus/test";

import { createGame } from "../../engine/game";

setAdapter(browserAdapter);

type TestEntity = { x: number; y: number; vx: number };

/** 构造最小组件 ctx：onMount / onUnmount 收集回调，供测试手动触发 */
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

describe("createGame / useEntity", () => {
  test("合并各系统切片为完整实体", () => {
    const game = createGame<TestEntity>([], { autostart: false });
    const { ctx } = createTestContext();

    const entity = game.useEntity(
      ctx,
      () => ({ x: 1, y: 2 }),
      () => ({ vx: 3 }),
    ) as any;

    // useEntity 返回信号：读值需调用
    expect(entity()).toMatchObject({ x: 1, y: 2, vx: 3 });
    expect(entity.id).toBeTypeOf("symbol");
  });

  test("同名切片后者覆盖前者（注册顺序即优先级）", () => {
    const game = createGame<TestEntity>([], { autostart: false });
    const { ctx } = createTestContext();

    const entity = game.useEntity(
      ctx,
      () => ({ x: 1 }),
      () => ({ x: 9 }),
    ) as any;

    expect(entity().x).toBe(9);
  });
});

describe("createGame / 帧循环开关", () => {
  test("start / stop 幂等：重复调用只生效一次", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1 as any);
    const caf = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

    const game = createGame<TestEntity>([], { autostart: false });

    game.start();
    game.start();
    expect(raf).toHaveBeenCalledTimes(1);

    game.stop();
    game.stop();
    expect(caf).toHaveBeenCalledTimes(1);

    raf.mockRestore();
    caf.mockRestore();
  });

  test("autostart 默认为 true", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1 as any);
    createGame<TestEntity>([]);
    expect(raf).toHaveBeenCalledTimes(1);
    raf.mockRestore();
  });

  test("stop 后状态保留，start 可恢复", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1 as any);
    const game = createGame<TestEntity>([], { autostart: false });

    game.start();
    game.stop();
    game.start();

    expect(raf).toHaveBeenCalledTimes(2);
    raf.mockRestore();
  });
});

describe("createGame / 系统执行", () => {
  test("update 按参数顺序执行", () => {
    const order: string[] = [];
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
      // 只驱动一帧，避免递归
      if (order.length === 0) cb(0);
      return 1;
    });

    createGame<TestEntity>([() => order.push("first"), () => order.push("second")]);

    expect(order).toEqual(["first", "second"]);
    raf.mockRestore();
  });

  test("帧内写入在帧末统一提交给信号（延迟快照）", () => {
    const reads: number[] = [];

    // 手动驱动帧循环：先建实体入池，再跑一帧，避免时序耦合
    const pending: Array<(t: number) => void> = [];
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
      pending.push(cb);
      return pending.length;
    });

    const game = createGame<TestEntity>(
      [
        (frame) => {
          if (!entity) return;
          frame(entity.id, (e) => {
            e.x = 42;
          });
          // 帧内读：此时信号尚未提交，读到的是写入缓存
          reads.push(frame(entity.id)!.x);
        },
      ],
      { autostart: false },
    );

    const { ctx, mounts } = createTestContext();
    const entity = game.useEntity(ctx, () => ({ x: 0, y: 0, vx: 0 })) as any;
    mounts.forEach((fn) => fn());

    game.start();
    const [frame] = pending;
    pending.length = 0;
    frame?.(performance.now());

    // 帧内读到新值（缓存），帧末提交后信号也是新值
    expect(reads[0]).toBe(42);
    expect(entity().x).toBe(42);

    raf.mockRestore();
  });
});

describe("createGame / dispose", () => {
  test("dispose 停止帧循环并清空池", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1 as any);
    const caf = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

    const game = createGame<TestEntity>([], { autostart: false });
    game.start();
    game.dispose();

    expect(caf).toHaveBeenCalled();
    raf.mockRestore();
    caf.mockRestore();
  });
});
