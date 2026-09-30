// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 行为系统：驱动状态对象
//
// 本模块只做三件事，不含任何具体行为：
//   1. 每帧构造状态上下文（实体快照 + 服务 + 写回通道）
//   2. 把控制权交给当前状态对象
//   3. 执行状态请求的切换（写 mood、掷定时长、跑目标状态的 enter）
//
// 具体行为（闲游 / 驻足 / 恐慌）全在 `states.ts` 的三个对象里。
// 这样「恐慌」不再散落在 alarm / navigation / behaviour 三处。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context } from "kiaao";

import type { EntityId, FrameManager } from "../../engine/types";
import { cellAt, type Cell } from "../../world";
import type { Random } from "../../world/random";
import type { ActorEntity, Mood } from "../types";
import { ACTOR_SIZE } from "./locomotion";
import type { NavigationService } from "./navigation";
import { createStates, type ActorState, type StateContext } from "./states";

export type BehaviourSystem = {
  enter: () => (id: EntityId, ctx: Context) => Partial<ActorEntity>;
  update: (frame: FrameManager<ActorEntity>, delta: number) => void;
  /**
   * 让某实体进入恐慌态。
   *
   * **这是状态之间唯一的对外入口**：其他系统（如 `alarm`）只报告
   * 「他看见了」这一事实，由本系统执行状态切换——包括跑 `panic.enter()`。
   * 这样 `mood` / `path` / `goal` / `idleLeft` / `followTime` 的写入者
   * 始终只有状态机一处，外部不必知道这些字段的存在。
   */
  panic: (frame: FrameManager<ActorEntity>, id: EntityId, threat: Cell) => void;
};

export function createBehaviourSystem(options: {
  random: Random;
  navigation: NavigationService;
}): BehaviourSystem {
  const { random, navigation } = options;
  const pool = new Set<EntityId>();
  const states = createStates(random);

  const rollDuration = (state: ActorState): number => {
    const { min, max } = state.duration;
    return min + random() * (max - min);
  };

  const enter =
    () =>
    (id: EntityId, ctx: Context): Partial<ActorEntity> => {
      ctx.onMount(() => {
        pool.add(id);
      });
      ctx.onUnmount(() => {
        pool.delete(id);
      });

      // 移动相关字段（path / goal / idleLeft / followTime）由本系统初始化：
      // navigation 现在是**服务**而非系统，它不再有 `enter`。谁驱动移动，
      // 谁就负责给出这些字段的初值——否则状态机会读到 `undefined`。
      return {
        mood: "wander" as Mood,
        moodLeft: rollDuration(states.wander),
        path: [],
        goal: null,
        idleLeft: 0,
        followTime: 0,
      } as Partial<ActorEntity>;
    };

  /**
   * 构造状态上下文。
   *
   * 每帧构造一次：`self` 是只读快照（状态读它），`patch` 是写回通道
   * （状态改它）。快照在 `patch` 后不会自动更新——状态若需读自己刚写的
   * 值，应当写进局部变量而不是回读。
   *
   * `transition` 捕获了 `current` 变量，因此一个状态在一次 `update` 内
   * 调用多次 `transition` 时，最后一次生效。
   */
  const makeContext = (
    frame: FrameManager<ActorEntity>,
    id: EntityId,
    self: Readonly<ActorEntity>,
  ): StateContext => {
    const cell = cellAt(self.x + ACTOR_SIZE / 2, self.y + ACTOR_SIZE / 2) ?? { col: 0, row: 0 };

    const ctx: StateContext = {
      frame,
      id,
      self,
      cell,
      patch: (fn) => {
        frame(id, fn);
      },
      transition: (next) => {
        // 切换：写 mood、掷定新时长、跑目标状态的 enter
        const nextState = states[next];
        frame(id, (e) => {
          e.mood = next;
          e.moodLeft = rollDuration(nextState);
        });
        nextState.enter?.({ ...ctx, self: frame(id) as Readonly<ActorEntity> });
      },
      services: navigation,
    };

    return ctx;
  };

  /** 推进一个实体一帧 */
  const step = (frame: FrameManager<ActorEntity>, id: EntityId, delta: number) => {
    const self = frame(id);
    if (!self) return;

    // 死者不再有行为：尸体不入状态机
    if (self.dead) return;

    const ctx = makeContext(frame, id, self);
    states[self.mood].update(ctx, delta);
  };

  const update = (frame: FrameManager<ActorEntity>, delta: number) => {
    for (const id of pool) step(frame, id, delta);
  };

  /**
   * 外部（alarm）请求进入恐慌态。
   *
   * 只置 `witnessed` 与 `fleeFrom`，其余交给状态机：`moodLeft` 由
   * `rollDuration` 掷定、`path` / `goal` / `idleLeft` / `followTime`
   * 由 `panic.enter()` 清理。
   */
  const panic = (frame: FrameManager<ActorEntity>, id: EntityId, threat: Cell) => {
    const self = frame(id);
    if (!self || self.dead || self.mood === "panic") return;

    // `PANIC_DURATION` 已移入 `states.ts` 的 `panic.duration`——
    // 时长归状态本身所有，外部不再需要知道它。

    frame(id, (e) => {
      // witnessed 是记忆，永久保留——它属于 alarm 的语义
      e.witnessed = true;
      e.fleeFrom = threat;
    });

    // 走正规切换路径：写 mood、掷定时长、跑 panic.enter()
    makeContext(frame, id, frame(id) as Readonly<ActorEntity>).transition("panic");
  };

  return { enter, update, panic };
}
