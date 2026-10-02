// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 感知系统：视线判定（定频）
//
// 视线是全项目最贵的一环：每个观察者要对每个目标做「距离 → 视锥角度 →
// 射线遮挡」三级判定。10 个 NPC × 12 个目标 × 60fps = 7200 次/秒。
//
// NPC 不需要 60Hz 的视觉——感知结果写入实体数据，渲染层照常每帧读取，
// 100ms 的感知延迟在视觉上察觉不到。定频到 ~10Hz，算力省下六分之五
// （规划文档 4.3）。
//
// M4 只做「看见与否」的判定与记录（供视锥可视化与调试）；M6 会在
// 此基础上把「看见异常」变成目击事件。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createPool, type EntityId, type Enter, type FrameManager } from "engine";

import { canSee, TILE, type Grid, type Vec2 } from "../../world";
import { FACING_ANGLES, type ActorEntity } from "../types";
import { ACTOR_SIZE } from "./locomotion";

/** 感知间隔（帧）：60fps 下约 10Hz */
const PERCEPTION_INTERVAL = 6;

/** 视锥半角（弧度）：约 60° 张角 */
export const SIGHT_HALF_ARC = Math.PI / 6;

/** 视距（px）：约 7 格 */
export const SIGHT_RANGE = 7 * TILE;

/**
 * 感知系统字段需求。
 *
 * 观测者侧需要位置、朝向、视锥参数与结果栅；被观测者侧只需位置
 * （实体池是同一个，两边的字段需求合并在一起）。
 */
export type Perceivable = Pick<ActorEntity, "x" | "y" | "facing" | "dead" | "visibleIds">;

/** 出生参数：视锥形状（缺省用系统默认） */
export type PerceptionSpawn = {
  range?: number;
  halfArc?: number;
};

export type PerceptionSystem = {
  enter: Enter<Perceivable>;
  /** 初值（D2 方案 B）：视距、视锥半角与结果栅（空列表） */
  spawn: (props?: PerceptionSpawn) => Pick<ActorEntity, "sightRange" | "sightArc" | "visibleIds">;
  update: (frame: FrameManager<ActorEntity>) => void;
  /** 当前帧的感知快照（调试与视锥可视化用） */
  snapshot: () => { tick: number; visible: number };
};

/** 实体中心（感知与视锥都以中心为基准，与渲染的左上角坐标区分） */
export function actorCenter(entity: Readonly<ActorEntity>): Vec2 {
  return { x: entity.x + ACTOR_SIZE / 2, y: entity.y + ACTOR_SIZE / 2 };
}

/** 朝向 → 视线角度（屏幕坐标：0 为正东，顺时针为正） */
export function sightAngle(entity: Readonly<ActorEntity>): number {
  return FACING_ANGLES[entity.facing];
}

export function createPerceptionSystem(options: { grid: Grid }): PerceptionSystem {
  const { grid } = options;
  const [pool, enter] = createPool<Perceivable>();

  // 帧计数器：定频的时钟
  let tick = 0;
  // 最近一轮的可见对数（调试面板展示）
  let visiblePairs = 0;

  const spawn = (props?: PerceptionSpawn) => ({
    sightRange: props?.range ?? SIGHT_RANGE,
    sightArc: props?.halfArc ?? SIGHT_HALF_ARC,
    visibleIds: [],
  });

  /**
   * 一轮扫描：每个观察者对所有其他实体做三级判定。
   *
   * 结果写入 `visibleIds`（观察者能否看见目标）——谁消费它由上层决定，
   * M6 的 alarm 系统会据此产生目击事件。
   */
  const scan = (frame: FrameManager<ActorEntity>, ids: EntityId[]) => {
    let pairs = 0;

    for (const observerId of ids) {
      const observer = frame(observerId);
      if (!observer) continue;
      // 死者不观察（但仍可作为被观察的对象——尸体正是目击链的输入）
      if (observer.dead) continue;

      const from = actorCenter(observer);
      const angle = sightAngle(observer);
      const seen: EntityId[] = [];

      for (const targetId of ids) {
        if (targetId === observerId) continue;

        const target = frame(targetId);
        if (!target) continue;

        const ok = canSee({
          grid,
          origin: from,
          angle,
          target: actorCenter(target),
          range: observer.sightRange,
          halfArc: observer.sightArc,
        });

        if (ok) seen.push(targetId);
      }

      pairs += seen.length;

      // 只写实际变化的结果：无变化时零帧写入（memo 生效的前提）
      if (!sameIds(observer.visibleIds, seen)) {
        observer.visibleIds = seen;
      }
    }

    visiblePairs = pairs;
  };

  const update = (frame: FrameManager<ActorEntity>) => {
    tick += 1;
    if (tick % PERCEPTION_INTERVAL !== 0) return;

    const ids = [...pool];
    if (ids.length === 0) return;

    scan(frame, ids);
  };

  return {
    enter,
    spawn,
    update,
    snapshot: () => ({ tick, visible: visiblePairs }),
  };
}

/**
 * 两个 id 列表是否相同（按位置逐一比较）。
 *
 * 旧引擎里 `visibleIds` 可能是 `undefined`（尚未写出初值），故签名带 `| undefined`。
 * 现在 `perception.spawn()` 保证它初始化为空数组，但类型上仍是数组——
 * 保留 `?? []` 式的宽松处理已无必要。
 */
function sameIds(a: EntityId[], b: EntityId[]): boolean {
  if (a.length !== b.length) return false;
  for (const [i, id] of a.entries()) {
    if (id !== b[i]) return false;
  }
  return true;
}
