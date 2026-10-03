// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏实体结构：全部实体的字段清单
//
// 字段不来自任何系统——它由视图的 `state` 字面量写全（各系统的
// `spawn()` 产出各自负责的那部分）。本文件的作用有两个：
//
// 1. **注册表与调试层的共享类型**（`playerEntity` / `listActors()`）
// 2. **字段与写者的文档**——每个字段标注【写者】，帧循环里谁写它必须
//    唯一且明确，其余系统只读。写入冲突是 ECS 最常见的数据竞争来源。
//
// 各系统**实际会读到哪些字段**不在这里声明，而在各自的
// `Enter<Pick<ActorEntity, ...>>`（如 `locomotion.ts` 的 `Movable`）——
// 那个交集检查会在漏写字段时报错。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { EntityId } from "engine";

import type { Cell, SpawnKind } from "../world";

/** 朝向：4 向，等于最后一次移动方向 */
export type Facing = "north" | "east" | "south" | "west";

/**
 * 朝向 → 视线角度（弧度）。
 *
 * 屏幕坐标系（y 轴向下）：0 为正东，顺时针为正。`Math.atan2(dy, dx)`
 * 的约定与此一致，因此视锥判定可以直接相减比较。
 */
export const FACING_ANGLES: Record<Facing, number> = {
  north: -Math.PI / 2,
  east: 0,
  south: Math.PI / 2,
  west: Math.PI,
};

/** 方向向量 → 朝向；零向量时返回 undefined（无位移不改变朝向） */
export function facingFromVector(dx: number, dy: number): Facing | undefined {
  if (dx === 0 && dy === 0) return undefined;
  if (dx > 0) return "east";
  if (dx < 0) return "west";
  return dy > 0 ? "south" : "north";
}

export type ActorEntity = {
  // ── 【locomotion 写】位置与速度 ──
  /** 【locomotion 写】世界坐标位置（px，角色左上角） */
  x: number;
  y: number;
  /** 【locomotion 写】基础移动速度（px/s） */
  speed: number;
  /** 【locomotion 写】潜行时的速度系数（0~1） */
  sneakFactor: number;
  /** 【locomotion 写】当前是否潜行中 */
  sneaking: boolean;

  // ── 【behaviour 写】行为与路径 ──
  /** 【navigation 写】待走的格序列（不含当前格）；空表示已到达或未规划 */
  path: Cell[];
  /** 【navigation 写】当前目标格；null 表示无目的（停留中） */
  goal: Cell | null;
  /** 【navigation 写】剩余停留时间（秒）；> 0 时不规划新目标 */
  idleLeft: number;
  /** 【navigation 写】距上次路径推进的时长（秒）；超时即放弃，防卡死 */
  followTime: number;

  // ── 【perception 写】视锥与结果栅 ──
  /** 【perception 写】视距（px） */
  sightRange: number;
  /** 【perception 写】视锥半角（弧度） */
  sightArc: number;
  /** 【perception 写】当前能看见的实体 id 列表（每轮扫描后更新） */
  visibleIds: EntityId[];

  // ── 【behaviour 写】行为与路径 ──
  /** 【behaviour 写】当前行为与计时 */
  mood: Mood;
  /** 【behaviour 写】当前行为的剩余时长（秒） */
  moodLeft: number;
  /**
   * 【behaviour 写，注册时定】巡逻岗位（格）。
   *
   * 只有保镖用：`patrol` 状态在它附近挑目标。客人该字段为 `null`。
   * 它属于「参数轴」——同一个 `patrol` 状态，不同的岗位值。
   */
  post: Cell | null;

  // ── 【alarm 写】目击记忆与逃离参照 ──
  /** 【alarm 写】是否已目击到异常（尸体或恐慌者）；panic 一旦置位不再清除 */
  witnessed: boolean;
  /** 【alarm 写】恐慌时逃离的参照点（目击位置，世界坐标） */
  fleeFrom: Cell | null;

  // ── 跨系统共享字段 ──
  /**
   * 【locomotion 写，其余系统只读】最后移动方向。
   * 刻意不归入任何系统——交互与感知都读它（规划文档 5.2）。
   */
  facing: Facing;

  // ── 【interaction 写】持有、死亡与中毒 ──
  /** 【interaction 写】持有的道具；null 表示空手 */
  held: ItemKind | null;
  /**
   * 【interaction 写】是否已死（尸体）。
   * 死者不再参与导航 / 行为 / 感知（其池在 `onMount` 时按 role 判定），
   * 但保留实体以便「被发现」与渲染。
   */
  dead: boolean;
  /** 【interaction 写】中毒后的剩余存活时间（秒）；null 表示未中毒 */
  poisonLeft: number | null;

  // ── 【注册时定】身份 ──
  /** 【身份，注册时定】角色类型，渲染与规则按此分支 */
  role: Role;
};

/**
 * 角色类型。
 *
 * **直接取自 `world` 层的出生点类型**（`game` → `world` 是允许的单向依赖）。
 * 两边各写一份的做法（原来的 `Role` / `ItemKind`）靠注释约定同步，
 * 加一个类型要改两处、忘一处不报错——本文档 §7.5 记了这个病。
 */
export type Role = SpawnKind;

/**
 * 是否为 NPC（非玩家）。
 *
 * **不要写 `role === "guest"`**——那是把「不是玩家」与「是客人」混为一谈。
 * 只有两种角色时二者等价，加 `guard` 后立刻暴露：保镖既非玩家也不是客人。
 */
export function isNpc(role: Role): boolean {
  return role !== "player";
}

/**
 * 可携带 / 可拾取的道具类型。
 *
 * 与 `world/levels/types.ts` 的 `PropKind` 取值一致，但**不是同一个类型**：
 * `world/` 不依赖 `game/`（分层单向），两边各自声明，由组装层保证对应。
 */
export type ItemKind = "booze";

/**
 * NPC 行为。
 *
 * **每种 NPC 只拥有其中一部分**（S2）：客人 `{wander, linger, panic}`、
 * 保镖 `{patrol, panic}`。`mood` 是**数据不是类型**——它只在
 * `set.states[mood]` 这一处被消费（查表），故写成所有状态的并集，
 * 不用判别联合把 `ActorEntity` 拆碎（文档 Q2）。
 *
 * 行为不直接指挥移动，而是影响 navigation 挑目的地——这样 locomotion
 * 与意图来源都不知道「状态机」存在，行为切换只改一处。
 */
export type Mood = "wander" | "linger" | "panic" | "patrol";
