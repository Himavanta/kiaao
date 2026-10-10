// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏引擎：帧循环 + 实体 + 系统
//
// 分五个入口：
// - game.ts       核心：帧循环、define、帧管理器、类型
// - pool.ts       系统作者的工具：实体池（**数据归系统**）
// - actor.ts      系统作者的工具：实体方法调用器（**数据归实体**）
// - events.ts     系统作者的工具：事件单元
// - directives.ts 表现层：StyleMemo 指令
//
// 不含具体玩法（移动/边界/碰撞等系统在各自项目里）——那是使用者的选择。
//
// `createPool` 与 `createActorSystem` **对称**：都是「池 + enter + update」，
// 差别只在 update 知不知道要对实体做什么。何时用哪个见
// `docs/game/Kiaao 游戏引擎：范式定位与 Actor 系统.md`。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export { createGame, createDefine } from "./game.ts";
export type { EntityId, EntitySignal, Enter, Definer, FrameManager, Update } from "./game.ts";

export { createPool } from "./pool.ts";
export { createActorSystem } from "./actor.ts";
export type { ActorContext, ActorSystem, HasFrameHook } from "./actor.ts";
export { createEvent } from "./events.ts";
export { StyleMemo } from "./directives.ts";
