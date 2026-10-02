// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 系统作者的工具：事件单元
//
// 为什么需要它：一个事件若按「队列 / 发射口 / 处理函数」三处分开写，读代码
// 时要在文件里来回跳——典型的碎片化。把它封成一个定义点后，一个事件就是
// 连续的一块：
//
// ```ts
// const [emitBreak, drainBreak] = createEvent<T, BreakPayload>((p, frame) => {
//   // 处理逻辑全在这里，frame 与外部依赖都可见
// });
// ```
//
// 返回值是**数组**：强制调用处解构命名（`emitBreak` / `drainBreak` 由使用者
// 按语义取），而不是被固定的属性名（`.emit` / `.drain`）绑死。
//
// 这是**系统作者的工具**，不是框架核心——`createGame` 不需要它。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { FrameManager } from "./game";

/**
 * 创建事件单元。
 *
 * - `T`：实体类型（帧管理器上的类型，处理逻辑里 `frame(id)` 读到的就是它）
 * - `P`：payload 类型（`emit` 的参数）
 *
 * ```ts
 * const [emitHit, drainHit] = createEvent<Enemy, { id: EntityId }>((p, frame) => {
 *   const e = frame(p.id);
 *   if (e) e.hp -= 1;
 * });
 *
 * emitHit({ id });        // 任意时刻可发（含 DOM 事件）
 * drainHit(frame);        // 帧循环里按序消费
 * ```
 *
 * `drain` 用 `splice(0)` **取快照后再处理**：处理中新 `emit` 的事件留到下一帧，
 * 避免链式事件在帧内无限展开。
 */
export function createEvent<T extends Record<string, any>, P>(
  handle: (payload: P, frame: FrameManager<T>) => void,
): [emit: (payload: P) => void, drain: (frame: FrameManager<T>) => void] {
  const queue: P[] = [];

  const emit = (payload: P) => {
    queue.push(payload);
  };

  const drain = (frame: FrameManager<T>) => {
    for (const payload of queue.splice(0)) {
      handle(payload, frame);
    }
  };

  return [emit, drain];
}
