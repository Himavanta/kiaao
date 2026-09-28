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

import type { Context } from "kiaao";

import type { EntityId, FrameManager } from "../../engine/types";
import { moveRect, type Grid } from "../../world";
import { facingFromVector, type ActorEntity, type Facing, type Role } from "../types";

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

export type LocomotionSystem = {
  enter: (props: {
    /** 出生位置（像素，角色左上角） */
    x: number;
    y: number;
    speed: number;
    facing: Facing;
  }) => (id: EntityId, ctx: Context) => Partial<ActorEntity>;
  /** 帧逻辑：把移动池内实体按意图推进 */
  update: (frame: FrameManager<ActorEntity>, delta: number) => void;
  /**
   * 按角色注入意图来源：玩家读输入、NPC 读路径。
   *
   * 按 `role` 分派而非全局唯一来源——两类角色的意图来源本质不同，
   * 用单一来源再在内部 if 分支会让组装层多一层间接。
   */
  setIntent: (role: Role, source: IntentSource) => void;
};

/** 默认意图：未注册来源的角色原地不动 */
const NO_INTENT: IntentSource = () => IDLE;

export function createLocomotionSystem(grid: Grid): LocomotionSystem {
  // 移动池：每帧按意图推进；静止实体不入池，零帧写入
  const pool = new Set<EntityId>();

  // 意图来源按角色分派；未注册的角色的默认静止，保证系统可独立测试
  const sources = new Map<Role, IntentSource>();
  const readIntent = (entity: Readonly<ActorEntity>): Intent =>
    (sources.get(entity.role) ?? NO_INTENT)(entity);

  const enter =
    (props: { x: number; y: number; speed: number; facing: Facing }) =>
    (id: EntityId, ctx: Context): Partial<ActorEntity> => {
      // 实体存活窗口 = 池成员窗口
      ctx.onMount(() => {
        pool.add(id);
      });
      ctx.onUnmount(() => {
        pool.delete(id);
      });

      return {
        x: props.x,
        y: props.y,
        speed: props.speed,
        sneakFactor: 0.45,
        sneaking: false,
        facing: props.facing,
      };
    };

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
      if (entity.sneaking !== intent.sneaking) {
        frame(id, (e) => {
          e.sneaking = intent.sneaking;
        });
      }
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

    frame(id, (e) => {
      e.x = moved.x;
      e.y = moved.y;
      e.sneaking = intent.sneaking;
      if (turned) e.facing = turned;
    });
  };

  const update = (frame: FrameManager<ActorEntity>, delta: number) => {
    for (const id of pool) step(frame, id, delta);
  };

  return {
    enter,
    update,
    setIntent: (role: Role, source: IntentSource) => {
      sources.set(role, source);
    },
  };
}
