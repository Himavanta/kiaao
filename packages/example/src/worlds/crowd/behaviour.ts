// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NPC 行为：纯逻辑，零 kiaao / 零 DOM
//
// 拆出来的理由与 saboteur 的 `world/` 同一条：**纯逻辑才能被独立测试**。
// 行为是对「状态 + 环境」的纯函数变换，不关心它是被信号承载还是被闭包
// 变量承载——所以这部分在两套架构里可以完全相同。
//
// 组件（npc.tsx）只负责：创建状态、注册进池、订阅渲染。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── 可调参数（全在这一屏）─────────────────────────────

export const NPC_SIZE = 22;
/** 场地尺寸：与 index.tsx 的舞台保持一致 */
export const WORLD_W = 900;
export const WORLD_H = 560;

const SPEED = 72;
/** 视距（px）——看不见就不会恐慌 */
const SIGHT = 170;
/** 到达判定半径 */
const ARRIVE = 4;
/** 恐慌持续时长（秒）：到期回到闲游 */
const FLEE_SECONDS = 6;
/** 闲游时两次决策的间隔（秒） */
const IDLE_MIN = 0.6;
const IDLE_MAX = 2.4;
/** 恐慌时每步逃离的距离（px） */
const FLEE_STEP = 200;

// ── 类型 ──────────────────────────────────────────────

export type Mood = "wander" | "flee";

export type Vec = { x: number; y: number };

export type NpcState = {
  x: number;
  y: number;
  mood: Mood;
  /** 距离下次决策的剩余秒数（闲游）或恐慌剩余秒数（恐慌） */
  moodLeft: number;
  /** 当前行走目标 */
  goalX: number;
  goalY: number;
  /** 恐慌时背对的参照点（目击位置，进入时固定） */
  fleeFrom: Vec | null;
  /**
   * 已经反应过的异常源 id——**每个源只反应一次**。
   *
   * 没有它，恐慌完全自我维持：恐慌者互相看见 → 互相刷新恐慌 → 永不到期。
   * 有了它，一对（观察者, 源）最多触发一次恐慌，因此级联有限。
   * 这与 saboteur 里 `accounted` 集的机制相同。
   *
   * **注意它并不能让恐慌彻底平息**：这张清单是每个 NPC 各自的，所以 A
   * 反应过尸体后仍会因「看到 B 恐慌」而再次恐慌（它从没反应过 B）。
   * 结果是恐慌周期振荡（实测 120 秒内 0→19→0→18→0→19）——这是 demo
   * 没有终局条件导致的设计缺口，不是本字段的问题。详见实验文档 §5.5③。
   */
  reacted: number[];
  /** 水平朝向：1 朝右，-1 朝左（渲染靠翻转） */
  facing: 1 | -1;
  dead: boolean;
};

/**
 * 感知所需的最小信息。
 *
 * 刻意只有四个字段——不需要知道别人的 `mood`、`moodLeft`、目标点。
 * **这是「跨实体读取失去编译期保护」的具体位置**：这里没有共享实体类型，
 * 只有结构约定；别的组件改了字段名，这里不会报错。
 */
export type PeerInfo = {
  id: number;
  x: number;
  y: number;
  dead: boolean;
  /** 是否正在恐慌——「异常者」的另一半判据 */
  panicked: boolean;
};

/** 环境：跨实体读取的唯一入口（由帧循环传入，不存进对象） */
export type PeerSource = {
  peers: () => readonly PeerInfo[];
};

/** 感知结果：异常源的位置与身份（身份用于去重） */
export type Threat = { x: number; y: number; id: number };

// ── 工具 ──────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export const randomBetween = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/**
 * 场地内的随机闲游目标。
 *
 * 返回的键名就是状态字段名（`goalX` / `goalY`）——这样 `wander` 里可以
 * 直接 `...goal` 展开。若返回 `{ x, y }`，展开时会**覆盖状态的 x/y**，
 * 把 NPC 瞬移到随机点（测试逮到过这个 bug）。键名对齐从根上消除这类错误。
 */
export function randomGoal(): { goalX: number; goalY: number } {
  return {
    goalX: randomBetween(0, WORLD_W - NPC_SIZE),
    goalY: randomBetween(0, WORLD_H - NPC_SIZE),
  };
}

/** 初始状态：出生点即第一个目标点，站在原地等下才走 */
export function createInitialState(pos: Vec): NpcState {
  return {
    x: pos.x,
    y: pos.y,
    mood: "wander",
    moodLeft: randomBetween(IDLE_MIN, IDLE_MAX),
    goalX: pos.x,
    goalY: pos.y,
    fleeFrom: null,
    reacted: [],
    facing: 1,
    dead: false,
  };
}

// ── 感知 ──────────────────────────────────────────────

/**
 * 视野内最近的「异常者」（尸体或恐慌者），已反应过的不算。
 *
 * `nearestDist` 初值设为 SIGHT 而非 Infinity——「恰好等于视距」不算看见，
 * 且天然给出「看不见就返回 null」。
 */
export function senseThreat(input: {
  state: NpcState;
  selfId: number;
  source: PeerSource;
}): Threat | null {
  const { state, selfId, source } = input;
  let nearest: Threat | null = null;
  let nearestDist = SIGHT;

  for (const peer of source.peers()) {
    if (peer.id === selfId) continue;
    if (!peer.dead && !peer.panicked) continue;
    if (state.reacted.includes(peer.id)) continue;

    const dist = Math.hypot(peer.x - state.x, peer.y - state.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = { x: peer.x, y: peer.y, id: peer.id };
    }
  }
  return nearest;
}

// ── 移动 ──────────────────────────────────────────────

/** 朝 `goal` 走一步；到达则精确落在目标点 */
function march(input: { state: NpcState; dt: number }): NpcState {
  const { state, dt } = input;
  const dx = state.goalX - state.x;
  const dy = state.goalY - state.y;
  const dist = Math.hypot(dx, dy);

  if (dist < ARRIVE) return { ...state, x: state.goalX, y: state.goalY };

  const step = Math.min(SPEED * dt, dist);
  return {
    ...state,
    x: state.x + (dx / dist) * step,
    y: state.y + (dy / dist) * step,
    facing: dx >= 0 ? 1 : -1,
  };
}

// ── 行为 ──────────────────────────────────────────────

/** 闲游：定时换目标，走到也换 */
export function wander(input: { state: NpcState; dt: number }): NpcState {
  const { state, dt } = input;
  const moved = march(input);
  const left = state.moodLeft - dt;
  const arrived = moved.x === state.goalX && moved.y === state.goalY;

  if (arrived || left <= 0) {
    const goal = randomGoal();
    return { ...moved, mood: "wander", moodLeft: randomBetween(IDLE_MIN, IDLE_MAX), ...goal };
  }
  return { ...moved, moodLeft: left };
}

/**
 * 恐慌：背对参照点跑，直到情绪消退。
 *
 * **参照点是粘滞的**：进入恐慌时定下 `fleeFrom`，之后不再重选。早期版本
 * 每帧取「当前最近威胁」，当人被两个威胁（尸体与另一个恐慌者）夹在中间时，
 * 逃离方向来回抵消，原地卡死、恐慌永不到期（实测 500 帧只移动 1px）。
 * 粘滞参照点也更符合直觉：人跑开的是**吓到他的那个东西**。
 *
 * 进入时把源 id 记入 `reacted`——一对（观察者, 源）最多触发一次。
 *
 * **逃离途中路过的新异常也一并记下**（不只是进入时的那个）。语义上说得通：
 * 「跑的时候又看见别的吓人东西，它不再让我更怕」。实践上很关键——只记
 * 进入源时，永久尸体会反复触发还没反应过它的人，级联烧得极慢（实测 10 次
 * 里 6 次 120 秒内仍在骚动）。
 *
 * 但**别期待它能让恐慌彻底平静**（见 `reacted` 字段的说明）。
 */
export function flee(input: { state: NpcState; threat: Threat | null; dt: number }): NpcState {
  const { state, threat, dt } = input;

  // 进入点：不在恐慌中时必须由威胁提供参照点（没看见东西不该乱跑）
  const entering = state.mood !== "flee";
  if (entering && !threat) return { ...state, mood: "wander", moodLeft: 0 };

  const from = entering ? threat : state.fleeFrom;
  if (!from) return { ...state, mood: "wander", moodLeft: 0, fleeFrom: null };

  const left = (entering ? FLEE_SECONDS : state.moodLeft) - dt;
  // 记下本次感知到的异常源。进入时 `threat` 必非空（上面已拦），
  // 途中则为新看到的；两种情况都从 `threat` 取 id（`fleeFrom` 是裸 Vec，无 id）。
  const sourceId = threat?.id;
  const reacted =
    sourceId !== undefined && !state.reacted.includes(sourceId)
      ? [...state.reacted, sourceId]
      : state.reacted;
  if (left <= 0) return { ...state, mood: "wander", moodLeft: 0, fleeFrom: null, reacted };

  // 逃离方向 = 背离参照点，落点限制在场地内
  const dx = state.x - from.x;
  const dy = state.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const goalX = clamp(state.x + (dx / len) * FLEE_STEP, 0, WORLD_W - NPC_SIZE);
  const goalY = clamp(state.y + (dy / len) * FLEE_STEP, 0, WORLD_H - NPC_SIZE);

  const moved = march({ state: { ...state, goalX, goalY }, dt });
  return { ...moved, mood: "flee", moodLeft: left, goalX, goalY, fleeFrom: from, reacted };
}

// ── 每帧推进 ──────────────────────────────────────────

/**
 * 算下一个状态。**纯函数**：不改传入的 state，返回新对象。
 *
 * 无事发生时返回**原对象**——信号靠引用比较，同引用不触发传播，
 * 死者因此不产生任何下游开销。
 */
export function advance(input: {
  state: NpcState;
  selfId: number;
  dt: number;
  source: PeerSource;
}): NpcState {
  const { state, selfId, dt, source } = input;
  if (state.dead) return state;

  const threat = senseThreat({ state, selfId, source });
  if (threat || state.mood === "flee") return flee({ state, threat, dt });
  return wander({ state, dt });
}
