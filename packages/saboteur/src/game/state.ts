// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 全局状态与实体注册表
//
// 判定尺子（ECS 设计文档 5.3）：**有位置、参与帧循环的才是实体；
// 其余是信号**。此处的信号都不参与帧变换，故不建实体。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use } from "kiaao";

import type { EntitySignal } from "../engine";
import type { ActorEntity } from "./types";

/**
 * 玩家实体注册表。
 *
 * 相机需要跟随玩家，但玩家实体在 `Actor` 组件体内创建——组件树无法
 * 向上传出实体信号（框架没有 ref API）。此处作注册表：`Actor` 在
 * `role === "player"` 时写入，相机模块派生读取。
 *
 * 初始为 undefined：相机此时退到出生点回退值。玩家注册后触发重算，
 * 但因两者坐标相同（都来自出生点），值不变故不产生 DOM 写入。
 */
export const playerEntity = use<EntitySignal<ActorEntity> | undefined>(undefined);

/**
 * 全部角色实体注册表（视锥可视化等调试层需要遍历）。
 *
 * 用普通数组而非信号：调试层本就每帧重绘（位置在变），订阅帧计数
 * 即可，集合变化不需要单独驱动。若将来有别的消费者需要响应式地
 * 感知「角色增减」，再把它改成信号。
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

/** 视锥显示开关（Tab 切换，规划文档 4.7） */
export const showVision = use(false);
