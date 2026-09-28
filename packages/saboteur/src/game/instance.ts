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
import { manor, parseLevel } from "../world";
import { createFrameSystem } from "./systems/frame";
import { createScaffoldSystem } from "./systems/scaffold";
import type { ActorEntity } from "./types";

// ── 关卡（模块级单例：地图静态，解析一次）────────────────

// 解析结果作为模块常量——地图在关卡生命周期内不变，
// 重置新一局时只替换实体目录，网格无需重建（规划文档 4.6）
export const level = parseLevel(manor);

// ── 帧统计（开发期可见帧率与实体数）────────────────────

export const frameSystem = createFrameSystem();

// 实体计数：挂载时加一、卸载时减一，供调试面板订阅。
// 它是全局状态而非实体数据——没有位置，不参与帧循环。
export const entityCount = use(0);

// ── 系统实例（按依赖顺序创建）──────────────────────────

// 【M0 脚手架】圆周运动，用于打通渲染通路；M2 落地时替换为 locomotion
export const scaffold = createScaffoldSystem();

// ── 游戏实例（模块级，autostart: false——运行窗口由组件控制）──

// createGame 的参数顺序即帧执行顺序
export const game = createGame<ActorEntity>([scaffold.update, frameSystem.update], {
  autostart: false,
});

export const { useEntity, start, stop } = game;
