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

import { createPool, type EntityId, type Enter, type FrameManager } from "engine";

import { cellAt, type Cell } from "../../world";
import type { Random } from "../../world/random";
import type { ActorEntity, Mood, Role } from "../types";
import { ACTOR_SIZE } from "./locomotion";
import type { NavigationService } from "./navigation";
import {
  createStates,
  type ActorState,
  type NpcRole,
  type RoleStateSet,
  type StateContext,
} from "./states";

/**
 * 行为系统字段需求。
 *
 * 包含位置（状态上下文要算当前格）与 `dead`（死者不入状态机）。
 */
export type Behaving = Pick<
  ActorEntity,
  | "mood"
  | "moodLeft"
  | "path"
  | "goal"
  | "idleLeft"
  | "followTime"
  | "post"
  | "witnessed"
  | "fleeFrom"
  | "dead"
  | "x"
  | "y"
  | "role"
>;

export type BehaviourSystem = {
  enter: Enter<Behaving>;
  /**
   * 初值（D2 方案 B）：行为字段。
   *
   * 必须收 `role`：**初值按 NPC 类型不同**（客人从 `wander` 开始、保镖从
   * `patrol` 开始），而这一点只有系统知道（状态集在它的闭包里）。
   * `moodLeft` 需要掷定时长，同理。
   */
  spawn: (props: {
    role: Role;
    /** 巡逻岗位（仅保镖）；客人省略 */
    post?: Cell | null;
  }) => Pick<
    ActorEntity,
    "mood" | "moodLeft" | "path" | "goal" | "idleLeft" | "followTime" | "post"
  >;
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
  const [pool, enter] = createPool<Behaving>();
  const states = createStates(random);

  const rollDuration = (state: ActorState): number => {
    const { min, max } = state.duration;
    return min + random() * (max - min);
  };

  /** 该角色的状态集（玩家不入本池，但类型上仍需兜底） */
  const setOf = (role: Role): RoleStateSet =>
    role === "player" ? states.guest : states[role as NpcRole];

  /** 该角色的默认状态 */
  const entryOf = (role: Role): Mood => setOf(role).entry;

  /** 取某角色的某个状态；不存在时返回 undefined（由调用方兜底） */
  const stateOf = (role: Role, mood: Mood): ActorState | undefined => setOf(role).states[mood];

  // 移动相关字段（path / goal / idleLeft / followTime）由本系统初始化：
  // navigation 现在是**服务**而非系统，它不再有 `enter`。谁驱动移动，
  // 谁就负责给出这些字段的初值——否则状态机会读到 `undefined`。
  //
  // **初值按角色不同**：`mood` 取该角色的默认状态，`post` 是保镖的岗位
  // （由调用方传入；客人传 null）。
  const spawn = (props: { role: Role; post?: Cell | null }) => {
    const entry = entryOf(props.role);
    const state = stateOf(props.role, entry);
    return {
      mood: entry,
      moodLeft: state ? rollDuration(state) : 0,
      path: [],
      goal: null,
      idleLeft: 0,
      followTime: 0,
      post: props.post ?? null,
    };
  };

  /**
   * 构造状态上下文。
   *
   * 每帧构造一次：`self` 是活对象引用（状态读它即读当前值），
   * `patch` 是写回通道（改的就是同一对象）。
   *
   * 与旧引擎的区别：旧版 `self` 是快照，`patch` 后不回读；现在两者是同一
   * 对象。已核对三个状态（wander / linger / panic）均无「写完某字段又回读」
   * 的用法，故行为一致。
   *
   * `transition` 在一次 `update` 内被多次调用时，最后一次生效
   * （因为它们按顺序执行，后一次覆盖前一次写的 `mood` / `moodLeft`）。
   */
  const makeContext = (
    frame: FrameManager<ActorEntity>,
    id: EntityId,
    self: Readonly<ActorEntity>,
  ): StateContext => {
    const cell = cellAt(self.x + ACTOR_SIZE / 2, self.y + ACTOR_SIZE / 2) ?? {
      col: 0,
      row: 0,
    };

    const ctx: StateContext = {
      frame,
      id,
      self,
      cell,
      patch: (fn) => {
        const target = frame(id);
        if (target) fn(target);
      },
      transition: (next) => {
        // 切换：写 mood、掷定新时长、跑目标状态的 enter。
        // **按本实体的角色查表**——不同 NPC 拥有的状态不同，
        // 目标状态可能不存在（如让保镖进入 `wander`）。
        const target = frame(id);
        if (!target) return;
        const nextState = stateOf(target.role, next);
        if (!nextState) return; // 该角色没有这个状态：忽略切换
        target.mood = next;
        target.moodLeft = rollDuration(nextState);
        nextState.enter?.({ ...ctx, self: target as Readonly<ActorEntity> });
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
    const state = stateOf(self.role, self.mood);
    state?.update(ctx, delta);
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

    // witnessed 是记忆，永久保留——它属于 alarm 的语义
    self.witnessed = true;
    self.fleeFrom = threat;

    // 走正规切换路径：写 mood、掷定时长、跑 panic.enter()
    makeContext(frame, id, self).transition("panic");
  };

  return { enter, spawn, update, panic };
}
