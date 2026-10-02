// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏引擎：帧循环 + 实体 + 系统
//
// 分三个层次：
// - game.ts       核心：帧循环、define、帧管理器、类型
// - pool.ts       系统作者的工具：实体池
// - events.ts     系统作者的工具：事件单元
// - directives.ts 表现层：StyleMemo 指令
//
// 不含具体玩法（移动/边界/碰撞等系统在各自项目里）——那是使用者的选择。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export { createGame, createDefine } from "./game.ts";
export type { EntityId, EntitySignal, Enter, Definer, FrameManager, Update } from "./game.ts";

export { createPool } from "./pool.ts";
export { createEvent } from "./events.ts";
export { StyleMemo } from "./directives.ts";
