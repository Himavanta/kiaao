// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 测试台：实体构造、帧管理器替身、注册
//
// 新引擎的 `frame(id)` 返回**活对象**（不再是写时拷贝的缓存副本），
// 测试台因此比旧版简单得多：帧替身直接把 state 交出去。
//
// 「读实体」在测试里用一个**读取器函数**（`entity`）而不是真信号：
// 活对象改了，读取器立刻反映；信号只在帧末 flush 时同步，测试不跑
// 引擎帧循环，读它会拿到旧值。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createGame, type Enter, type FrameManager } from "engine";
import { use, type Context } from "kiaao";
import { vi } from "vite-plus/test";

import type { ActorEntity } from "../types";

/** 字段齐全的实体（默认值覆盖 locomotion / behaviour / perception / alarm / interaction 的需求） */
export function makeActorState(overrides: Partial<ActorEntity> = {}): ActorEntity {
  const base: ActorEntity = {
    // locomotion
    x: 0,
    y: 0,
    speed: 100,
    sneakFactor: 0.45,
    sneaking: false,
    facing: "south",
    // behaviour
    mood: "wander",
    moodLeft: 10,
    path: [],
    goal: null,
    idleLeft: 0,
    followTime: 0,
    investigateTarget: null,
    // perception
    sightRange: 200,
    sightArc: Math.PI / 6,
    visibleIds: [],
    // 巡逻岗位（保镖用；客人/玩家为 null）
    post: null,
    // alarm
    witnessed: false,
    fleeFrom: null,
    // interaction
    held: null,
    dead: false,
    poisonLeft: null,
    role: "guest",
  };
  return { ...base, ...overrides };
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

/** 实体读取器：无参读活对象，带参合并写入（方便测试布置初始状态） */
export type EntityReader = {
  (): ActorEntity;
  (patch: Partial<ActorEntity>): void;
};

/**
 * 装一个实体：用真实 `define` 走注册（各系统的 `enter` 会挂生命周期钩子），
 * 再手动触发挂载回调使其入池。
 */
export function mountActor(options: { enters: Array<Enter<any>>; state: ActorEntity }) {
  const { enters } = options;
  const game = createGame([], { autostart: false });
  const { ctx, mounts, unmounts } = createTestContext();

  const signal = game.define(ctx, ...enters)(options.state);
  mounts.forEach((fn) => fn());

  const id = signal.id;
  const state = options.state;

  const entity = ((patch?: Partial<ActorEntity>) => {
    if (patch) {
      Object.assign(state, patch);
      return;
    }
    return state;
  }) as EntityReader;

  /** 帧管理器替身：活对象直通 */
  const frame: FrameManager<ActorEntity> = (target) => (target === id ? state : undefined);

  return {
    game,
    id,
    state,
    entity,
    frame,
    /** 卸载并触发 unMount 回调（验池清理用） */
    unmount: () => unmounts.forEach((fn) => fn()),
  };
}

/**
 * 写入计数器：把 state 包一层代理，统计属性赋值次数。
 * 用于验证「无变化时不写实体」这类零写入契约。
 *
 * 返回的 `frame` 把代理当作实体交出去——被测系统拿到的是代理，
 * 因此它的每次属性赋值都会被计入。
 */
export function countWrites(state: ActorEntity, id: symbol) {
  let writes = 0;
  const proxy = new Proxy(state, {
    set(target, key, value) {
      writes += 1;
      return Reflect.set(target, key, value);
    },
  });
  const frame: FrameManager<ActorEntity> = (target) =>
    target === id ? (proxy as ActorEntity) : undefined;
  return { frame, writes: () => writes };
}

/**
 * 帧驱动器：接管 requestAnimationFrame / performance.now，手动推进帧。
 *
 * 抽出前的状态：七个测试文件各写一份 `createDriver`，其中三份与
 * `wander.test.ts` 的**逐字相同**（约 180 行重复）。
 *
 * 分工：本函数只提供**共同的驱动能力**（`tick` / `tickTimes` / `restore`
 * / `pending`）。各文件自己的领域方法（如 `stuck` 的 `run`、`alarm` 的
 * `perceive`）应包在外面，不要塞进来——它们只服务于单个用例文件。
 *
 * **必须显式调 `restore()`**（通常在 `afterEach`）：它负责恢复被 mock 的
 * 全局函数。漏掉会污染后续用例——`random` 是模块级单例，帧数差异会改变
 * 随机序列（S3 那次脆弱断言就是这样暴露的）。
 */
export function createDriver(stepMs = 16) {
  const queue = new Map<number, (t: number) => void>();
  let nextId = 1;
  let clock = 0;

  const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  const caf = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id: any) => {
    queue.delete(id);
  });
  const now = vi.spyOn(performance, "now").mockImplementation(() => clock);

  return {
    /** 推进一帧：时钟前进 stepMs，执行当前已排队的全部回调 */
    tick() {
      clock += stepMs;
      const pending = [...queue.values()];
      queue.clear();
      for (const cb of pending) cb(clock);
    },
    /** 推进 n 帧 */
    tickTimes(n: number) {
      for (let i = 0; i < n; i += 1) this.tick();
    },
    /** 待排队的回调数（验 stop 是否真的停住）——属性而非方法 */
    get pending() {
      return queue.size;
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
      now.mockRestore();
    },
  };
}
