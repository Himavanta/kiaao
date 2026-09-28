// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 导航系统：目标选择 + A* 重算 + 路径推进
//
// 寻路是这一步最贵的运算，而 NPC 的目的地变化很慢（到达后才换）。
// 因此按实体节流：只有「需要新路径」的实体才跑 A*，其余帧零开销。
//
// 路径的推进（走到点就弹出）也在本系统——`path` 的写者只有 navigation。
// locomotion 的意图来源只读 `path[0]` 求方向，不修改它。
//
// **看门狗**：被墙挡住或挤在角落时，NPC 可能永远走不到下一个路径点，
// 于是路径永不弹出、NPC 卡死。跟随时长超过阈值即放弃当前路径并重规划。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context } from "kiaao";

import type { EntityId, FrameManager } from "../../engine/types";
import { cellAt, cellCenter, collectWalkable, findPath, type Cell, type Grid } from "../../world";
import type { Random } from "../../world/random";
import type { ActorEntity } from "../types";
import { ACTOR_SIZE } from "./locomotion";

/** 到达路径点的判定半径（px）：小于此距离即视为到达并弹出 */
const ARRIVE_RADIUS = 4;

/**
 * 单点跟随的上限（秒）：超时即放弃当前路径重规划，防卡死。
 *
 * 这是**距上次推进**的时长，而非整条路径的时长——一条 30 格的路径
 * 以 78px/s 走完需要十几秒，按整条计时会把正常路径误杀。
 */
const STUCK_TIMEOUT = 4;

/** 停留时长范围（秒）：到达后歇一会，避免 NPC 像弹球一样永动 */
const IDLE_MIN = 0.8;
const IDLE_MAX = 3.5;

export type NavigationSystem = {
  enter: (props?: {
    idleMin?: number;
    idleMax?: number;
  }) => (id: EntityId, ctx: Context) => Partial<ActorEntity>;
  update: (frame: FrameManager<ActorEntity>, delta: number) => void;
  /** 让所有池内实体重新规划（关卡切换或目标失效时调用） */
  replanAll: () => void;
};

export function createNavigationSystem(options: { grid: Grid; random: Random }): NavigationSystem {
  const { grid, random } = options;

  // 池：需要导航的实体（NPC）。玩家不入池——它的意图来自输入
  const pool = new Set<EntityId>();

  // 随机目的地候选集：地图静态，收集一次即可
  const walkable = collectWalkable(grid);

  // 待重规划：enter 与 replanAll 只置位，实际规划在 update 中做
  const needsPlan = new Set<EntityId>();
  let replanAllPending = false;

  const enter =
    (props?: { idleMin?: number; idleMax?: number }) =>
    (id: EntityId, ctx: Context): Partial<ActorEntity> => {
      ctx.onMount(() => {
        pool.add(id);
        needsPlan.add(id);
      });
      ctx.onUnmount(() => {
        pool.delete(id);
        needsPlan.delete(id);
      });

      const idleMin = props?.idleMin ?? IDLE_MIN;
      const idleMax = props?.idleMax ?? IDLE_MAX;

      return {
        path: [],
        goal: null,
        idleLeft: idleMin + random() * (idleMax - idleMin),
        followTime: 0,
      } as Partial<ActorEntity>;
    };

  /** 随机挑一个可通行格作为目的地（避开当前格） */
  const pickGoal = (from: Cell): Cell | undefined => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = random.pick(walkable);
      if (candidate && (candidate.col !== from.col || candidate.row !== from.row)) {
        return candidate;
      }
    }
    return undefined;
  };

  /** 为单个实体规划路径；不可达时清空路径，留待下次重试 */
  const plan = (frame: FrameManager<ActorEntity>, id: EntityId) => {
    const entity = frame(id);
    if (!entity || entity.dead) return;

    const from = cellAt(entity.x + ACTOR_SIZE / 2, entity.y + ACTOR_SIZE / 2);
    // 无有效位置（如尚未写出 x/y）时不规划，下一帧再试
    if (!from) return;

    const goal = pickGoal(from);
    if (!goal) return;

    const path = findPath(grid, from, goal);

    frame(id, (e) => {
      e.path = path ? [...path] : [];
      e.goal = path ? goal : null;
      e.followTime = 0;
    });
  };

  /** 推进单个实体：待规划 → 跟随 → 到达后停留 → 再规划 */
  const step = (frame: FrameManager<ActorEntity>, id: EntityId, delta: number) => {
    const entity = frame(id);
    if (!entity) return;

    // 无有效位置时不推进（x/y 未写出的瞬间）
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return;

    // 死者不导航：尸体留在原地（清空路径由 interaction 在死亡时完成）
    if (entity.dead) return;

    // 驻足状态：不规划新目标，原地等待行为系统切换
    if (entity.mood === "linger" && entity.path.length === 0) return;

    if (needsPlan.delete(id)) {
      plan(frame, id);
      return;
    }

    if (entity.path.length > 0) {
      advance(frame, id, entity, delta);
      return;
    }

    // 路径走完：停留计时，到点后规划下一段
    const idleLeft = entity.idleLeft - delta;
    if (idleLeft > 0) {
      frame(id, (e) => {
        e.idleLeft = idleLeft;
      });
      return;
    }

    plan(frame, id);
  };

  /**
   * 路径推进：到达首点则弹出并在推进时清零计时；长时间无推进则放弃。
   *
   * 计时语义是「距上次推进」而非「整条路径已走多久」：被墙挡住或
   * 被挤住时无进展，累计到阈值即放弃重规划。
   */
  const advance = (
    frame: FrameManager<ActorEntity>,
    id: EntityId,
    entity: Readonly<ActorEntity>,
    delta: number,
  ) => {
    const [next] = entity.path;
    if (!next) return;

    const { x: tx, y: ty } = cellCenter(next);
    const cx = entity.x + ACTOR_SIZE / 2;
    const cy = entity.y + ACTOR_SIZE / 2;
    const arrived = Math.abs(tx - cx) < ARRIVE_RADIUS && Math.abs(ty - cy) < ARRIVE_RADIUS;

    // 看门狗：长时间无推进即放弃，避免永久卡在这一段
    const stuckTime = entity.followTime + delta;
    if (!arrived && stuckTime > STUCK_TIMEOUT) {
      frame(id, (e) => {
        e.path = [];
        e.goal = null;
        e.followTime = 0;
      });
      return;
    }

    frame(id, (e) => {
      if (!arrived) {
        e.followTime = stuckTime;
        return;
      }
      // 到达：弹出首点，计时清零（下一点重新计）
      e.path = e.path.slice(1);
      e.followTime = 0;
      // 最后一个点走完：重置停留计时，让 NPC 在目的地歇一会
      if (e.path.length === 0) {
        e.idleLeft = IDLE_MIN + random() * (IDLE_MAX - IDLE_MIN);
      }
    });
  };

  const update = (frame: FrameManager<ActorEntity>, delta: number) => {
    if (replanAllPending) {
      replanAllPending = false;
      for (const id of pool) needsPlan.add(id);
    }

    for (const id of pool) step(frame, id, delta);
  };

  return {
    enter,
    update,
    replanAll: () => {
      replanAllPending = true;
    },
  };
}

/**
 * 路径跟随意图：朝当前路径点的格中心移动。
 *
 * 供 locomotion 的 `setIntent` 使用——只读 `path[0]`，不修改路径
 * （推进由 navigation 负责，保持单写者）。
 *
 * 4 向而非斜向：与寻路的 4 邻域一致。斜向意图会让实体蹭着墙角走，
 * 而寻路给出的路径本身就是 4 向的，走斜线反而会撞墙。
 */
export function pathIntent(entity: Readonly<ActorEntity>): {
  dx: number;
  dy: number;
  sneaking: boolean;
} {
  const [next] = entity.path;
  if (!next) return { dx: 0, dy: 0, sneaking: false };

  const { x: tx, y: ty } = cellCenter(next);
  const dx = tx - (entity.x + ACTOR_SIZE / 2);
  const dy = ty - (entity.y + ACTOR_SIZE / 2);

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) < ARRIVE_RADIUS) return { dx: 0, dy: 0, sneaking: false };
    return { dx: Math.sign(dx), dy: 0, sneaking: false };
  }

  if (Math.abs(dy) < ARRIVE_RADIUS) return { dx: 0, dy: 0, sneaking: false };
  return { dx: 0, dy: Math.sign(dy), sneaking: false };
}
