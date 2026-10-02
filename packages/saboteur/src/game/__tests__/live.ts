// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 测试用：拿到实体的**活对象**
//
// 实体信号（`listActors()` / `playerEntity()` 给出的）只承载**渲染快照**——
// 它由帧末 `flush` 提交，测试不跑引擎帧循环时读它是旧值。要布置状态或
// 断言系统读写的数据，必须拿活对象，入口是 `frame(id)`。
//
// 这个模块单独存在（而非放进 `helpers.ts`）：`helpers.ts` 是给自建
// `mountActor` 的单元测试用的，不应连带把整个 App（模块级单例、关卡解析）
// 载入。只有真实 App 的端到端测试才需要本文件。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { frame } from "../instance";
import type { ActorEntity } from "../types";

/**
 * 实体信号 → 活对象。
 *
 * 读回来的**不是副本**：直接改它即改系统看到的数据。
 * 实体不在池里时返回 `undefined`（已卸载，或尚未挂载）。
 */
export function live(entity: { id: symbol }): ActorEntity {
  const state = frame(entity.id);
  if (!state) throw new Error("实体不在池里：已卸载或尚未挂载");
  return state;
}

/** 布置实体状态（合并写入，同 `Object.assign`） */
export function setState(entity: { id: symbol }, patch: Partial<ActorEntity>): void {
  Object.assign(live(entity), patch);
}
