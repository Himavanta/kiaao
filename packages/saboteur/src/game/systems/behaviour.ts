// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 行为系统：驱动状态对象
//
// 本模块只做三件事，不含任何具体行为：
//   1. 每帧构造状态上下文（活对象 + 当前格 + 服务 + 切换通道）
//   2. 把控制权交给当前状态对象
//   3. 执行状态请求的切换（写 mood、掷定时长、跑目标状态的 enter）
//
// 具体行为（闲游 / 驻足 / 巡逻 / 恐慌）全在各 NPC 的户口本里
// （`npcs/*.ts` 的状态对象）。这样「恐慌」不再散落在
// alarm / navigation / behaviour 三处。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createPool, type EntityId, type Enter, type FrameManager } from "engine";

import { cellAt, type Cell } from "../../world";
import type { Random } from "../../world/random";
import {
  isNpc,
  type ActorEntity,
  type Mood,
  type NpcRole,
  type Role,
  type ThreatKind,
} from "../types";
import { ACTOR_SIZE } from "./locomotion";
import type { NavigationService } from "./navigation";
import type { ActorState, RoleStateSet, StateContext } from "./state-types";

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
  | "investigateTarget"
  | "visibleIds"
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
    "mood" | "moodLeft" | "path" | "goal" | "idleLeft" | "followTime" | "investigateTarget" | "post"
  >;
  update: (frame: FrameManager<ActorEntity>, delta: number) => void;
  /**
   * **目击异常时的反应**：按角色自己的 `reaction` 分派到某个状态。
   *
   * `alarm` 只负责察觉（「看见了什么」），本方法负责「看见了怎么办」——
   * 那是角色的个性（客人逃、保镖查看）。两者分开：察觉是机制，反应是性格。
   */
  react: (witness: Witness) => void;
};

/**
 * 一次目击事件：**谁**看见了**什么**。
 *
 * 收一个对象而非四个散参数——参数超过三个就该收成对象（项目约定）。
 * 它也把「被看见的异常」的三件事（id / 位置 / 类别）归为一组：三者
 * 描述的是同一个东西，拆开传容易对不上（如 id 与坐标不是同一个实体）。
 */
export type Witness = {
  frame: FrameManager<ActorEntity>;
  /** 目击者 */
  observer: EntityId;
  /** 被看见的异常源 */
  threat: {
    id: EntityId;
    /** 异常源当时所在的格 */
    cell: Cell;
    kind: ThreatKind;
  };
};

export function createBehaviourSystem(options: {
  random: Random;
  navigation: NavigationService;
  /**
   * 各 NPC 类型的状态集。
   *
   * **注入而非自己组装**：本系统是机制（「驱动某角色拥有的状态集」），
   * 它不该知道哪只 NPC 有哪个状态——那是 `npcs/` 户口本的知识。
   *
   * 类型是**完备**的 `Record<NpcRole, …>`：能进本系统的必然有状态机
   * （玩家不入池，「无状态机」在 `npcs/` 层就被排除了）。
   */
  states: Record<NpcRole, RoleStateSet>;
}): BehaviourSystem {
  const { random, navigation, states } = options;
  const [pool, enter] = createPool<Behaving>();

  /**
   * 掷定状态时长。无 `duration` 的状态（长期行为，如 `patrol`）返回 0——
   * 它们不用这个值，赋 0 不会误导（结合「该状态不读 moodLeft」看）。
   */
  const rollDuration = (state: ActorState): number => {
    if (!state.duration) return 0;
    const { min, max } = state.duration;
    return min + random() * (max - min);
  };

  /** 该角色的状态集（玩家不入本池，但类型上仍需兜底） */
  const setOf = (role: Role): RoleStateSet => (isNpc(role) ? states[role] : states.guest)!;

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
      investigateTarget: null,
      post: props.post ?? null,
    };
  };

  /**
   * 构造状态上下文。
   *
   * 每帧构造一次。`self` 是活对象引用，状态**直接读写它**——
   * 不再有 `patch` 写回通道（那是写时拷贝时代的遗留，见 `state-types.ts`）。
   *
   * `transition` 在一次 `update` 内被多次调用时，最后一次生效
   * （因为它们按顺序执行，后一次覆盖前一次写的 `mood` / `moodLeft`）。
   */
  const makeContext = (self: ActorEntity): StateContext => {
    const cell = cellAt(self.x + ACTOR_SIZE / 2, self.y + ACTOR_SIZE / 2) ?? {
      col: 0,
      row: 0,
    };

    const ctx: StateContext = {
      self,
      cell,
      // 本角色的默认态——`panic` 消退后据此回家（不能写死 wander）
      entryMood: entryOf(self.role),
      transition: (next) => {
        // 切换：写 mood、掷定新时长、跑目标状态的 enter。
        // **按本实体的角色查表**——不同 NPC 拥有的状态不同。
        //
        // 目标状态在该角色集合里不存在时**静默忽略**（而非报错）。理由：
        // - 拼错由 TS 挡住（入参是 `Mood` 联合），不靠运行时检查
        // - 剩下的可能是「跨角色的状态」（如让保镖进 `wander`）——
        //   它确实无法执行，但也确实不该崩掉整帧
        //
        // 代价：**共享状态里不能写死角色专属的目标**。`panic` 的归宿
        // 用 `entryMoodOf(role)` 而非 `transition("wander")` 就是这个原因。
        // 那类 bug 不报错、只表现为卡死，靠测试锁（见 wander.test.ts）。
        const nextState = stateOf(self.role, next);
        if (!nextState) return;
        self.mood = next;
        self.moodLeft = rollDuration(nextState);
        nextState.enter?.(ctx);
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

    const state = stateOf(self.role, self.mood);
    state?.update(makeContext(self), delta);
  };

  const update = (frame: FrameManager<ActorEntity>, delta: number) => {
    for (const id of pool) step(frame, id, delta);
  };

  /**
   * 外部（alarm）请求「让某实体对他看见的东西作出反应」。
   *
   * 先按本角色的 `reaction` 决定进哪个状态，再走正规的 `transition` 路径
   * （写 mood、掷定时长、跑 enter）。
   *
   * **两类反应的输入不同**：
   * - `panic`：记下 `fleeFrom`（「我在哪看见的威胁」），逃跑时远离它
   * - `investigate`：记下 `investigateTarget`（「我要查谁」），位置由
   *   实体自己的记忆给出——**不递实时坐标**，否则就是全知追踪
   *
   * 已经死了、已经在做同类反应的实体直接忽略（后者避免一次目击把刚进入
   * 的查看/恐慌重置，反复清路线）。
   */
  const react = ({ frame, observer, threat }: Witness) => {
    const self = frame(observer);
    if (!self || self.dead) return;

    const next = setOf(self.role).reaction?.(threat.kind);
    if (!next) return;
    // 已在 reacting：不重复触发（否则每次感知都会重新清路线/掷时长）
    if (self.mood === next) return;

    if (next === "panic") {
      self.fleeFrom = threat.cell;
    } else {
      // 查看：记住「要查的是谁」，位置由本实体记忆提供
      self.investigateTarget = threat.id;
    }

    // 走正规切换路径：写 mood、掷定时长、跑 enter
    makeContext(self).transition(next);
  };

  return { enter, spawn, update, react };
}
