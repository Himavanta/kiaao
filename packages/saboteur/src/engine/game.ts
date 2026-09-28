// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏引擎：帧循环 + 实体池 + useEntity
// 系统自持各自能力（事件队列、池），createGame 只按序执行 update
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context, Signal } from "kiaao";

import type { EntityId, EntitySignal, FrameManager, Update } from "./types";

/** 单帧最大步长（秒）：切后台回来时不把整段停机时间计入帧逻辑 */
const MAX_DELTA = 0.05;

// ── 帧缓冲（延迟快照：写时拷贝，帧末统一提交）─────────

type FrameBuffer<T extends Record<string, any>> = {
  frame: FrameManager<T>;
  flush: () => void;
};

function createFrameBuffer<T extends Record<string, any>>(
  gamePool: Map<EntityId, Signal<any>>,
): FrameBuffer<T> {
  const cache = new Map<EntityId, T>();

  function frame(id: EntityId, mutate?: (value: T) => void) {
    const signal = gamePool.get(id);
    if (!signal) return;

    if (mutate) {
      // 写：首次写时拷贝底值入缓存，同帧复用同一可变副本
      let base = cache.get(id);
      if (!base) {
        base = { ...(signal() as T) };
        cache.set(id, base);
      }
      mutate(base);
      return;
    }

    // 读：缓存优先，无缓存取信号当前值，不拷贝
    return cache.get(id) ?? (signal() as T);
  }

  function flush() {
    for (const [id, data] of cache) {
      const signal = gamePool.get(id);
      if (signal) signal(data);
    }
    cache.clear();
  }

  return { frame, flush };
}

// ── 帧循环 ────────────────────────────────────────────

type Ticker = {
  start: () => void;
  stop: () => void;
};

function createTicker<T extends Record<string, any>>(options: {
  updates: Array<Update<T>>;
  gamePool: Map<EntityId, Signal<any>>;
}): Ticker {
  const { updates, gamePool } = options;

  let prevTime = performance.now();
  let rafId = 0;
  let running = false;

  function loop() {
    const now = performance.now();
    const delta = Math.min((now - prevTime) / 1000, MAX_DELTA);
    prevTime = now;

    const { frame, flush } = createFrameBuffer<T>(gamePool);

    for (const update of updates) {
      update(frame, delta);
    }

    flush();

    rafId = requestAnimationFrame(loop);
  }

  const start = () => {
    if (running) return;
    running = true;
    // 重置时间基准：恢复时不把暂停时长计入 delta
    prevTime = performance.now();
    rafId = requestAnimationFrame(loop);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
  };

  return { start, stop };
}

// ── 实体注册（useEntity）──────────────────────────────

/**
 * 实体注册器。
 *
 * 泛型 `E` 默认取游戏的实体类型，但允许调用点显式指定——同一池里可以
 * 存在形态不同的实体（如角色与不动道具）。系统的池各自持有 id，
 * 帧读写只会触及自己注册的实体，因此类型在调用点收敛即可。
 */
function createEntityRegistrar<T extends Record<string, any>>(
  gamePool: Map<EntityId, Signal<any>>,
) {
  return <E extends Record<string, any> = T>(
    ctx: Context,
    // `NoInfer` 阻止从参数推断 E：否则 `useEntity(ctx, () => ({ role }))`
    // 会把 E 推断成 `{ role }` 而丢掉默认的实体类型。
    // 需要异形实体（如不动道具）时由调用点显式指定 `useEntity<PropEntity>(...)`。
    ...enters: Array<(id: EntityId, ctx: Context) => Partial<NoInfer<E>>>
  ): EntitySignal<E> => {
    const { use, onMount, onUnmount } = ctx;
    const id = Symbol();

    // 合并各系统数据切片：后注册的系统覆盖同名字段
    const merged = {} as E;
    for (const enter of enters) {
      Object.assign(merged, enter(id, ctx));
    }

    const signal = use<E>(merged) as EntitySignal<E>;
    signal.id = id;

    // 挂载窗口 = 实体存活窗口：帧循环只读写池内实体
    onMount(() => {
      gamePool.set(id, signal as Signal<any>);
    });
    onUnmount(() => {
      gamePool.delete(id);
    });

    return signal;
  };
}

// ── 游戏实例 ──────────────────────────────────────────

/**
 * 创建游戏：持有帧循环与主数据池。
 * - useEntity(ctx, ...enters)：组件注册实体，合并各系统切片为完整实体
 * - start / stop：帧循环开关（幂等）；stop 即暂停，状态保留在数据里
 * - dispose：停止并清空实体池（一去不回；重开请替换实体目录信号，见规划文档 4.6）
 */
export function createGame<T extends Record<string, any>>(
  updates: Array<Update<T>>,
  options?: { autostart?: boolean },
) {
  // 主数据池：id → 实体信号（形态由注册方决定，泛型在调用点收敛）
  const gamePool = new Map<EntityId, Signal<any>>();

  const ticker = createTicker({ updates, gamePool });
  // 显式传入 T：createEntityRegistrar 的 T 只出现在返回类型上，无法推断
  const useEntity = createEntityRegistrar<T>(gamePool);

  if (options?.autostart !== false) ticker.start();

  return {
    useEntity,
    start: ticker.start,
    stop: ticker.stop,
    dispose: () => {
      ticker.stop();
      gamePool.clear();
    },
  };
}
