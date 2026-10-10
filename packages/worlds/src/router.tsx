import { lazy } from "kiaao";
import { createRouter } from "kiaao/router";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏 demo 路由
//
// 只含游戏 demo——不含 example 那套 dashboard / 导航。
// 每个 demo 自包含（自己的玩法系统与实体定义），彼此不共享逻辑：
// - gravity-balls/   重力 + 圆形碰撞（自带 systems.ts）
// - breakout/        打砖块（状态即活对象，帧末统一 flush）
// - crowd/           actor 模型实验（闭包状态 + 对象池）
// - flock/           两种范式并排（createPool 共享机制 + createActorSystem 个体行为）
// 四者共用 packages/engine 提供的机制（帧循环、define、池、事件）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const { Router, Link, push, current } = createRouter({
  onRoute(to) {
    if (to === "/") return "/worlds";
  },
  routes: {
    "": ({ RouterView }) => RouterView,
    worlds: lazy(() => import("./index.tsx")),
    "gravity-balls": lazy(() => import("./gravity-balls/index.tsx")),
    breakout: lazy(() => import("./breakout/index.tsx")),
    crowd: lazy(() => import("./crowd/index.tsx")),
    flock: lazy(() => import("./flock/index.tsx")),
  },
});
