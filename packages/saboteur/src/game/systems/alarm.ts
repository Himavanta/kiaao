// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 目击系统：察觉异常 → 交给行为系统反应 → 报警
//
// 整条链只依赖已有的两个事实源：
// - `visibleIds`（M4 感知）：谁看得见谁
// - `dead`（M5 交互）：尸体
//
// **本系统只负责「察觉」，不负责「怎么办」**：谁被吓到是个事实，
// 被吓到之后逃还是去查看是**角色的个性**（`npcs/*.ts` 的 `reaction`）。
// 分派交给 `behaviour.react`——这样新增一种反应不必改本系统。
//
// **传播不需要额外的机制**：逃跑者被旁人看见时同样触发反应——传播链
// 从感知系统自然长出来。这比维护一张「谁知道什么」的传播表简单，
// 也不会出现两处状态不一致。
//
// 状态不可逆：`witnessed` 一旦置位不再清除。若允许冷静，玩家就能靠等待
// 消除暴露，题材的紧迫感会消失。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createPool, type EntityId, type Enter, type FrameManager } from "engine";
import { use, type Signal } from "kiaao";

import { cellAt, type Cell } from "../../world";
import type { ActorEntity, Role, ThreatKind } from "../types";
import type { Witness } from "./behaviour";
import { ACTOR_SIZE } from "./locomotion";

/** 每发现一个异常，警报值的增量 */
export const ALARM_PER_WITNESS = 12;

/**
 * 报警系统字段需求。
 *
 * `dead` 用于排除已死的观察者；`visibleIds` 是异常源发现链的输入。
 */
export type Alarmable = Pick<
  ActorEntity,
  "dead" | "witnessed" | "fleeFrom" | "visibleIds" | "x" | "y"
>;

export type AlarmSystem = {
  /**
   * 注册角色。
   *
   * **玩家不入池**——玩家不会因看见尸体而恐慌，也不该变成传播源。
   * 这个分派必须在注册侧完成（而不是在 update 里判 role）：入池即代表
   * 「此人参与目击链」，判据是身份而非每帧数据。
   *
   * 客人**与保镖都入池**：两者都会被目击触发，只是反应不同
   * （`behaviour.react` 按角色自己的 `reaction` 分派）。
   */
  enter: (props: { role: Role }) => Enter<Alarmable>;
  /** 初值（D2 方案 B）：目击记忆与逃离参照点 */
  spawn: () => Pick<ActorEntity, "witnessed" | "fleeFrom">;
  update: (frame: FrameManager<ActorEntity>) => void;
  /** 警报值 0~100：满值即报警（M7 据此判失败） */
  alarm: Signal<number>;
  /** 已目击者数量（HUD 展示） */
  witnessCount: Signal<number>;
  /** 重置警报（M7 重开一局时调用） */
  reset: () => void;
};

export function createAlarmSystem(options: {
  /**
   * 请求让目击者对他看见的东西作出反应。
   *
   * 注入而非直接 import behaviour：alarm 只负责「谁看见了什么」，
   * 至于「看见之后行为怎么变」是行为系统的事。这样两个系统之间
   * 没有编译期依赖，也符合「反应由目击触发」这一个事实的归属。
   */
  onWitness: (witness: Witness) => void;
}): AlarmSystem {
  const { onWitness } = options;
  const [pool, enterPool] = createPool<Alarmable>();
  const alarm = use(0);
  const witnessCount = use(0);

  // 「我已计入过哪些异常源」——同一具尸体只让同一个 NPC 恐慌一次。
  // 缺了这层去重，站着的目击者会每轮扫描都 +12，警报瞬间爆表。
  const accounted = new Map<EntityId, Set<EntityId>>();

  // 玩家不入池：不恐慌，也不该计入目击者。
  // 字段（witnessed / fleeFrom）玩家同样需要初值——由 spawn 提供。
  //
  // 返回值标注为 `Enter<Alarmable>`：幻影字段靠它传播，玩家的 `define`
  // 才能据此要求 `witnessed` / `fleeFrom`。
  const enter =
    (props: { role: Role }): Enter<Alarmable> =>
    (id, ctx, state) => {
      if (props.role !== "player") enterPool(id, ctx, state);
      ctx.onUnmount(() => {
        accounted.delete(id);
      });
    };

  const spawn = () => ({ witnessed: false, fleeFrom: null });

  /** 目标是否为「异常」：尸体，或已陷入恐慌的人 */
  const isAbnormal = (target: Readonly<ActorEntity>): boolean => target.dead || target.witnessed;

  /** 异常源的类别——决定目击者的反应（客人逃、保镖对尸体查看） */
  const kindOf = (target: Readonly<ActorEntity>): ThreatKind => (target.dead ? "corpse" : "panic");

  /** 一条待反应的目击：异常源 id + 它当时所在的格 + 类别 */
  type Sighting = { id: EntityId; cell: Cell; kind: ThreatKind };

  /**
   * 本轮新目击的异常源（已计入过的不重复返回）。
   *
   * 去重集按「观察者 → 它已反应过的异常源」而非「异常源 → 已反应者」：
   * 前者的查询在观察者一侧，与遍历方向一致。
   */
  const findFreshSightings = (frame: FrameManager<ActorEntity>, id: EntityId): Sighting[] => {
    const observer = frame(id);
    if (!observer || observer.dead) return [];

    const seen = accounted.get(id) ?? new Set<EntityId>();
    const fresh: Sighting[] = [];

    for (const targetId of observer.visibleIds) {
      if (seen.has(targetId)) continue;
      const target = frame(targetId);
      if (!target || !isAbnormal(target)) continue;

      const cell = cellAt(target.x + ACTOR_SIZE / 2, target.y + ACTOR_SIZE / 2);
      if (!cell) continue;

      seen.add(targetId);
      fresh.push({ id: targetId, cell, kind: kindOf(target) });
    }

    accounted.set(id, seen);
    return fresh;
  };

  /**
   * 报告一次目击。
   *
   * **本系统不写行为字段**——它只报告「谁看见了什么」这一事实，
   * 由 `behaviour.react()` 执行状态切换（含清路径、掷定时长）。
   * 这样 `mood` / `path` / `goal` / `idleLeft` / `followTime` 的
   * 写入者始终只有状态机一处。
   */
  const report = (frame: FrameManager<ActorEntity>, id: EntityId, sighting: Sighting) => {
    const self = frame(id);
    if (self) {
      // witnessed 是记忆，永久保留——它属于本系统的语义
      self.witnessed = true;
    }
    onWitness({ frame, observer: id, threat: sighting });
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

      report(frame, id, firstThreat);
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
    spawn,
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
