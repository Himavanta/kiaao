// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏实体结构：各系统切片的并集
//
// 每个字段标注【写者】——帧循环里谁写它必须唯一且明确，
// 其余系统只读。写入冲突是 ECS 最常见的数据竞争来源。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 朝向：4 向（等于最后一次移动方向） */
export type Facing = "north" | "east" | "south" | "west";

export type ActorEntity = {
  /** 【scaffold 写】世界坐标位置（px，左上角原点） */
  x: number;
  y: number;
  /** 【scaffold 写】移动速度（px/s），0 表示静止 */
  speed: number;
  /** 【scaffold 写】朝向 */
  facing: Facing;
};
