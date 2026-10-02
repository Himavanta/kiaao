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
// 实体登记（数据归组件，系统只声明参与）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 登记函数的类型：只做「把实体加进自己的池」，不再提供数据。
 *
 * `state` 参数是那个实体的完整状态（只读使用——`enter` 不应改它，数据由
 * 组件写全）。系统可从它读注册时需要的字段（例如 `moving` 决定进哪个池）。
 *
 * `__need` 是**幻影字段**（只存在于类型层，运行时不存在）：它携带
 * 「本系统要求实体有哪些字段」的信息，供 `define` 推导出调用方的必填项。
 * 好处：漏写字段会在 `define(...)(state)` 处当场报错——而旧的切片合并
 * （`Object.assign`）是运行时拼接，没有这个检查。
 */
export type Enter<N> = ((id: EntityId, ctx: Context, state: N) => void) & {
  readonly __need?: (state: N) => void;
};

/** 从 `Enter` 上取出它声明的字段需求 */
type NeedOf<E> = E extends Enter<infer N> ? N : never;

/**
 * 联合转交集（Union → Intersection 的标准写法）。
 * 用途：把「各系统分别要的字段」合并成一个完整的必填项集合。
 */
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

/** 'define(...)' 返回的登记器：接收完整 state，返回**携带该 state 类型**的渲染信号 */
export type Definer<Es extends readonly Enter<any>[]> = <
  const S extends UnionToIntersection<NeedOf<Es[number]>> & Record<string, unknown>,
>(
  state: S,
) => EntitySignal<S>;

/**
 * 创建实体：把 state 登记到各系统，并建立渲染信号。
 *
 * 与旧 `useEntity` 的差别：
 * - **数据不再由系统提供**——state 由组件写全，这里只负责登记与信号
 * - `...enters` 是**函数本身**（不再调用，不再传参）
 *
 * 类型推导：`const Es` 保住字面量类型（`left: "bounce"` 不被宽化），
 * `& Record<string, unknown>` 放宽多余字段（实体可以有系统不认识的私有字段）。
 */
export function createDefine<T extends Record<string, any>>(options: {
  register: (ctx: Context, id: EntityId, entry: PoolEntry<T>) => void;
}) {
  return <const Es extends readonly Enter<any>[]>(ctx: Context, ...enters: Es): Definer<Es> => {
    const id = Symbol();

    return <const S extends UnionToIntersection<NeedOf<Es[number]>> & Record<string, unknown>>(
      state: S,
    ): EntitySignal<S> => {
      const { use } = ctx;

      // 1. 各系统登记：只往自己的池里放 id，不再返回数据
      for (const enter of enters) {
        enter(id, ctx, state);
      }

      // 2. 渲染信号：必须持有 state 的**浅拷贝**（新引用）。
      //    若直接把 state 交给信号，原地修改就不会改变引用，按引用比较的
      //    传播机制不会触发——视图永远不更新。
      const signal = use({ ...state }) as EntitySignal<S>;
      signal.id = id;

      // 3. 存入数据池：引擎只见 { state, flush }，不见 signal
      //    flush 把 state 浅拷贝给信号。注意：**方法（函数）也会被拷进去**，
      //    这是有意接受的——渲染层只读需要的字段，多出的函数无害。
      options.register(ctx, id, {
        state: state as unknown as T,
        flush: () => signal({ ...state }),
      });

      return signal;
    };
  };
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
 * - define(ctx, ...enters)(state)：组件定义实体（state 写全，enters 只进池）
 * - dispose()：停止帧循环（组件卸载、游戏结束等场景）
 */
export function createGame<T extends Record<string, any> = Record<string, any>>(
  updates: ReadonlyArray<Update<any>>,
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

  // ─── define: 组件定义实体 ─────────────────────────
  // 数据归组件（state 由组件写全），系统只声明参与（enter 只进池）
  const define = createDefine<T>({
    register: (ctx, id, entry) => {
      ctx.onMount(() => {
        gamePool.set(id, entry);
      });
      ctx.onUnmount(() => {
        gamePool.delete(id);
      });
    },
  });

  return {
    define,
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
