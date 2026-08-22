import type { Context, Signal } from "kiaao";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 帧管理器（延迟快照）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 实体标识：Symbol 天然唯一，全链路统一使用 */
export type EntityId = symbol;

/** 实体信号：组件的绑定句柄，id 为帧循环身份（挂在信号上） */
export type EntitySignal<T> = Signal<T> & { id: EntityId };

/**
 * 帧管理器：单函数双签名，实体结构 T 开放，由注册系统的字段切片合并决定。
 * - frame(id)     读：缓存优先，无缓存取信号当前值，不拷贝
 * - frame(id, fn) 写：首次写时拷贝信号值入缓存，fn 原地修改副本（写时拷贝）
 */
export type FrameManager<T extends Record<string, any> = Record<string, any>> = {
  (id: EntityId): Readonly<T> | undefined;
  (id: EntityId, mutate: (value: T) => void): void;
};

/** 帧缓冲：frame 供系统读写，flush 由帧循环持有，帧末提交 */
type FrameBuffer<T extends Record<string, any>> = {
  frame: FrameManager<T>;
  flush: () => void;
};

function createFrameManager<T extends Record<string, any>>(
  gamePool: Map<EntityId, Signal<T>>,
): FrameBuffer<T> {
  const cache = new Map<EntityId, T>();

  function frame(id: EntityId, mutate?: (value: T) => void) {
    const signal = gamePool.get(id);
    if (!signal) return;

    if (mutate) {
      // 写：首次拷贝底值入缓存，同帧复用可变副本
      let base = cache.get(id);
      if (!base) {
        base = { ...signal() };
        cache.set(id, base);
      }
      mutate(base);
    } else {
      // 读：缓存优先，无则取信号当前值，不拷贝
      return cache.get(id) ?? signal();
    }
  }

  // 帧末：提交所有脏数据并清空缓存
  function flush() {
    for (const [id, data] of cache) {
      const signal = gamePool.get(id);
      if (signal) signal(data);
    }
    cache.clear();
  }

  return { frame, flush };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏引擎
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 系统更新函数：帧逻辑入口 */
export type Update<T extends Record<string, any> = Record<string, any>> = (
  frame: FrameManager<T>,
  delta: number,
) => void;

/**
 * 创建游戏：持有帧循环与主数据池。
 * 系统形态统一：工厂返回对象（含 update），createGame 只收集 update 按序执行；
 * 事件队列/emit 等能力由系统自持（闭包），系统间通过组装层注入的 emit 引用连接。
 * - useEntity(ctx, ...enters)：组件注册实体，合并各系统切片为完整实体
 * - dispose()：停止帧循环（组件卸载、游戏结束等场景）
 */
export function createGame<T extends Record<string, any> = Record<string, any>>(
  updates: Array<Update<T>>,
) {
  // 主数据池：id → Signal
  // 主数据池：id → Signal
  const gamePool = new Map<EntityId, Signal<T>>();

  let prevTime = performance.now();
  let rafId = 0;

  function loop() {
    const now = performance.now();
    const delta = Math.min((now - prevTime) / 1000, 0.05);
    prevTime = now;

    // 创建帧管理器（延迟快照）
    const { frame, flush } = createFrameManager(gamePool);

    // 按序执行所有系统（事件系统的 update 在此处理各自的闭包队列）
    for (const update of updates) {
      update(frame, delta);
    }

    // 帧末提交所有脏数据
    flush();

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

  // ─── useEntity: 组件注册实体 ─────────────────────────
  // 实体 = 信号（组件绑定句柄）+ id（帧循环身份）——id 挂在信号上，一个对象两个身份
  const useEntity = (
    ctx: Context,
    ...enters: Array<(id: EntityId, ctx: Context) => Partial<T>>
  ): EntitySignal<T> => {
    const { use, onMount, onUnmount } = ctx;
    const id = Symbol();

    // 1. 合并各系统数据切片
    // 框架契约：注册的系统切片合并后构成完整实体；
    // 系统 update 消费的字段（如碰撞的 w/h）必须由注册的某系统切片提供
    const merged = {} as T;
    for (const enter of enters) {
      Object.assign(merged, enter(id, ctx));
    }

    // 2. 创建信号并挂载 id（实体身份）
    const signal = use<T>(merged) as EntitySignal<T>;
    signal.id = id;

    // 3. 将信号存入 gamePool
    onMount(() => {
      gamePool.set(id, signal);
    });

    onUnmount(() => {
      gamePool.delete(id);
    });

    return signal;
  };

  return {
    useEntity,
    // 销毁：停止帧循环（组件卸载、游戏结束等场景）
    dispose: () => cancelAnimationFrame(rafId),
  };
}
