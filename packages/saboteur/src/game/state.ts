// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏状态与全局注册表
//
// 判定尺子（ECS 设计文档 5.3）：**有位置、参与帧循环的才是实体；
// 其余是信号**。此处的信号都不参与帧变换，故不建实体。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use } from "kiaao";

import type { EntitySignal } from "../engine";
import type { ActorEntity } from "./types";

/**
 * 游戏阶段。
 *
 * - `playing`：进行中
 * - `won`：达成击杀目标
 * - `caught`：警报满值，警察到场
 * - `timeout`：时限耗尽仍未完成目标
 */
export type Phase = "playing" | "won" | "caught" | "timeout";

/**
 * 全局游戏状态（模块级信号，作为 deps 注入系统）。
 *
 * `timeLeft` 的初值由 `instance.ts` 在模块初始化时按关卡目标写入——
 * 留 0 会让规则系统在第一帧就判 `timeout`。
 */
export const gameState = {
  phase: use<Phase>("playing"),
  /** 已达成的击杀数 */
  kills: use(0),
  /** 剩余时间（秒） */
  timeLeft: use(0),
  /** 本局耗时（秒），结算展示用 */
  elapsed: use(0),
};

/** 重置全局状态。实体目录与警报由各自的持有者重置。 */
export function resetGameState(levelSeconds: number): void {
  gameState.phase("playing");
  gameState.kills(0);
  gameState.timeLeft(levelSeconds);
  gameState.elapsed(0);
}

// ── 视图侧共享状态（不属于游戏逻辑，但需跨组件传递）────────

/** 视锥显示开关（Tab 切换，规划文档 4.7） */
export const showVision = use(false);

/**
 * 玩家实体注册表。
 *
 * 相机需要跟随玩家，但玩家实体在 `Actor` 组件体内创建——组件树无法
 * 向上传出实体信号（框架没有 ref API）。此处作注册表：`Actor` 在
 * `role === "player"` 时写入，相机模块派生读取。
 */
export const playerEntity = use<EntitySignal<ActorEntity> | undefined>(undefined);

/**
 * 全部角色实体注册表（视锥可视化等调试层需要遍历）。
 *
 * 用普通数组而非信号：调试层本就每帧重绘（位置在变），订阅帧计数即可，
 * 集合变化不需要单独驱动。
 */
const actors: EntitySignal<ActorEntity>[] = [];

export function registerActor(entity: EntitySignal<ActorEntity>): () => void {
  actors.push(entity);
  return () => {
    const i = actors.indexOf(entity);
    if (i !== -1) actors.splice(i, 1);
  };
}

/** 当前全部角色实体（只读快照，勿修改） */
export function listActors(): readonly EntitySignal<ActorEntity>[] {
  return actors;
}
