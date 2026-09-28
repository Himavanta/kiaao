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
 *
 * 注意：玩家若被卸载（如切关卡），此处会留下已销毁的信号。
 * M7 重开流程需要显式清空，届时补上。
 */
export const playerEntity = use<EntitySignal<ActorEntity> | undefined>(undefined);
