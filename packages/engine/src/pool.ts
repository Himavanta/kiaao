// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 系统作者的工具：实体池
//
// 为什么与 enter 封在一起：两者必须严格配对。`onMount` 进池、`onUnmount` 出池，
// 写错一个就是**实体泄漏**（实体已卸载，但池里还留着它的 id，下一帧读它是
// `undefined`，被 `!` 断言时崩掉或静默跳过）。把配对关系收进工厂后，这类
// 遗漏在结构上不可能发生。
//
// 返回值是**数组**：强制调用处解构命名（`const [pool, enter] = ...`），
// 名字由使用者按语义取，而不是被固定的属性名绑死。
//
// 这是**系统作者的工具**，不是框架核心——`createGame` 不需要它。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { EntityId, Enter } from "./game";

/**
 * 创建实体池：收下所有登记到它的实体。
 *
 * ```ts
 * const [pool, enter] = createPool<BoundedEntity>();
 *
 * // update 内：for (const id of pool) …
 * ```
 *
 * **没有筛选参数**。「哪个实体属于哪个池」由 `define(...)` 里列了哪个
 * `enter` 决定——那是显式可见的；靠字段谓词筛选则是隐藏的（且只在登记时
 * 求值一次，看起来像响应式其实不是）。
 *
 * 若同一类实体需要分成两组（如碰撞的动体 / 静止障碍），**建两个池、
 * 导出两个 enter**，由调用处各取所需。
 */
export function createPool<N = Record<string, unknown>>(): [pool: Set<EntityId>, enter: Enter<N>] {
  const ids = new Set<EntityId>();

  const enter: Enter<N> = (id, ctx) => {
    ctx.onMount(() => {
      ids.add(id);
    });
    ctx.onUnmount(() => {
      ids.delete(id);
    });
  };

  return [ids, enter];
}
