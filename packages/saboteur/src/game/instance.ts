// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 组装层（模块级单例）
//
// 系统实例、游戏实例、全局状态集中在此，其余模块直接 import 引用，
// 零逐层传递。组件只负责运行窗口（start / stop），实例本身常驻。
//
// 一局重置走声明式：替换实体目录信号，见规划文档 4.6。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createGame } from "engine";
import { use } from "kiaao";

import { createRandom, manor } from "../world";
import { parseLevel } from "./level";
import { createStates } from "./npcs";
import { resetGameState } from "./state";
import { playerEntity } from "./state";
import { createActorSystem } from "./systems/actor";
import { createAlarmSystem } from "./systems/alarm";
import { createBehaviourSystem } from "./systems/behaviour";
import { createFrameSystem } from "./systems/frame";
import { createInputSystem, readDirection } from "./systems/input";
import { createInteractionSystem } from "./systems/interaction";
import { createLocomotionSystem } from "./systems/locomotion";
import { createNavigationService, pathIntent } from "./systems/navigation";
import { createPerceptionSystem } from "./systems/perception";
import { createRulesSystem } from "./systems/rules";
import type { ActorEntity } from "./types";

// ── 关卡（模块级单例：地图静态，解析一次）────────────────

// 解析结果作为模块常量——地图在关卡生命周期内不变，
// 重置新一局时只替换实体目录，网格无需重建（规划文档 4.6）
export const level = parseLevel(manor);

// 固定种子：NPC 的目的地序列在每次运行时一致，便于对照与调试。
// 换种子时改这一处。
export const random = createRandom(20260928);

// 时限初值：必须在这里写入，否则规则系统会在第一帧就判 timeout
resetGameState(level.objective.timeLimit);

// ── 输入（源系统：无 update，事件到即写信号）──────────────

export const input = createInputSystem();

// ── 帧统计（开发期可见帧率与实体数）────────────────────

export const frameSystem = createFrameSystem();

// 实体方法调用器（实验）：只负责喊「到你了」，做什么由实体自己定义
export const actor = createActorSystem();

// 实体计数：挂载时加一、卸载时减一，供调试面板订阅。
// 它是全局状态而非实体数据——没有位置，不参与帧循环。
export const entityCount = use(0);

// 注意：**不转发 `state.ts` 的符号**。
//
// 以前这里有一行 `export { resetGameState, showVision } from "./state"`，
// 于是同一个东西有两个入口（`instance` 与 `state`），调用方两边都在用：
// `resetGameState` 走 instance、`showVision` 走 state。
//
// 边界应当是：**全局状态归 `state.ts`，系统与游戏实例归本文件**。
// 需要状态就从 `./state` 导入，不要绕经组装层。

// ── 系统实例（按依赖顺序创建）──────────────────────────

export const locomotion = createLocomotionSystem(level.grid);
// navigation 是**服务**（不读 mood、不知道自己被谁调用）
export const navigation = createNavigationService({ grid: level.grid, random });
// behaviour 是**状态机驱动**：具体行为在各 NPC 的户口本里
// （`npcs/*.ts`），由组装层汇总后注入——它本层不认识任何具体 NPC
export const behaviour = createBehaviourSystem({
  random,
  navigation,
  states: createStates(random),
});
export const perception = createPerceptionSystem({ grid: level.grid });
// alarm 只报告事实，恐慌切换由 behaviour 执行（注入回调，避免循环依赖）
export const alarm = createAlarmSystem({ onPanic: behaviour.panic });

// 交互：读玩家实体信号（同时需要位置 / 朝向与 id）
export const interaction = createInteractionSystem({
  interactTicks: input.interactTicks,
  player: () => playerEntity(),
});

// 意图来源按**驱动方式**分派（组装层路由，不做 if 分支）：
// - 玩家：读输入信号
// - NPC：沿 navigation 给出的路径行走
//
// 注意这里分的是「怎么驱动」而不是「哪种 NPC」——只有两种驱动方式，
// 所以新增 NPC 类型**不需要改这里**（S3 收口的发现）。
locomotion.setIntent("player", () => {
  const { dx, dy } = readDirection(input.pressed());
  return { dx, dy, sneaking: input.sneaking() };
});
locomotion.setIntent("npc", (entity) => pathIntent(entity));

// ── 游戏实例（模块级，autostart: false——运行窗口由组件控制）──

// createGame 的参数顺序即帧执行顺序（规划文档 5.1）：
// behaviour 决定状态 → navigation 规划路径 → locomotion 推进位置
// → perception 判定谁看见了谁（放在移动之后，保证判定的是本帧位置）
// → frame 统计放最后（它只计数，无数据依赖）
// createGame 的参数顺序即帧执行顺序（规划文档 5.1）：
// interaction 先处理玩家意图（拾取 / 下药，含中毒倒计时）
// → behaviour 决定状态 → navigation 规划路径 → locomotion 推进位置
// → perception 判定谁看见了谁（放在移动之后，保证判定的是本帧位置）
// → alarm 消费本轮的 visibleIds 产生恐慌（必须紧跟 perception）
// → frame 统计放最后（它只计数，无数据依赖）
export const game = createGame<ActorEntity>(
  [
    interaction.update,
    // behaviour 内含「决策 + 规划 + 移动推进」：它驱动状态对象，
    // 状态通过 navigation 服务算路径。因此 navigation 不在帧流水线里。
    behaviour.update,
    locomotion.update,
    // 实体自己的每帧钩子：放在移动之后（它读的是本帧最终位置）
    actor.update,
    perception.update,
    alarm.update,
    // rules 放最后：它读本轮结束时的击杀数与警报值判终局，
    // 放在前面会用上一帧的数据
    (_frame, delta) => rules.update(delta),
    frameSystem.update,
  ],
  { autostart: false },
);

export const { define, frame, start, stop } = game;

// ── 规则与重开 ─────────────────────────────────────────

/**
 * 一局的身份。递增即表示「新的一局」——视图层把它并入 `Each` 的 key，
 * 于是所有角色被卸载重建，实体池随 `onUnmount` 自然清空。
 *
 * 这是声明式重置（规划文档 4.6）：不调用 `dispose`（它清空池后没有恢复
 * 入口），而是让声明式生灭机制完成重建。
 */
export const runId = use(0);

/**
 * 开始新的一局。
 *
 * 帧循环的重启必须在这里完成，不能指望「组件重建时会 start」——
 * `start()` 只在根组件 `onMount` 时执行一次，而递增 `runId` 只重建
 * `Each` 的子项，根组件不会重新挂载。少了这一步，重开后画面会冻在
 * 终局那一帧（既有缺陷，见迁移文档 §3.2）。
 */
function restartRun(): void {
  // 先停帧循环：重建期间不该跑帧（否则会读到半旧的实体状态）
  stop();
  // 警报与全局状态归零
  alarm.reset();
  resetGameState(level.objective.timeLimit);
  // 递增局号：视图层的 Each 会同步重建全部角色与道具
  // （实测：这是同步完成的，重建后所有实体已入池）
  runId(runId() + 1);
  // 重建已完成，恢复帧循环。放在最后：前面若是 start 再重建，
  // 首帧会读到正在被卸载的旧实体
  start();
}

export const rules = createRulesSystem({
  objective: level.objective,
  stop,
  alarm: () => alarm.alarm(),
  onRestart: restartRun,
});
