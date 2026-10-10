// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 导航服务：把「去某处」这件事做出来
//
// 这个模块**不知道状态机存在**——它只提供两个动作：给一个目标格，
// 它算出路径；给一条路径，它推进一帧。谁在什么时候调用它，由状态
// （`npcs/*.ts`）决定。
//
// 上一版这里读 `entity.mood` 来决定「挑随机目标还是逃跑目标」——
// 那是把状态的决策混进了服务里。现在分派只发生在一处（状态对象内），
// 服务保持无策略。
//
// **看门狗**：被墙挡住或挤在角落时，NPC 可能永远走不到下一个路径点，
// 于是路径永不弹出、NPC 卡死。超过阈值无推进即放弃当前路径。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  cellAt,
  cellCenter,
  collectWalkable,
  findPath,
  furthestCells,
  type Cell,
  type Grid,
} from "../../world";
import type { Random } from "../../world/random";
import type { ActorEntity } from "../types";
import { ACTOR_SIZE } from "./locomotion";

/** 到达路径点的判定半径（px）：小于此距离即视为到达并弹出 */
const ARRIVE_RADIUS = 4;

/**
 * 单点跟随的上限（秒）：超时即放弃当前路径，防卡死。
 *
 * 这是**距上次推进**的时长，而非整条路径的时长——一条 30 格的路径
 * 以 78px/s 走完需要十几秒，按整条计时会把正常路径误杀。
 */
const STUCK_TIMEOUT = 4;

/** 逃跑候选点数：取最远的前 N 个再随机选一，避免所有目击者挤向同一角落 */
const FLEE_CANDIDATES = 12;

export type NavigationService = {
  /** 随机挑一个可通行格作为目的地（避开当前格） */
  pickRandomGoal: (from: Cell) => Cell | undefined;
  /**
   * 在某个点附近挑一个可通行格（巡逻用）。
   *
   * 与 `pickRandomGoal` 的区别是**限定在岗位周边**——巡逻是「在岗」，
   * 不是全图游荡。`radius` 为曼哈顿距离上限。
   */
  pickNearbyGoal: (around: Cell, from: Cell, radius: number) => Cell | undefined;
  /** 挑一个远离威胁的目的地（排除当前格，否则会「规划到自身」而空转） */
  pickFleeGoal: (from: Cell, threat: Cell) => Cell | undefined;
  /**
   * 朝当前 `goal` 走一帧：无路径则先规划，有路径则推进一帧。
   *
   * 到达时清掉 `goal` 并置零 `followTime`——状态通过 `hasArrived`
   * 得知「到了」。
   *
   * **收实体而非 `(frame, id)`**：调用方手里本来就有活对象（`ctx.self`），
   * 再让它自己查一次是多余的一跳（且迫使它多持有 `frame` / `id`）。
   */
  moveTowardGoal: (entity: ActorEntity, delta: number) => void;

  // ── 路线写入（`path` / `goal` / `followTime` 的**唯一写者**是本服务）──
  //
  // 这三个字段曾经散在 states / navigation / interaction 三处写
  // （见文档 §八）。收拢后状态机只说「我要去哪」，不算「怎么写」。

  /**
   * 设定目的地，并重置路线计时。
   *
   * 状态选了目标后调它——把「写 `goal` 与重置 `followTime` 必须成对」
   * 这条约束封在一处（分开写会漏掉其中一个）。
   */
  setGoal: (entity: ActorEntity, goal: Cell) => void;

  /** 放弃当前路线（清 `path` / `goal` / `followTime`） */
  clearRoute: (entity: ActorEntity) => void;

  /** 是否已到达（无路径且无目标）——`arrived` 的语义属本服务，不属状态 */
  hasArrived: (entity: Readonly<ActorEntity>) => boolean;
};

export function createNavigationService(options: {
  grid: Grid;
  random: Random;
}): NavigationService {
  const { grid, random } = options;

  // 随机目的地候选集：地图静态，收集一次即可
  const walkable = collectWalkable(grid);

  const pickRandomGoal = (from: Cell): Cell | undefined => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = random.pick(walkable);
      if (candidate && (candidate.col !== from.col || candidate.row !== from.row)) {
        return candidate;
      }
    }
    return undefined;
  };

  const pickFleeGoal = (from: Cell, threat: Cell): Cell | undefined =>
    random.pick(furthestCells(walkable, threat, FLEE_CANDIDATES, from));

  /**
   * 岗位周边的候选集：地图静态，同一岗位的结果可缓存。
   *
   * 不缓存也不会错，只是每次巡逻挑点都要扫一遍全图可通行格
   * （32×24 地图约 600 格）——保镖数量少时无所谓，但仍不值得反复扫。
   */
  const nearbyCache = new Map<string, Cell[]>();

  const pickNearbyGoal = (around: Cell, from: Cell, radius: number): Cell | undefined => {
    const key = `${around.col},${around.row},${radius}`;
    let candidates = nearbyCache.get(key);
    if (!candidates) {
      candidates = walkable.filter(
        (cell) => Math.abs(cell.col - around.col) + Math.abs(cell.row - around.row) <= radius,
      );
      nearbyCache.set(key, candidates);
    }

    // 排除当前格：把自身格当目标会让 findPath 返回空路径，陷入空转
    const usable = candidates.filter((cell) => cell.col !== from.col || cell.row !== from.row);
    return random.pick(usable);
  };

  /** 为当前 `goal` 规划路径；不可达时清空目标，留待下帧重挑 */
  const plan = (entity: ActorEntity): void => {
    const goal = entity.goal;
    if (!goal) return;

    const from = cellAt(entity.x + ACTOR_SIZE / 2, entity.y + ACTOR_SIZE / 2);
    if (!from) return;

    const path = findPath(grid, from, goal);
    // 空路径有两种来源：已在目标格（起终点重合）或目标不可达。
    // 两者都不该保留 goal——否则下一帧会「重新规划到当前格」得到空路径、
    // 再保留同一个 goal，**无限空转**（表现为站着不动）。
    // 注意不能写 `path ? ...`：空数组是 truthy，会把这种情况当成成功。
    const usable = path !== null && path.length > 0;

    entity.path = usable ? [...path] : [];
    entity.goal = usable ? goal : null;
    entity.followTime = 0;
  };

  /**
   * 路径推进：到达首点则弹出并清零计时；长时间无推进则放弃整条路径。
   *
   * 计时语义是「距上次推进」：被挡住或挤住时无进展，累计到阈值即放弃。
   */
  const advance = (entity: ActorEntity, delta: number): void => {
    const [next] = entity.path;
    if (!next) return;

    const { x: tx, y: ty } = cellCenter(next);
    const cx = entity.x + ACTOR_SIZE / 2;
    const cy = entity.y + ACTOR_SIZE / 2;
    const arrived = Math.abs(tx - cx) < ARRIVE_RADIUS && Math.abs(ty - cy) < ARRIVE_RADIUS;

    const stuckTime = entity.followTime + delta;
    if (!arrived && stuckTime > STUCK_TIMEOUT) {
      entity.path = [];
      entity.goal = null;
      entity.followTime = 0;
      return;
    }

    if (!arrived) {
      entity.followTime = stuckTime;
      return;
    }
    // 到达：弹出首点。走完最后一点时清掉目标——状态据此得知「到了」
    entity.path = entity.path.slice(1);
    entity.followTime = 0;
    if (entity.path.length === 0) entity.goal = null;
  };

  const moveTowardGoal = (entity: ActorEntity, delta: number): void => {
    // 无有效位置时不推进（x/y 未写出的瞬间）
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return;

    if (entity.path.length === 0) {
      plan(entity);
      return;
    }

    advance(entity, delta);
  };

  /** 设定目的地：`goal` 与 `followTime` 必须成对重置，故封在一起 */
  const setGoal = (entity: ActorEntity, goal: Cell): void => {
    entity.goal = goal;
    entity.followTime = 0;
  };

  /** 放弃当前路线（恐慌进入时清、死亡时清——两处语义相同） */
  const clearRoute = (entity: ActorEntity): void => {
    entity.path = [];
    entity.goal = null;
    entity.followTime = 0;
  };

  /** 已到达：无待走路径且无目标。状态据此挑下一个目的地 */
  const hasArrived = (entity: Readonly<ActorEntity>): boolean =>
    entity.path.length === 0 && entity.goal === null;

  return {
    pickRandomGoal,
    pickNearbyGoal,
    pickFleeGoal,
    moveTowardGoal,
    setGoal,
    clearRoute,
    hasArrived,
  };
}

/**
 * 路径跟随意图：朝当前路径点的格中心移动。
 *
 * 供 locomotion 的 `setIntent` 使用——只读 `path[0]`，不修改路径
 * （推进由 navigation 服务负责，保持单写者）。
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
