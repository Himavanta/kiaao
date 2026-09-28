// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 引擎类型：实体标识 / 实体信号 / 帧管理器 / 系统更新函数
// 平台无关，不依赖 world/ 与 game/
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Signal } from "kiaao";

/** 实体标识：Symbol 天然唯一，全链路统一使用 */
export type EntityId = symbol;

/** 实体信号：组件的绑定句柄，id 为帧循环身份（挂在信号上） */
export type EntitySignal<T> = Signal<T> & { id: EntityId };

/**
 * 帧管理器：单函数双签名，实体结构 T 由各系统切片合并决定。
 * - frame(id)     读：缓存优先，无缓存取信号当前值，不拷贝
 * - frame(id, fn) 写：首次写时拷贝信号值入缓存，fn 原地修改副本（写时拷贝）
 */
export type FrameManager<T extends Record<string, any> = Record<string, any>> = {
  (id: EntityId): Readonly<T> | undefined;
  (id: EntityId, mutate: (value: T) => void): void;
};

/** 系统更新函数：帧逻辑入口（createGame 参数顺序即执行顺序） */
export type Update<T extends Record<string, any> = Record<string, any>> = (
  frame: FrameManager<T>,
  delta: number,
) => void;
