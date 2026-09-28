// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 组装层（模块级单例）
//
// 系统实例、游戏实例、全局状态集中在此，其余模块直接 import 引用，
// 零逐层传递。组件只负责运行窗口（start / stop），实例本身常驻。
//
// 一局重置走声明式：替换实体目录信号，见规划文档 4.6。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use } from "kiaao";

import { createGame } from "../engine";
import { createRandom, manor, parseLevel } from "../world";
import { playerEntity } from "./state";
import { createBehaviourSystem } from "./systems/behaviour";
import { createFrameSystem } from "./systems/frame";
import { createInputSystem, readDirection } from "./systems/input";
import { createInteractionSystem } from "./systems/interaction";
import { createLocomotionSystem } from "./systems/locomotion";
import { createNavigationSystem, pathIntent } from "./systems/navigation";
import { createPerceptionSystem } from "./systems/perception";
import type { ActorEntity } from "./types";

// ── 关卡（模块级单例：地图静态，解析一次）────────────────

// 解析结果作为模块常量——地图在关卡生命周期内不变，
// 重置新一局时只替换实体目录，网格无需重建（规划文档 4.6）
export const level = parseLevel(manor);

// 固定种子：NPC 的目的地序列在每次运行时一致，便于对照与调试。
// 换种子时改这一处。
export const random = createRandom(20260928);

// ── 输入（源系统：无 update，事件到即写信号）──────────────

export const input = createInputSystem();

// ── 帧统计（开发期可见帧率与实体数）────────────────────

export const frameSystem = createFrameSystem();

// 实体计数：挂载时加一、卸载时减一，供调试面板订阅。
// 它是全局状态而非实体数据——没有位置，不参与帧循环。
export const entityCount = use(0);

// 视野提示开关：Tab 切换（规划文档 4.7）
export { showVision } from "./state";

// ── 系统实例（按依赖顺序创建）──────────────────────────

export const locomotion = createLocomotionSystem(level.grid);
export const navigation = createNavigationSystem({ grid: level.grid, random });
export const behaviour = createBehaviourSystem({ random });
export const perception = createPerceptionSystem({ grid: level.grid });

// 交互：读玩家实体信号（同时需要位置 / 朝向与 id）
export const interaction = createInteractionSystem({
  interactTicks: input.interactTicks,
  player: () => playerEntity(),
});

// 意图来源按角色分派（组装层路由，不做 if 分支）：
// - 玩家：读输入信号
// - 客人：沿 navigation 给出的路径行走
locomotion.setIntent("player", () => {
  const { dx, dy } = readDirection(input.pressed());
  return { dx, dy, sneaking: input.sneaking() };
});
locomotion.setIntent("guest", (entity) => pathIntent(entity));

// ── 游戏实例（模块级，autostart: false——运行窗口由组件控制）──

// createGame 的参数顺序即帧执行顺序（规划文档 5.1）：
// behaviour 决定状态 → navigation 规划路径 → locomotion 推进位置
// → perception 判定谁看见了谁（放在移动之后，保证判定的是本帧位置）
// → frame 统计放最后（它只计数，无数据依赖）
// createGame 的参数顺序即帧执行顺序（规划文档 5.1）：
// interaction 先处理玩家意图（拾取 / 下药，含中毒倒计时）
// → behaviour 决定状态 → navigation 规划路径 → locomotion 推进位置
// → perception 判定谁看见了谁（放在移动之后，保证判定的是本帧位置）
// → frame 统计放最后（它只计数，无数据依赖）
export const game = createGame<ActorEntity>(
  [
    interaction.update,
    behaviour.update,
    navigation.update,
    locomotion.update,
    perception.update,
    frameSystem.update,
  ],
  { autostart: false },
);

export const { useEntity, start, stop } = game;
