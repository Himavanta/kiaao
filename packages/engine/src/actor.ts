// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 系统作者的工具：实体方法调用器
//
// 与 `createPool` **对称**：两者都是「一个池 + 一个 `enter` + 一个 `update`」，
// 差别只有一处——
//
//   createPool 的 `update` **知道**要对实体做什么（如 `x += vx * dt`）
//   本系统的 `update` **不知道**，它只喊一声「到你了」，
//   做什么由实体自己的方法（`onFrame`）定义
//
// 这是「异质实体」的组织方式：**同质部分走系统，个体部分走方法**。
// 位移、寻路、感知这类「一份代码服务所有实体」的机制该用 `createPool`；
// 私有记忆、个体计时这类「只有个别实体有」的行为该用本系统。
//
// ```ts
// // 实体侧（组件里组合）
// const state = {
//   ...base,
//   seen: new Map(),
//   onFrame() { /* 读自己的字段，写自己的记忆 */ },
// };
// define(ctx, locomotion.enter, actor.enter)(state);
// ```
//
// **边界：本系统不负责阶段顺序。** 它按池逐个调用实体——即「实体优先」。
// 若某行为需要「所有实体先做完 A、再统一做 B」（如感知必须在移动之后），
// 那必须用多个 `createPool` 按阶段遍历，而不是塞进同一个 `onFrame`。
// 理由见 `docs/game/Kiaao 游戏引擎：范式定位与 Actor 系统.md` §二。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Enter, FrameManager, Update } from "./game.ts";
import { createPool } from "./pool.ts";

/**
 * 每帧传给实体方法的上下文。
 *
 * **为什么是对象而不是 `(frame, delta)` 两个参数**：对象可扩展。将来若需要
 * 加 `elapsed` / `random` 之类，加一个字段即可，不必改所有方法的签名。
 *
 * **为什么只有这两样**：方法由使用者创建（在组件的 `decorate` 里），它可以
 * 闭包捕获任何外部依赖。唯独「帧管理器」与「本帧时长」拿不到——时间在流逝，
 * 帧管理器由引擎持有，这两样只能由引擎交出来。给这两样就够，且不多。
 */
export type ActorContext<T extends Record<string, any> = Record<string, any>> = {
  /** 实体访问入口：读写自己的活对象，或按 id 读别人 */
  frame: FrameManager<T>;
  /** 本帧时长（秒），已由引擎钳制上限 */
  delta: number;
};

/**
 * 本系统需要的字段需求。
 *
 * `onFrame` **可选** ⇒ 交集为空，`define` 不因此强制任何额外字段。
 * 没有 `onFrame` 的实体也能登记进来，只是不会被调用——这让「同一套装配
 * 流程服务所有实体」成为可能：组件决定挂不挂 `actor.enter`，而非要求
 * 所有实体都实现方法。
 */
export type HasFrameHook<T extends Record<string, any> = Record<string, any>> = {
  /** 每帧被调用一次；由本系统的池遍历触发 */
  onFrame?: (ctx: ActorContext<T>) => void;
};

export type ActorSystem<T extends Record<string, any> = Record<string, any>> = {
  enter: Enter<HasFrameHook<T>>;
  update: Update<T>;
};

/**
 * 创建实体方法调用器。
 *
 * **每次调用建自己的池**（与 `createPool` 同理）。模块级常量会让两次
 * `createGame` 共享同一个 `Set<EntityId>`——一处卸载漏了，stale id 就
 * 累积到别处，测试之间互相污染。
 *
 * ```ts
 * const actor = createActorSystem<ActorEntity>();
 * const game = createGame([movement.update, actor.update]);
 * define(ctx, movement.enter, actor.enter)(state);
 * ```
 */
export function createActorSystem<
  T extends Record<string, any> = Record<string, any>,
>(): ActorSystem<T> {
  const [pool, enter] = createPool<HasFrameHook<T>>();

  const update: Update<T> = (frame, delta) => {
    // 上下文每帧建一次：它与实体无关（frame 是同一个函数、delta 同一个数），
    // 逐个实体重建 N 份是「假装它们不一样」。**约定：把它当只读**——
    // 改它会影响同帧的其他实体。
    const ctx: ActorContext<T> = { frame, delta };

    for (const id of pool) {
      const entity = frame(id) as HasFrameHook<T> | undefined;
      // 无 `onFrame` 的实体静默跳过——它们只是没有个体行为
      entity?.onFrame?.(ctx);
    }
  };

  return { enter, update };
}
