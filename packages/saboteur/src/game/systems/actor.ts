// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 实体方法的调用器（实验）
//
// 文档 §三 的判断：OOP 不该进内核，它是一个**普通系统**。本文件就是
// 那个系统——它只做一件事：遍历自己的池，调用实体自己的每帧方法。
//
// **不需要任何新机制**：池用 `createPool`，登记用 `enter`，帧逻辑用
// `update`——与 locomotion / behaviour 同形。
//
// 与那些系统的区别只有一处：**迭代目标「怎么动」不由本系统决定**。
// locomotion 知道每个实体要 `x += vx * dt`；本系统不知道，它只喊一声
// 「到你了」——具体做什么由实体自己的方法定义。这是「异质实体」的
// 组织方式：同质部分（几何、物理）仍走系统，个体部分走方法。
//
// **边界**（与文档 §3.3 一致）：方法只能拥有「没有系统认领的字段」。
// 它读写自己的私有数据时不需要 `frame` —— 闭包捕获 `state` 即可
// （S2 迁移后的活对象语义）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createPool, type FrameManager, type Enter } from "engine";

/**
 * 本系统需要的字段需求：一个可选的每帧方法。
 *
 * 全部字段可选 ⇒ `define` 不强制任何额外字段（交集为空）。
 * 没定义 `onFrame` 的实体也能登记进来，只是不会被调用——
 * 这让「同一套装配流程服务所有 NPC」成为可能。
 */
export type HasFrameHook = {
  /** 每帧被调用一次；由本系统的池遍历触发 */
  onFrame?: () => void;
};

export type ActorSystem = {
  enter: Enter<HasFrameHook>;
  update: (frame: FrameManager<Record<string, unknown>>) => void;
};

export function createActorSystem(): ActorSystem {
  const [pool, enter] = createPool<HasFrameHook>();

  const update = (frame: FrameManager<Record<string, unknown>>) => {
    for (const id of pool) {
      const entity = frame(id) as HasFrameHook | undefined;
      // 无 `onFrame` 的实体静默跳过——它们只是没有个体行为
      entity?.onFrame?.();
    }
  };

  return { enter, update };
}
