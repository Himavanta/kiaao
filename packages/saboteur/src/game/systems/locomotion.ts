// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 移动系统：位置积分 + 网格碰撞 + 朝向更新
//
// 数据来源是「意图」而非键盘：玩家意图来自输入信号，NPC 意图来自
// 路径跟随（M3）。系统只认意图对象，不关心它从哪来——这是玩家与
// NPC 共用同一套移动逻辑的关键。
//
// 碰撞解算在 world/collision.ts（纯几何、可单测）；本系统负责把
// 意图 + delta 换算为位移，并把结果写回实体。所有位移相关字段的
// 写者只有本系统，其它系统只读——保持「每个字段一个写者」的纪律。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createPool, type EntityId, type Enter, type FrameManager } from "engine";

import { moveRect, type Grid } from "../../world";
import { facingFromVector, isNpc, type ActorEntity, type Facing } from "../types";

/** 实体外观尺寸（正方形，略小于瓦片以留出视觉间隙） */
export const ACTOR_SIZE = 20;

/** 移动意图：方向（单位向量或零）+ 是否潜行 */
export type Intent = {
  dx: number;
  dy: number;
  sneaking: boolean;
};

/** 意图提供者：给定实体数据，返回本帧意图 */
export type IntentSource = (entity: Readonly<ActorEntity>) => Intent;

/** 静止意图 */
export const IDLE: Intent = { dx: 0, dy: 0, sneaking: false };

/**
 * 移动系统字段需求。
 *
 * 除位置与速度外还包括 `role`（按角色分派意图来源）与 `dead`（死者不动）——
 * `Need` 声明的是「本系统会读到什么」，不是「本系统写什么」。
 */
export type Movable = Pick<
  ActorEntity,
  "x" | "y" | "speed" | "sneakFactor" | "sneaking" | "facing" | "role" | "dead"
>;

/** 出生参数：位置与速度（由视图给出关卡相关的那部分） */
export type LocomotionSpawn = {
  /** 出生位置（像素，角色左上角） */
  x: number;
  y: number;
  /** 基础移动速度（px/s） */
  speed: number;
  /** 初始朝向 */
  facing: Facing;
};

/**
 * 驱动方式：实体每帧的意图从哪来。
 *
 * **与 NPC 类型无关**——只有两种：玩家读输入、NPC 读路径。
 * 这是 S3 收口的发现：原来按 `role` 注册意图来源，于是每加一种 NPC
 * 就要 `setIntent("guard", …)` 再加一行逐字相同的调用（线性增长的白白重复）。
 */
export type DriveMode = "player" | "npc";

export type LocomotionSystem = {
  enter: Enter<Movable>;
  /**
   * 初值（D2 方案 B）：本系统拥有的字段的出生值。
   *
   * 纯函数、不接触 `ctx`、不进池——与 `enter` 职责分离：
   * `enter` 只登记参与，`spawn` 只算初值。
   */
  spawn: (
    props: LocomotionSpawn,
  ) => Pick<ActorEntity, "x" | "y" | "speed" | "sneakFactor" | "sneaking" | "facing">;
  /** 帧逻辑：把移动池内实体按意图推进 */
  update: (frame: FrameManager<ActorEntity>, delta: number) => void;
  /** 按驱动方式注入意图来源（而非按角色——见 `DriveMode`） */
  setIntent: (mode: DriveMode, source: IntentSource) => void;
};

/** 默认意图：未注册来源的角色原地不动 */
const NO_INTENT: IntentSource = () => IDLE;

export function createLocomotionSystem(grid: Grid): LocomotionSystem {
  // 移动池：每帧按意图推进；静止实体不入池，零帧写入
  const [pool, enter] = createPool<Movable>();

  // 意图来源按**驱动方式**分派（不是按角色）；未注册的默认静止，
  // 保证系统可独立测试
  const sources = new Map<DriveMode, IntentSource>();
  const readIntent = (entity: Readonly<ActorEntity>): Intent =>
    (sources.get(isNpc(entity.role) ? "npc" : "player") ?? NO_INTENT)(entity);

  const spawn = (props: LocomotionSpawn) => ({
    x: props.x,
    y: props.y,
    speed: props.speed,
    sneakFactor: 0.45,
    sneaking: false,
    facing: props.facing,
  });

  // 单个实体：意图 → 位移 → 碰撞解算 → 写回
  const step = (frame: FrameManager<ActorEntity>, id: EntityId, delta: number) => {
    const entity = frame(id);
    if (!entity) return;

    // 死者不动：尸体留在原地
    if (entity.dead) return;

    const intent = readIntent(entity);
    const moving = intent.dx !== 0 || intent.dy !== 0;

    if (!moving) {
      // 静止：只同步潜行标记（Shift 可原地按住）
      if (entity.sneaking !== intent.sneaking) entity.sneaking = intent.sneaking;
      return;
    }

    const speed = entity.speed * (intent.sneaking ? entity.sneakFactor : 1);
    const rect = { x: entity.x, y: entity.y, w: ACTOR_SIZE, h: ACTOR_SIZE };
    const moved = moveRect(grid, rect, intent.dx * speed * delta, intent.dy * speed * delta);

    // 朝向仅在实际产生位移时更新——顶着墙走不该改变朝向
    const turned = facingFromVector(
      moved.x !== entity.x ? intent.dx : 0,
      moved.y !== entity.y ? intent.dy : 0,
    );

    entity.x = moved.x;
    entity.y = moved.y;
    entity.sneaking = intent.sneaking;
    if (turned) entity.facing = turned;
  };

  const update = (frame: FrameManager<ActorEntity>, delta: number) => {
    for (const id of pool) step(frame, id, delta);
  };

  return {
    enter,
    spawn,
    update,
    setIntent: (mode: DriveMode, source: IntentSource) => {
      sources.set(mode, source);
    },
  };
}
