// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 报警系统：目击 → 恐慌 → 传播 → 报警
//
// 整条链只依赖已有的两个事实源：
// - `visibleIds`（M4 感知）：谁看得见谁
// - `dead`（M5 交互）：尸体
//
// **恐慌不需要额外的传播机制**：恐慌者会逃跑，逃跑者被旁人看见时同样
// 触发恐慌——传播链从感知系统自然长出来。这比维护一张「谁知道什么」的
// 传播表简单，也不会出现两处状态不一致。
//
// 状态不可逆：`witnessed` 一旦置位不再清除。若允许冷静，玩家就能靠等待
// 消除暴露，题材的紧迫感会消失。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use, type Context, type Signal } from "kiaao";

import type { EntityId, FrameManager } from "../../engine/types";
import { cellAt, type Cell } from "../../world";
import type { ActorEntity, Role } from "../types";
import { ACTOR_SIZE } from "./locomotion";

/** 每发现一个异常，警报值的增量 */
export const ALARM_PER_WITNESS = 12;

/** 恐慌持续时长（秒）。到期后仍会重新规划目的地，但不会恢复「不知情」 */
const PANIC_DURATION = 30;

export type AlarmSystem = {
  /**
   * 注册角色。
   *
   * **只有客人入池**——玩家不会因看见自己的尸体而恐慌。这个分派必须
   * 在注册侧完成（而不是在 update 里判 role）：入池即代表「此人参与
   * 恐慌链」，判据是身份而非每帧数据。
   */
  enter: (props: { role: Role }) => (id: EntityId, ctx: Context) => Partial<ActorEntity>;
  update: (frame: FrameManager<ActorEntity>) => void;
  /** 警报值 0~100：满值即报警（M7 据此判失败） */
  alarm: Signal<number>;
  /** 已目击者数量（HUD 展示） */
  witnessCount: Signal<number>;
  /** 重置警报（M7 重开一局时调用） */
  reset: () => void;
};

export function createAlarmSystem(): AlarmSystem {
  const pool = new Set<EntityId>();
  const alarm = use(0);
  const witnessCount = use(0);

  // 「我已计入过哪些异常源」——同一具尸体只让同一个 NPC 恐慌一次。
  // 缺了这层去重，站着的目击者会每轮扫描都 +12，警报瞬间爆表。
  const accounted = new Map<EntityId, Set<EntityId>>();

  const enter =
    (props: { role: Role }) =>
    (id: EntityId, ctx: Context): Partial<ActorEntity> => {
      // 玩家不入池：它不会恐慌，也不该计入目击者
      if (props.role !== "player") {
        ctx.onMount(() => {
          pool.add(id);
        });
        ctx.onUnmount(() => {
          pool.delete(id);
          accounted.delete(id);
        });
      }

      // 字段仍要返回：玩家也需要有初值（渲染层读它是安全的）
      return { witnessed: false, fleeFrom: null } as Partial<ActorEntity>;
    };

  /** 目标是否为「异常」：尸体，或已陷入恐慌的人 */
  const isAbnormal = (target: Readonly<ActorEntity>): boolean => target.dead || target.witnessed;

  /**
   * 本轮新目击的异常源（已计入过的不重复返回）。
   *
   * 去重集按「观察者 → 它已反应过的异常源」而非「异常源 → 已反应者」：
   * 前者的查询在观察者一侧，与遍历方向一致。
   */
  const findFreshSightings = (frame: FrameManager<ActorEntity>, id: EntityId): EntityId[] => {
    const observer = frame(id);
    if (!observer || observer.dead) return [];

    const seen = accounted.get(id) ?? new Set<EntityId>();
    const fresh: EntityId[] = [];

    for (const targetId of observer.visibleIds ?? []) {
      if (seen.has(targetId)) continue;
      const target = frame(targetId);
      if (!target || !isAbnormal(target)) continue;

      seen.add(targetId);
      fresh.push(targetId);
    }

    accounted.set(id, seen);
    return fresh;
  };

  /**
   * 目击者陷入恐慌。
   *
   * 只置状态（mood / fleeFrom / witnessed），不挑逃离点也不写路径——
   * 「去哪」由 navigation 按 mood 决定。清空既有路径是必要的：否则会先
   * 走完旧路再去新目标，看起来像「没反应」。
   */
  const panic = (frame: FrameManager<ActorEntity>, id: EntityId, threat: Cell) => {
    frame(id, (e) => {
      e.witnessed = true;
      e.mood = "panic";
      e.moodLeft = PANIC_DURATION;
      e.fleeFrom = threat;
      e.goal = null;
      e.path = [];
      e.idleLeft = 0;
      e.followTime = 0;
    });
  };

  const update = (frame: FrameManager<ActorEntity>) => {
    let freshTotal = 0;
    let witnesses = 0;

    for (const id of pool) {
      const observer = frame(id);
      if (!observer || observer.dead) continue;

      if (observer.witnessed) witnesses += 1;

      const fresh = findFreshSightings(frame, id);
      const [firstThreat] = fresh;
      if (firstThreat === undefined) continue;

      const threat = frame(firstThreat);
      if (!threat) continue;

      const threatCell = cellAt(threat.x + ACTOR_SIZE / 2, threat.y + ACTOR_SIZE / 2);
      if (!threatCell) continue;

      panic(frame, id, threatCell);
      freshTotal += fresh.length;
      witnesses += 1;
    }

    if (freshTotal > 0) {
      alarm(Math.min(100, alarm() + freshTotal * ALARM_PER_WITNESS));
    }
    witnessCount(witnesses);
  };

  return {
    enter,
    update,
    alarm,
    witnessCount,
    reset: () => {
      accounted.clear();
      alarm(0);
      witnessCount(0);
    },
  };
}
