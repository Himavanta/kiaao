import type { Context, Signal } from "kiaao";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 帧管理器（活状态对象 + 帧末提交）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 实体标识：Symbol 天然唯一，全链路统一使用 */
export type EntityId = symbol;

/** 实体信号：组件的绑定句柄，id 为帧循环身份（挂在信号上） */
export type EntitySignal<T> = Signal<T> & { id: EntityId };

/**
 * 池里的条目：活状态对象 + 提交函数。
 *
 * 注意这里**没有 signal**：渲染信号只存在于组件侧，引擎从头到尾看不到它，
 * 只负责在帧末喊一声 `flush()`。
 */
type PoolEntry<T> = {
  /** 长期存在的可变状态对象：系统直接读写它 */
  state: T;
  /** 把 state 浅拷贝提交给渲染信号（由组件提供） */
  flush: () => void;
};

/**
 * 帧管理器：实体的唯一访问入口。
 *
 * `frame(id)` 直接返回长期存在的活状态对象，读写都作用于它：
 *
 * ```ts
 * const e = frame(id);
 * if (!e) return;
 * e.x += e.vx * dt;
 * ```
 *
 * 没有单独的写入口——活对象可以直接改，回调形式（`frame(id, fn)`）是
 * 写时拷贝时代的残留，已删除。
 *
 * **缺失 id 时返回 `undefined`**（而不是空对象）：调用方必须显式处理，
 * 否则会报错。返回空对象会把「崩溃」换成静默的 `NaN` 与失效的 guard，
 * 极难排查。
 */
export type FrameManager<T extends Record<string, any> = Record<string, any>> = (
  id: EntityId,
) => T | undefined;

/** 帧缓冲：frame 供系统读写，flush 由帧循环持有，帧末提交 */
type FrameBuffer<T extends Record<string, any>> = {
  frame: FrameManager<T>;
  flush: () => void;
};

function createFrameManager<T extends Record<string, any>>(
  gamePool: Map<EntityId, PoolEntry<T>>,
): FrameBuffer<T> {
  const frame: FrameManager<T> = (id) => gamePool.get(id)?.state;

  // 帧末：让每个实体把自己 state 的浅拷贝提交给渲染信号
  function flush() {
    for (const entry of gamePool.values()) {
      entry.flush();
    }
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
  options?: { autostart?: boolean },
) {
  // 主数据池：id → { state, flush }
  const gamePool = new Map<EntityId, PoolEntry<T>>();

  let prevTime = performance.now();
  let rafId = 0;
  let running = false;

  function loop() {
    const now = performance.now();
    const delta = Math.min((now - prevTime) / 1000, 0.05);
    prevTime = now;

    // 创建帧管理器（活状态对象）
    const { frame, flush } = createFrameManager(gamePool);

    // 按序执行所有系统（事件系统的 update 在此处理各自的闭包队列）
    for (const update of updates) {
      update(frame, delta);
    }

    // 帧末提交：各实体把 state 浅拷贝给渲染信号
    flush();

    rafId = requestAnimationFrame(loop);
  }

  // start/stop：帧循环开关（幂等）——stop 即暂停（帧循环无状态，状态保留在数据里）
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

  if (options?.autostart !== false) start();

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
    const state = {} as T;
    for (const enter of enters) {
      Object.assign(state, enter(id, ctx));
    }

    // 2. 渲染信号：必须持有 state 的**浅拷贝**（新引用）。
    //    若直接把 state 交给信号，原地修改就不会改变引用，按引用比较的
    //    传播机制不会触发——视图永远不更新。
    const signal = use<T>({ ...state }) as EntitySignal<T>;
    signal.id = id;

    // 3. 存入数据池：引擎只见 { state, flush }，不见 signal
    const entry: PoolEntry<T> = {
      state,
      flush: () => signal({ ...state }),
    };

    onMount(() => {
      gamePool.set(id, entry);
    });

    onUnmount(() => {
      gamePool.delete(id);
    });

    return signal;
  };

  return {
    useEntity,
    // 开始/恢复帧循环（幂等；恢复时重置时间基准，不跳帧）
    start,
    // 停止/暂停帧循环（幂等；状态保留在数据中，start 可恢复）
    stop,
    // 销毁：停止帧循环并清空实体池（一去不回）
    dispose: () => {
      stop();
      gamePool.clear();
    },
  };
}
