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

import type { EntityId, Enter } from "./index";

/**
 * 创建实体池。
 *
 * ```ts
 * // 全部实体
 * const [pool, enter] = createPool<BoundedEntity>();
 *
 * // 只收移动的（`accept` 在**登记时**筛选，不入池的实体在帧循环里根本不出现）
 * const [movers, enterMovers] = createPool<Movable>((s) => s.moving);
 * const [statics, enterStatics] = createPool<Movable>((s) => !s.moving);
 *
 * // update 内：for (const id of pool) …
 * ```
 *
 * 返回 `[池, 登记函数]`：池用于遍历，登记函数交给 `define`。
 */
export function createPool<N = Record<string, unknown>>(
  accept?: (state: N) => boolean,
): [pool: Set<EntityId>, enter: Enter<N>] {
  const ids = new Set<EntityId>();

  const enter: Enter<N> = (id, ctx, state) => {
    // 不接受的实体根本不登记——既不进池，也不挂生命周期钩子
    if (accept && !accept(state)) return;

    ctx.onMount(() => {
      ids.add(id);
    });
    ctx.onUnmount(() => {
      ids.delete(id);
    });
  };

  return [ids, enter];
}
