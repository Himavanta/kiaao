// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 状态对象的类型（被状态的定义者与驱动器共用）
//
// 抽出来是为了打开一个循环：`states.ts` 原本同时承载「类型」与
// 「具体状态」，于是想把某个 NPC 的状态收进自己的文件时，会形成
// `states → 该 NPC → states` 的环。类型先落在这里，双方都依赖它。
//
// 只有类型与契约，没有具体行为——具体状态由各 NPC 自己的文件提供
// （`npcs/` 目录），共用的状态（`panic`）由状态表组合。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { EntityId, FrameManager } from "engine";

import type { Cell } from "../../world";
import type { ActorEntity, Mood } from "../types";
import type { NavigationService } from "./navigation";

/**
 * 状态可用的服务。注入而非直接 import，避免状态依赖具体系统。
 *
 * **直接用 `NavigationService` 的类型**，不手抄一份成员列表。原先手抄过
 * 一次，加了 `setGoal` / `clearRoute` / `hasArrived` 之后就漏了——重复
 * 声明的类型不会自动跟随（与 §7.5 记的 `Role`/`SpawnKind` 同一个病）。
 */
export type ActorServices = NavigationService;

/** 当前帧的运行时上下文，由状态机每帧构造一次 */
export type StateContext = {
  readonly frame: FrameManager<ActorEntity>;
  readonly id: EntityId;
  /**
   * 实体数据的**活对象引用**（不是快照）。
   *
   * 与旧引擎的区别：旧版 `self` 是写时拷贝的快照，`patch` 后不回读；
   * 现在 `self` 与 `patch` 作用于同一对象，写入立即可见。
   *
   * **约定不变**：状态若需在同一个 `update` 里用到「旧值」，应就近存进
   * 局部变量（`const left = self.moodLeft - delta` 就是这种写法），
   * 而不是写完再回读。
   */
  readonly self: Readonly<ActorEntity>;
  /** 当前所在格 */
  readonly cell: Cell;
  /**
   * 本实体**所属角色的默认状态**（`RoleStateSet.entry`）。
   *
   * 由状态机每帧填入。存在的理由：`panic` 这类**共享状态**消退后要回到
   * 「本角色自己的默认态」（客人→闲游、保镖→回岗），而它不能写死
   * `transition("wander")`——保镖没有 `wander`，那样会静默卡死。
   * 从上下文取，避免共享状态反过来依赖「各角色的状态集」这张表。
   */
  readonly entryMood: Mood;
  /** 写回实体 */
  patch: (fn: (e: ActorEntity) => void) => void;
  /** 切换到另一个状态（写 mood、掷定新时长、执行目标状态的 enter） */
  transition: (next: Mood) => void;
  /** 服务：寻路与移动（由 navigation 提供） */
  services: ActorServices;
};

export type ActorState = {
  readonly name: Mood;
  /**
   * 状态持续时长范围（秒）。
   *
   * **可选**：只有「会自行到期切换」的状态才需要它。`patrol` 是长期行为
   * （守岗，不自行换状态），给它一个 `{min:8,max:8}` 的固定区间只会让
   * 每帧多一次写实体——S3 收口时发现的死重量。
   */
  readonly duration?: { min: number; max: number };
  /** 进入状态时的初始化 */
  enter?: (ctx: StateContext) => void;
  /** 每帧推进 */
  update: (ctx: StateContext, delta: number) => void;
};

/**
 * 一种 NPC 拥有的状态集。
 *
 * 用 `Partial` 而非完整 `Record<Mood, …>`：每种 NPC **只拥有一部分状态**
 * （这正是 S2 的目的）。查表失败要靠 `behaviour` 兜底，不能假定必有。
 */
export type RoleStateSet = {
  /**
   * 该角色的**默认状态**（初值 + 恐慌消退后的归宿）。
   *
   * 显式声明而非「取第一个键」：后者依赖对象字面量的书写顺序，
   * 重构时极易静默改变行为。`panic` 是共享状态，它不能写死
   * `transition("wander")`——保镖没有 `wander`，得回到自己的岗位。
   */
  entry: Mood;
  states: Partial<Record<Mood, ActorState>>;
};
