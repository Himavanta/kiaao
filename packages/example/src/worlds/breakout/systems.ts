import type { Emits, EntityId, EventSystem, FrameManager } from "../engine";
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

/** 游戏状态实体字段 */
export type GameStateEntity = {
  balls: BallData[];
  score: number;
  lives: number;
  state: "ready" | "running" | "win" | "lose";
};

/** 游戏状态机 */
export type GameState = GameStateEntity["state"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 事件词汇表（引擎通用词汇 + 游戏词汇）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 打砖块事件词汇表：谁产生什么事件一目了然 */
export type BreakoutEvents = {
  // 引擎系统词汇（碰撞系统发射）
  break: { id: EntityId; by: EntityId; points: number };
  bounce: { id: EntityId; by: EntityId };
  // 引擎系统词汇（边界系统发射）
  out: { id: EntityId };
  // 游戏词汇（组件层发射：键盘/鼠标/按钮）
  launch: {};
  restart: {};
  click: { x: number; y: number };
  // 游戏词汇（规则系统链式发射）
  win: {};
  lose: {};
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 规则系统（事件系统：落地事实为数据）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 规则系统依赖：状态/挡板实体 id（组件注册时收集）、球/砖块实体关联 */
export type RuleDeps = {
  state: { stateId?: EntityId; paddleId?: EntityId };
  ballIds: Map<EntityId, number>;
  brickIds: EntityId[];
};

/**
 * 规则系统：消费事件，落地为实体数据（分数/生命/状态/实体目录）。
 * 链式事件：处理中可再发射（如击碎 → 分数满 → win，同帧完成）。
 */
export function createRuleSystem(deps: RuleDeps): EventSystem<BreakoutEntity, BreakoutEvents> {
  return (frame, events, emits) => {
    for (const e of events) {
      switch (e.type) {
        case "break":
          onBreak(frame, e.payload, deps, emits);
          break;
        case "out":
          onOut(frame, e.payload, deps, emits);
          break;
        case "launch":
          onLaunch(frame, deps);
          break;
        case "click":
          onClick(frame, e.payload, deps);
          break;
        case "restart":
          onRestart(frame, deps);
          break;
      }
    }
  };
}

/** 击碎：禁用砖块 + 球加速 + 加分；分数满则胜利（链式发射 win） */
function onBreak(
  frame: FrameManager<BreakoutEntity>,
  payload: { id: EntityId; by: EntityId; points: number },
  deps: RuleDeps,
  emits: Emits<BreakoutEvents>,
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

  const stateId = deps.state.stateId;
  if (!stateId) return;
  frame(stateId, (s) => {
    s.score += payload.points;
    if (s.score >= MAX_SCORE && s.state !== "win") {
      s.state = "win";
      emits.win({});
    }
  });
}

/** 出界：声明式销毁该球；球全没则减命，生命耗尽失败（链式发射 lose） */
function onOut(
  frame: FrameManager<BreakoutEntity>,
  payload: { id: EntityId },
  deps: RuleDeps,
  emits: Emits<BreakoutEvents>,
) {
  const stateId = deps.state.stateId;
  if (!stateId) return;
  const s = frame(stateId);
  if (!s || s.state !== "running") return; // 非运行状态不处理出界

  const dataId = deps.ballIds.get(payload.id);
  if (dataId === undefined) return;

  frame(stateId, (v) => {
    v.balls = v.balls.filter((b) => b.id !== dataId); // 数组过滤 → Each 卸载 → 实体销毁
    if (v.balls.length === 0) {
      v.lives -= 1;
      if (v.lives <= 0) {
        v.state = "lose";
        emits.lose({});
      } else {
        v.state = "ready";
      }
    }
  });
}

/** 发球：ready 且无球时，从挡板上方生成第一个球 */
function onLaunch(frame: FrameManager<BreakoutEntity>, deps: RuleDeps) {
  const stateId = deps.state.stateId;
  const paddleId = deps.state.paddleId;
  if (!stateId || !paddleId) return;
  const s = frame(stateId);
  if (!s || s.state !== "ready" || s.balls.length > 0) return;

  const p = frame(paddleId);
  if (!p) return;
  const angle = (Math.random() - 0.5) * (Math.PI / 3);

  frame(stateId, (v) => {
    // 数组整体替换（写时拷贝是浅拷贝：原地 push 不产生新引用，信号不传播）
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
function onClick(
  frame: FrameManager<BreakoutEntity>,
  payload: { x: number; y: number },
  deps: RuleDeps,
) {
  const stateId = deps.state.stateId;
  if (!stateId) return;
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

/** 重开：重置状态实体 + 恢复全部砖块 */
function onRestart(frame: FrameManager<BreakoutEntity>, deps: RuleDeps) {
  const stateId = deps.state.stateId;
  if (!stateId) return;
  frame(stateId, (v) => {
    v.balls = [];
    v.score = 0;
    v.lives = LIVES;
    v.state = "ready";
  });
  for (const id of deps.brickIds) {
    frame(id, (b) => {
      b.enabled = true;
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 音效系统（表现系统：事件驱动的副作用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 表现系统：消费事件匹配类型播放音效（纯副作用，不修改数据） */
export function createSoundSystem(
  play: (name: SoundName) => void,
): EventSystem<BreakoutEntity, BreakoutEvents> {
  return (_frame, events) => {
    for (const e of events) {
      if (e.type === "break") play("hit");
      else if (e.type === "bounce") play("paddle");
      else if (e.type === "win") play("win");
      else if (e.type === "lose") play("lose");
    }
  };
}
