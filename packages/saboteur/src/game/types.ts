// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏实体结构：各系统切片的并集
//
// 每个字段标注【写者】——帧循环里谁写它必须唯一且明确，
// 其余系统只读。写入冲突是 ECS 最常见的数据竞争来源。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Cell } from "../world";

/** 朝向：4 向，等于最后一次移动方向 */
export type Facing = "north" | "east" | "south" | "west";

/** 朝向 → 单位向量（感知与交互读面朝格时使用） */
export const FACING_VECTORS: Record<Facing, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

/** 方向向量 → 朝向；零向量时返回 undefined（无位移不改变朝向） */
export function facingFromVector(dx: number, dy: number): Facing | undefined {
  if (dx === 0 && dy === 0) return undefined;
  if (dx > 0) return "east";
  if (dx < 0) return "west";
  return dy > 0 ? "south" : "north";
}

export type ActorEntity = {
  // ── locomotion 切片 ──
  /** 【locomotion 写】世界坐标位置（px，角色左上角） */
  x: number;
  y: number;
  /** 【locomotion 写】基础移动速度（px/s） */
  speed: number;
  /** 【locomotion 写】潜行时的速度系数（0~1） */
  sneakFactor: number;
  /** 【locomotion 写】当前是否潜行中 */
  sneaking: boolean;

  // ── navigation 切片 ──
  /** 【navigation 写】待走的格序列（不含当前格）；空表示已到达或未规划 */
  path: Cell[];
  /** 【navigation 写】当前目标格；null 表示无目的（停留中） */
  goal: Cell | null;
  /** 【navigation 写】剩余停留时间（秒）；> 0 时不规划新目标 */
  idleLeft: number;
  /** 【navigation 写】距上次路径推进的时长（秒）；超时即放弃，防卡死 */
  followTime: number;

  // ── behaviour 切片 ──
  /** 【behaviour 写】当前行为与计时。M6 将扩展为恐慌 / 逃离 */
  mood: Mood;
  /** 【behaviour 写】当前行为的剩余时长（秒） */
  moodLeft: number;

  // ── 跨系统共享字段 ──
  /**
   * 【locomotion 写，其余系统只读】最后移动方向。
   * 刻意不归入任何系统切片——交互与感知都读它（规划文档 5.2）。
   */
  facing: Facing;

  // ── 身份切片 ──
  /** 【身份，注册时定】角色类型，渲染与规则按此分支 */
  role: Role;
};

/** 角色类型：玩家 / 客人（NPC）/ 后续的目标人物与警察 */
export type Role = "player" | "guest";

/**
 * NPC 行为。M3 只有闲游与驻足；M5/M6 会加入饮酒、目击、恐慌、逃离。
 * 行为的**效果**体现在 navigation 的目标选择上（navigation 读 mood 决定去哪）。
 */
export type Mood = "wander" | "linger";
