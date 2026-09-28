// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 行为系统：NPC 状态机
//
// M3 只有两个状态——闲游（走向随机目的地）与驻足（原地停留）。
// M5/M6 会加入饮酒、社交、目击、恐慌、逃离。
//
// **行为的表达方式**：不直接指挥移动，而是影响 navigation 的目的地
// 选择（`linger` 时不让 navigation 规划新目标）。这样 locomotion 与
// 意图来源都不必知道「状态机」的存在，行为切换只改一处。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context } from "kiaao";

import type { EntityId, FrameManager } from "../../engine/types";
import type { Random } from "../../world/random";
import type { ActorEntity, Mood } from "../types";

export type BehaviourSystem = {
  enter: () => (id: EntityId, ctx: Context) => Partial<ActorEntity>;
  update: (frame: FrameManager<ActorEntity>, delta: number) => void;
};

/**
 * 各行为的持续时长范围（秒）。
 *
 * `panic` 的时长由 alarm 设定（`PANIC_DURATION`），此处的值只是类型完整性
 * 所需——行为系统在 `witnessed` 为真时直接早退，不会用到它。
 */
const DURATION: Record<Mood, { min: number; max: number }> = {
  wander: { min: 6, max: 18 },
  linger: { min: 2, max: 6 },
  panic: { min: 30, max: 30 },
};

export function createBehaviourSystem(options: { random: Random }): BehaviourSystem {
  const { random } = options;
  const pool = new Set<EntityId>();

  const rollDuration = (mood: Mood): number => {
    const { min, max } = DURATION[mood];
    return min + random() * (max - min);
  };

  const enter =
    () =>
    (id: EntityId, ctx: Context): Partial<ActorEntity> => {
      ctx.onMount(() => {
        pool.add(id);
      });
      ctx.onUnmount(() => {
        pool.delete(id);
      });

      return {
        mood: "wander" as Mood,
        moodLeft: rollDuration("wander"),
      } as Partial<ActorEntity>;
    };

  /**
   * 推进行为计时，到点则切换状态。
   *
   * 切换时如果有未走完的路径，就**等它走完**再切——在路中间切换
   * 状态会让 NPC 突然停在空地中央，看起来像卡住了。
   */
  const step = (frame: FrameManager<ActorEntity>, id: EntityId, delta: number) => {
    const entity = frame(id);
    if (!entity) return;

    // 死者不再有行为：尸体不入状态机
    if (entity.dead) return;

    // 恐慌者的 mood 归 alarm 管：状态机不再切换它，否则逃到一半
    // 会被切回 wander 而停下
    if (entity.witnessed) return;

    const moodLeft = entity.moodLeft - delta;
    if (moodLeft > 0) {
      frame(id, (e) => {
        e.moodLeft = moodLeft;
      });
      return;
    }

    // 有未走完的路径：推迟切换，给一点余量后重新检查
    if (entity.path.length > 0) {
      frame(id, (e) => {
        e.moodLeft = 0.5;
      });
      return;
    }

    const next: Mood = entity.mood === "wander" ? "linger" : "wander";
    frame(id, (e) => {
      e.mood = next;
      e.moodLeft = rollDuration(next);
      // 切换为闲游时清空停留计时，让 navigation 立即规划新目标
      if (next === "wander") e.idleLeft = 0;
    });
  };

  const update = (frame: FrameManager<ActorEntity>, delta: number) => {
    for (const id of pool) step(frame, id, delta);
  };

  return { enter, update };
}
