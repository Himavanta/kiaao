import { lazy } from "kiaao";
import { createRouter } from "kiaao/router";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏 demo 路由
//
// 只含游戏 demo——不含 example 那套 dashboard / 导航。
// 每个 demo 自包含（有自己的引擎用法与玩法），彼此不共享逻辑：
// - engine/          旧 ECS 引擎（bouncing-boxes、gravity-balls 使用）
// - breakout/        对象池改写版（状态即活对象，帧末统一 flush）
// - crowd/           actor 模型实验（闭包状态 + 对象池）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const { Router, Link, push, current } = createRouter({
  onRoute(to) {
    if (to === "/") return "/worlds";
  },
  routes: {
    "": ({ RouterView }) => RouterView,
    worlds: lazy(() => import("./worlds/index.tsx")),
    "bouncing-boxes": lazy(() => import("./worlds/bouncing-boxes/index.tsx")),
    "gravity-balls": lazy(() => import("./worlds/gravity-balls/index.tsx")),
    breakout: lazy(() => import("./worlds/breakout/index.tsx")),
    crowd: lazy(() => import("./worlds/crowd/index.tsx")),
  },
});
