// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 实体池：把「池」与「登记函数」封为一体
//
// 为什么封在一起：两者必须严格配对。`onMount` 进池、`onUnmount` 出池，
// 写错一个就是**实体泄漏**（实体已卸载，但池里还留着它的 id，下一帧读
// 它是 undefined）。把配对关系收进工厂后，这类遗漏在结构上不可能发生。
//
// 池是**系统作者的工具**，不是框架核心——`createGame` 不需要它。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { EntityId, Enter } from "./index";

/**
 * 实体池：登记注册、按需遍历。
 *
 * ```ts
 * const pool = createPool<BoundedEntity>();          // 全部实体
 * const movers = createPool<Movable>((s) => s.moving); // 只收 moving 的
 * const still = createPool<Movable>((s) => !s.moving); // 另一侧
 *
 * const enter = pool.enter;                           // 交给 define
 * // update 内：for (const id of pool.ids) …
 * ```
 *
 * `accept` 是**登记时的筛选**（不是遍历时过滤）——不入池的实体在帧循环里
 * 根本不出现，零开销。缺少它时收下全部。
 */
export type Pool<N> = {
  enter: Enter<N>;
  /** 池中 id（可迭代，直接用于 `for … of`） */
  ids: Set<EntityId>;
  /** 池内实体数（实时读取，非快照） */
  readonly size: number;
};

export function createPool<N = Record<string, unknown>>(accept?: (state: N) => boolean): Pool<N> {
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

  return {
    enter,
    ids,
    get size() {
      return ids.size;
    },
  };
}
