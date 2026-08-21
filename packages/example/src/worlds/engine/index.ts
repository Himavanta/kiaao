import type { Context, Signal } from "kiaao";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 帧管理器（延迟快照）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 实体标识：Symbol 天然唯一，全链路统一使用 */
export type EntityId = symbol;

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
// 事件系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 事件词汇表：事件名 → payload 类型（游戏层领域词汇，独立声明） */
export type EventMap = Record<string, Record<string, unknown>>;

/** 事件统一形态：判别联合（消费端 switch 自动收窄 payload） */
export type GameEvent<EM extends EventMap> = {
  [K in keyof EM]: { type: K; payload: EM[K] };
}[keyof EM];

/** emits 句柄：事件名即方法，payload 自动校验 */
export type Emits<EM extends EventMap> = { [K in keyof EM]: (payload: EM[K]) => void };

/** 引擎通用系统词汇：系统库各系统发射的事件（游戏词汇表需包含或扩展） */
export type EngineEvents = {
  break: { id: EntityId; by: EntityId; points: number };
  bounce: { id: EntityId; by: EntityId };
  out: { id: EntityId };
};

/** 系统更新函数：帧逻辑入口，可发射事件 */
export type Update<
  T extends Record<string, any> = Record<string, any>,
  EM extends EventMap = {},
> = (frame: FrameManager<T>, delta: number, emits: Emits<EM>) => void;

/** 事件系统：纯函数形态（无池、无 register），消费事件并落地为数据 */
export type EventSystem<
  T extends Record<string, any> = Record<string, any>,
  EM extends EventMap = {},
> = (frame: FrameManager<T>, events: GameEvent<EM>[], emits: Emits<EM>) => void;

/**
 * 创建游戏：持有帧循环、主数据池与事件队列。
 * - useGame(ctx, ...registers)：组件注册实体，合并各系统切片为完整实体
 * - emits：事实入口（帧外也可用：DOM 事件、异步回调），事件在事件阶段被消费
 * - dispose()：停止帧循环（组件卸载、游戏结束等场景）
 */
export function createGame<
  T extends Record<string, any> = Record<string, any>,
  EM extends EventMap = {},
>(updates: Array<Update<T, EM>>, eventSystems: Array<EventSystem<T, EM>> = []) {
  // 主数据池：id → Signal
  const gamePool = new Map<EntityId, Signal<T>>();

  // 事件队列：累积区语义（帧外可随时入队），事件阶段消费即清空
  const eventQueue: GameEvent<EM>[] = [];

  // Proxy emits：属性访问即发射函数（零样板、类型安全）
  const emits = new Proxy({} as Emits<EM>, {
    get: (_target, key: string | symbol) => {
      if (typeof key !== "string") return undefined;
      return (payload: unknown) => {
        eventQueue.push({ type: key, payload } as GameEvent<EM>);
      };
    },
  });

  let prevTime = performance.now();
  let rafId = 0;

  function loop() {
    const now = performance.now();
    const delta = Math.min((now - prevTime) / 1000, 0.05);
    prevTime = now;

    // 创建帧管理器（延迟快照）
    const { frame, flush } = createFrameManager(gamePool);

    // 更新阶段：所有更新系统按序执行（可 emits 发射事件）
    for (const update of updates) {
      update(frame, delta, emits);
    }

    // 事件阶段：循环分发直到队列空（链式事件同帧完成）
    while (eventQueue.length > 0) {
      const batch = eventQueue.splice(0);
      for (const eventSystem of eventSystems) {
        eventSystem(frame, batch, emits);
      }
    }

    // 帧末提交所有脏数据
    flush();

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

  // ─── useGame: 组件注册实体 ──────────────────────────
  const useGame = (
    ctx: Context,
    ...registers: Array<(id: EntityId, ctx: Context) => Partial<T>>
  ): Signal<T> => {
    const { use, onMount, onUnmount } = ctx;
    const id = Symbol();

    // 1. 合并各系统数据切片
    // 框架契约：注册的系统切片合并后构成完整实体；
    // 系统 update 消费的字段（如碰撞的 w/h）必须由注册的某系统切片提供
    const merged = {} as T;
    for (const register of registers) {
      Object.assign(merged, register(id, ctx));
    }

    // 2. 创建信号
    const signal = use<T>(merged);

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
    useGame,
    emits,
    // 销毁：停止帧循环（组件卸载、游戏结束等场景）
    dispose: () => cancelAnimationFrame(rafId),
  };
}
