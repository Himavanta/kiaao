// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 保镖：一份「只属于这个 NPC」的私有数据与方法（实验）
//
// 这个文件是为了**验证一件事**：state 上能否承载「只属于某类 NPC 的
// 跨帧数据 + 行为」，而不需要动任何系统。
//
// 内容：保镖记住自己见过谁。这是**它自己的知识**——
// - 数据来自 `visibleIds`（perception 写的），但那只是「此刻看得见谁」，
//   看一眼就忘了；本模块把它变成「见过谁」的持久记忆。
// - 读写全在自己身上，不看别人 ⇒ 落在文档「方法只能拥有没有系统认领的
//   字段」的范围内（§3.3）。
//
// **代价（未解决）**：`seen` 是嵌套容器（`Map`），而引擎的能力文档
// §3.3 记过「原地改嵌套只靠每帧全量提交兜底」。本方法依赖那个现状——
// 若将来做选择性提交，`seen.set()` 的改动可能不再被检测到。
//
// **方法不需要 `frame` 参数**——它闭包捕获 `state` 本身
// （S2 迁移后的活对象语义）。这是本实验最关心的点。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { EntityId } from "engine";

import type { ActorEntity } from "../types";

/**
 * 保镖实体的扩展类型：共享字段 + 它私有的字段与方法。
 *
 * 用交叉类型而非改 `ActorEntity`——后者是**所有**角色的共享类型，
 * 往里加只有保镖用的字段会让它重新膨胀（文档 §5.2 的教训）。
 */
export type GuardEntity = ActorEntity & {
  /** 【保镖私有】见过的实体 → 首次见到的累计帧数 */
  seen: Map<EntityId, number>;
  /** 【保镖私有】见过某人吗 */
  hasSeen: (id: EntityId) => boolean;
  /** 【保镖私有】每帧钩子：把「此刻可见」并入「曾经见过」 */
  onFrame: () => void;
};

/**
 * 把一份基础 state 升格为保镖实体。
 *
 * **形态即验证点**：方法闭包捕获 `state`（不是 `this`、不需要 `frame`）。
 * 这与 S2 迁移后的活对象语义一致——`state` 是长期存在的同一个对象，
 * 系统通过 `frame(id)` 拿到的就是它。
 *
 * 用 `this` 的写法在某些调用路径下会指向浅拷贝（`define` 会把 state 拷给
 * 渲染信号），故本文件一律用闭包（与文档 §8.2 的约定一致）。
 */
export function createGuardState(base: ActorEntity): GuardEntity {
  const state = { ...base } as GuardEntity;

  let frameCount = 0;
  state.seen = new Map<EntityId, number>();

  state.hasSeen = (id) => state.seen.has(id);

  state.onFrame = () => {
    frameCount += 1;
    // 读**自己**的 visibleIds（perception 写的）——不看别人
    for (const id of state.visibleIds) {
      if (state.seen.has(id)) continue;
      state.seen.set(id, frameCount);
    }
  };

  return state;
}
