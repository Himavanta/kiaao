// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NPC 定义（「户口本」）的契约
//
// 起因：一个 NPC 的知识散在 8 处，读全一只保镖要翻 7 个文件、13 个 import
// 节点（实测）。这个接口的用途是让「一只 NPC 是什么」能写在一个文件里。
//
// **它不是 OOP 的类**——定义是**数据 + 少量函数**，装配流程仍由
// `views/actor.tsx` 统一执行。区别在「谁知道什么」：装配流程知道**机制**
// （要凑哪些字段、跑哪些系统），定义只知道**这只 NPC 的参数**。
//
// 与 ECS 的分工不变：
// - 系统仍按机制横向切（locomotion 管所有实体的位移）
// - 定义按单位纵向聚（guard 的速度、视距、状态、岗位、私有记忆在一处）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Cell } from "../../world";
import type { Random } from "../../world/random";
import type { RoleStateSet } from "../systems/state-types";
import type { ActorEntity, Role } from "../types";

/**
 * 出生参数：这一只 NPC 的「数值」。
 *
 * 原来住在 `views/actor.tsx` 的 `ACTOR_TRAITS` 表里——一张表同时装着
 * 三种角色的数值，想改保镖的速度得先知道表在视图层。
 */
export type NpcTraits = {
  /** 基础移动速度（px/s） */
  speed: number;
  /** 视距（px）；省略则用感知系统的默认值 */
  sightRange?: number;
};

/**
 * 一只 NPC 的完整定义。
 *
 * 全部字段都是「这只 NPC 自己的知识」，不含共享机制。
 *
 * **注册哪些系统不在这里声明**：本层不认识任何系统实例（`instance.ts`
 * 是组装单例，定义层反向依赖它是一个坏的环）。改为**由能力推导**：
 * 有 `states` 就会注册状态机、有 `decorate` 就会注册方法调用器。
 * 规则写在装配层（`views/actor.tsx`），本层只声明能力。
 */
export type NpcDef = {
  /** 数值：速度、视距 */
  traits: NpcTraits;

  /**
   * 状态集（默认态 + 拥有的状态）。
   *
   * 省略表示这只 NPC 不跑状态机（玩家由输入驱动）。拥有它会自动注册
   * `behaviour.enter`——状态机是「有状态集」这件事的机制面。
   */
  states?: (random: Random) => RoleStateSet;

  /**
   * 升格基础 state：挂上这只 NPC 私有的字段与方法。
   *
   * 缺省即原样返回。返回类型是 `ActorEntity`——私有字段（如保镖的
   * `seen`）在类型上被擦除，只有测试用交叉类型取回。这是有意的：
   * 注册表与调试层只需要共享字段。
   *
   * 拥有它会自动注册方法调用器（`actor.enter`）——私有方法需要有东西
   * 每帧去「喊一声」，这是方法能跑起来的机制面。
   */
  decorate?: (base: ActorEntity) => ActorEntity;

  /**
   * 岗位（格）。
   *
   * 只有「在岗」的 NPC 才需要（保镖巡逻不离开岗位）。省略表示无岗位。
   * 返回 `null` 也表示无——便于写「非某条件时无岗」的规则。
   */
  post?: (col: number, row: number) => Cell | null;
};

/** 全部 NPC 定义：按角色查它的户口本 */
export type NpcDefs = Record<Role, NpcDef>;
