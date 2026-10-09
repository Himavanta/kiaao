// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NPC 定义表：每只 NPC 的户口本
//
// 一只 NPC 的知识收在它自己的文件里（`player.ts` / `guest.ts` /
// `guard.ts`），本文件只是索引——装配层查它拿定义。
//
// **为什么用 `Record<Role, NpcDef>` 而不是 `Partial`**：`Role` 来自
// `world` 层的出生点类型，加一个地图符号就会在这里报缺项——忘记给新
// NPC 写户口本会被编译挡住，而不是运行时才发现。
//
// 这与 `actor.module.scss` 的 `.player` / `.guest` / `.guard` 是同一件
// 事的两个面：一个是行为，一个是外观。**外观仍散在样式表里**——这是
// 本层收不掉的（SCSS 模块的边界），已记录。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Random } from "../../world/random";
import type { RoleStateSet } from "../systems/state-types";
import type { NpcRole } from "../types";
import { guard } from "./guard";
import { guest } from "./guest";
import { player } from "./player";
import type { NpcDefs } from "./types";

/** 全部角色的定义。漏一个会被 `Record<Role, …>` 挡住 */
export const actorDefs: NpcDefs = {
  player,
  guest,
  guard,
};

/**
 * 汇总各 NPC 的状态集，供行为系统注入。
 *
 * **聚合在这里而非 `systems/`**：`systems/state-types.ts` 只有契约，
 * 「哪只 NPC 有哪个状态」是 `npcs/` 的知识。组装层调本函数，行为系统
 * 只收到结果——它不认识任何具体的 NPC。
 *
 * 返回类型是完备的 `Record<NpcRole, …>`：**非玩家角色必然有状态机**
 * （玩家由输入驱动，是唯一的例外）。缺了就在此处抛错——把「忘了写户口本」
 * 从「运行时 NPC 站着不动」变成「启动即报」。（编译期的 `Record<Role,
 * NpcDef>` 只能保证「有户口本」，不能保证「户口本里有 states」。）
 */
export function createStates(random: Random): Record<NpcRole, RoleStateSet> {
  const sets = {} as Record<NpcRole, RoleStateSet>;
  for (const [role, def] of Object.entries(actorDefs)) {
    if (role === "player") continue;
    if (!def.states) {
      throw new Error(`NPC "${role}" 缺状态集：非玩家角色必须有 states（见 npcs/${role}.ts）`);
    }
    sets[role as NpcRole] = def.states(random);
  }
  return sets;
}

export { guard, guest, player };
export type { NpcDef, NpcDefs, NpcTraits } from "./types";
