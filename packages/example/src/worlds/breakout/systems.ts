import type { Context } from "kiaao";

import type { EntityId, FrameManager } from "../engine";
import type { Bounds, Shape } from "../engine/systems";
import type { SoundName } from "./assets";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 打砖块实体（球 / 挡板 / 砖块 / 状态实体共用同一结构）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 打砖块实体：所有实体共用同一类型（并集语义）。
 * 物理字段由基础系统切片提供；状态字段仅状态实体注册（其余实体为 undefined）。
 */
export type BreakoutEntity = {
  // 物理字段（movement / boundary / collision 切片）
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  bounds: Bounds;
  shape: Shape;
  enabled: boolean;
  breakable: boolean;
  drive: number;
  points: number;
  // 出生标识（球注册时提供：关联实体目录数组项）
  dataId: number;
  // 状态字段（仅状态实体注册：实体目录 + 游戏状态）
  balls: BallData[];
  score: number;
  lives: number;
  state: GameState;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏常量
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ARENA_W = 800;
export const ARENA_H = 600;
export const BALL_SIZE = 22;
export const BALL_SPEED = 420;
export const PADDLE_W = 110;
export const PADDLE_H = 16;
export const PADDLE_SPEED = 560;
export const ROWS = 6;
export const COLS = 8;
export const LIVES = 3;

/** 总分：所有砖块分值之和 */
export const MAX_SCORE = ((ROWS * (ROWS + 1)) / 2) * COLS;

/** 球数据（实体目录数组项：出生配置） */
export type BallData = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

/** 球数据序号：每次生成递增 */
let nextBallId = 0;

/** 生成一个球（声明式实体创建：push 进状态实体的 balls 数组） */
export function createBall(x: number, y: number, vx: number, vy: number): BallData {
  return { id: nextBallId++, x, y, vx, vy };
}

/** 游戏状态机 */
export type GameState = "ready" | "running" | "win" | "lose";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 事件 payload 类型（各系统 emit 方法的签名）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type BreakPayload = { id: EntityId; by: EntityId; points: number };
export type BouncePayload = { id: EntityId; by: EntityId };
export type OutPayload = { id: EntityId };
export type LaunchPayload = Record<string, never>;
export type ClickPayload = { x: number; y: number };
export type RestartPayload = Record<string, never>;
export type WinPayload = Record<string, never>;
export type LosePayload = Record<string, never>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 规则系统（事件系统：更新系统的超集）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 规则系统的外部依赖：链式事件的目标（音效系统的 emit，组装时注入） */
export type RuleDeps = {
  win: (payload: WinPayload) => void;
  lose: (payload: LosePayload) => void;
};

/**
 * 规则系统：内部维护多个闭包事件队列（每事件类型一个），
 * emit 方法绑定各队列（类型由签名锁定），update 在帧循环中处理队列。
 * 状态/挡板/砖块实体注册进本系统的池（像普通系统的 pool 一样持有实体）。
 */
export function createRuleSystem<T extends BreakoutEntity>(deps: RuleDeps) {
  // 闭包事件队列（每类型一个）
  const breakQueue: BreakPayload[] = [];
  const outQueue: OutPayload[] = [];
  const launchQueue: LaunchPayload[] = [];
  const clickQueue: ClickPayload[] = [];
  const restartQueue: RestartPayload[] = [];

  // 实体池（注册即持有 id）
  const statePool = new Set<EntityId>();
  const paddlePool = new Set<EntityId>();
  const brickPool = new Set<EntityId>();

  // emit：每个事件类型一个方法，绑定对应队列
  const emit = {
    break: (p: BreakPayload) => breakQueue.push(p),
    out: (p: OutPayload) => outQueue.push(p),
    launch: (p: LaunchPayload) => launchQueue.push(p),
    click: (p: ClickPayload) => clickQueue.push(p),
    restart: (p: RestartPayload) => restartQueue.push(p),
  };

  // enter：实体进入接口（与 emit 对称——实体进入 / 事件进入）
  const enter = {
    // 状态实体（提供状态字段初始值）
    state: (props: { balls?: BallData[]; score?: number; lives?: number; state?: GameState }) => {
      return (id: EntityId, ctx: Context) => {
        const { onMount, onUnmount } = ctx;
        onMount(() => {
          statePool.add(id);
        });
        onUnmount(() => {
          statePool.delete(id);
        });
        return {
          balls: props.balls ?? [],
          score: props.score ?? 0,
          lives: props.lives ?? 0,
          state: props.state ?? "ready",
        };
      };
    },
    // 挡板（供发球时读取位置）
    paddle: () => {
      return (id: EntityId, ctx: Context) => {
        const { onMount, onUnmount } = ctx;
        onMount(() => {
          paddlePool.add(id);
        });
        onUnmount(() => {
          paddlePool.delete(id);
        });
        return {};
      };
    },
    // 砖块（供重开时统一恢复 enabled）
    brick: () => {
      return (id: EntityId, ctx: Context) => {
        const { onMount, onUnmount } = ctx;
        onMount(() => {
          brickPool.add(id);
        });
        onUnmount(() => {
          brickPool.delete(id);
        });
        return {};
      };
    },
  };

  // update：帧循环中处理各队列（链式事件：处理中向 deps 发射）
  const update = (frame: FrameManager<T>) => {
    if (statePool.size === 0) return;
    const [stateId] = statePool;
    const [paddleId] = paddlePool;

    for (const e of breakQueue.splice(0)) onBreak(frame, e, stateId, deps);
    for (const e of outQueue.splice(0)) onOut(frame, e, stateId, deps);
    for (const _e of launchQueue.splice(0)) onLaunch(frame, stateId, paddleId);
    for (const e of clickQueue.splice(0)) onClick(frame, e, stateId);
    for (const _e of restartQueue.splice(0)) onRestart(frame, stateId, brickPool);
  };

  return { enter, emit, update };
}

/** 击碎：禁用砖块 + 球加速 + 加分；分数满则胜利（链式发射 win） */
function onBreak(
  frame: FrameManager<BreakoutEntity>,
  payload: BreakPayload,
  stateId: EntityId,
  deps: RuleDeps,
) {
  const b = frame(payload.id);
  if (!b || !b.enabled) return; // 幂等：已被击碎（同帧多球撞击）

  frame(payload.id, (v) => {
    v.enabled = false;
  });
  frame(payload.by, (v) => {
    v.vx *= 1.02;
    v.vy *= 1.02;
  });

  frame(stateId, (s) => {
    s.score += payload.points;
    if (s.score >= MAX_SCORE && s.state !== "win") {
      s.state = "win";
      deps.win({});
    }
  });
}

/** 出界：按 dataId 声明式销毁该球；球全没则减命，生命耗尽失败（链式发射 lose） */
function onOut(
  frame: FrameManager<BreakoutEntity>,
  payload: OutPayload,
  stateId: EntityId,
  deps: RuleDeps,
) {
  const s = frame(stateId);
  if (!s || s.state !== "running") return; // 非运行状态不处理出界

  const b = frame(payload.id);
  if (!b) return;

  frame(stateId, (v) => {
    // 数组整体替换（写时拷贝是浅拷贝：原地修改不产生新引用，信号不传播）
    v.balls = v.balls.filter((item) => item.id !== b.dataId);
    if (v.balls.length === 0) {
      v.lives -= 1;
      if (v.lives <= 0) {
        v.state = "lose";
        deps.lose({});
      } else {
        v.state = "ready";
      }
    }
  });
}

/** 发球：ready 且无球时，从挡板上方生成第一个球 */
function onLaunch(frame: FrameManager<BreakoutEntity>, stateId: EntityId, paddleId?: EntityId) {
  if (!paddleId) return;
  const s = frame(stateId);
  if (!s || s.state !== "ready" || s.balls.length > 0) return;

  const p = frame(paddleId);
  if (!p) return;
  const angle = (Math.random() - 0.5) * (Math.PI / 3);

  frame(stateId, (v) => {
    v.balls = [
      ...v.balls,
      createBall(
        p.x + (p.w - BALL_SIZE) / 2,
        p.y - BALL_SIZE - 2,
        Math.sin(angle) * BALL_SPEED,
        -Math.cos(angle) * BALL_SPEED,
      ),
    ];
    v.state = "running";
  });
}

/** 点击：运行中生成一个奖励球（多球玩法，演示声明式实体创建） */
function onClick(frame: FrameManager<BreakoutEntity>, payload: ClickPayload, stateId: EntityId) {
  const s = frame(stateId);
  if (!s || s.state !== "running") return;

  const angle = Math.random() * Math.PI * 2;
  frame(stateId, (v) => {
    v.balls = [
      ...v.balls,
      createBall(payload.x, payload.y, Math.cos(angle) * BALL_SPEED, Math.sin(angle) * BALL_SPEED),
    ];
  });
}

/** 重开：重置状态实体 + 遍历砖块池恢复 enabled */
function onRestart(
  frame: FrameManager<BreakoutEntity>,
  stateId: EntityId,
  brickPool: Set<EntityId>,
) {
  frame(stateId, (v) => {
    v.balls = [];
    v.score = 0;
    v.lives = LIVES;
    v.state = "ready";
  });
  for (const id of brickPool) {
    frame(id, (b) => {
      b.enabled = true;
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 音效系统（表现系统：事件驱动的副作用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 表现系统：闭包队列 + emit 方法，update 中匹配播放音效（纯副作用，不修改数据） */
export function createSoundSystem(play: (name: SoundName) => void) {
  const hitQueue: BreakPayload[] = [];
  const paddleQueue: BouncePayload[] = [];
  const winQueue: WinPayload[] = [];
  const loseQueue: LosePayload[] = [];

  const emit = {
    break: (p: BreakPayload) => hitQueue.push(p),
    bounce: (p: BouncePayload) => paddleQueue.push(p),
    win: (p: WinPayload) => winQueue.push(p),
    lose: (p: LosePayload) => loseQueue.push(p),
  };

  const update = () => {
    if (hitQueue.length > 0) {
      hitQueue.length = 0;
      play("hit");
    }
    if (paddleQueue.length > 0) {
      paddleQueue.length = 0;
      play("paddle");
    }
    if (winQueue.length > 0) {
      winQueue.length = 0;
      play("win");
    }
    if (loseQueue.length > 0) {
      loseQueue.length = 0;
      play("lose");
    }
  };

  return { emit, update };
}
