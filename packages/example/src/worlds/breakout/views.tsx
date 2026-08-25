import { Show, type Context, type Signal } from "kiaao";

import { StyleMemo } from "../engine/directives";
import type { Bounds } from "../engine/systems";
import { boundary, collision, gameState, input, movement, rules, useEntity } from "./game-instance";
import {
  ARENA_H,
  ARENA_W,
  BALL_SIZE,
  MAX_SCORE,
  PADDLE_H,
  PADDLE_W,
  type BallData,
  type BreakoutEntity,
  type GameState,
} from "./systems";

const PADDLE_BOUNDS: Bounds = { left: "clamp", right: "clamp", top: "pass", bottom: "pass" };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 球实体组件：声明式生命周期的承载者（数组驱动挂载/卸载）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type BallProps = {
  data: BallData;
};

/** 球：动态实体（数组项生成/过滤时挂载/卸载），只注册 + 渲染，无游戏逻辑 */
function Ball({ data }: BallProps, ctx: Context) {
  const { use } = ctx;

  // dataId 关联球实体目录数组项（规则系统出界时按此销毁）
  const entity = useEntity(
    ctx,
    () => ({ dataId: data.id }),
    movement.enter({ x: data.x, y: data.y, vx: data.vx, vy: data.vy }),
    boundary.enter({
      w: BALL_SIZE,
      h: BALL_SIZE,
      bounds: { left: "bounce", right: "bounce", top: "bounce", bottom: "die" },
    }),
    collision.enter({ moving: true, shape: "circle" }),
  );

  return (
    <StyleMemo
      value={{
        position: "absolute",
        borderRadius: "9999px",
        background: "radial-gradient(circle at 35% 30%, #f8fafc, #cbd5e1 60%, #94a3b8)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
        width: use(entity, () => `${entity().w}px`),
        height: use(entity, () => `${entity().h}px`),
        translate: use(entity, () => `${entity().x}px ${entity().y}px`),
      }}
    >
      <div />
    </StyleMemo>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 挡板视图：注册自己的实体（注册 + 渲染同处，生命周期 = 组件生命周期）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PaddleView(_: Record<string, never>, ctx: Context) {
  const { use } = ctx;

  // 挡板实体在拥有它的组件内注册（声明式生命周期：球在 Ball、砖在 Brick、挡板在此）
  // 顺带 enter 输入系统：借用 ctx 钩子挂载/移除键盘监听（随游戏运行窗口）
  const paddle = useEntity(
    ctx,
    rules.enter.paddle(),
    input.enter(),
    movement.enter({ x: (ARENA_W - PADDLE_W) / 2, y: ARENA_H - 48, vx: 0, vy: 0 }),
    boundary.enter({ w: PADDLE_W, h: PADDLE_H, bounds: PADDLE_BOUNDS }),
    collision.enter({ moving: false, shape: "rect", drive: 0.5 }),
  );

  return (
    <>
      <StyleMemo
        value={{
          position: "absolute",
          borderRadius: "8px",
          background: "linear-gradient(180deg, #94a3b8, #64748b)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          width: use(paddle, () => `${paddle().w}px`),
          height: use(paddle, () => `${paddle().h}px`),
          translate: use(paddle, () => `${paddle().x}px ${paddle().y}px`),
        }}
      >
        <div />
      </StyleMemo>
      <ReadyBall paddle={paddle} />
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 待发球：ready 状态显示的虚拟球（纯 UI 跟随挡板，无实体）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ReadyBall({ paddle }: { paddle: Signal<BreakoutEntity> }, ctx: Context) {
  const { use } = ctx;

  const isReady = use(gameState.state, () => gameState.state() === "ready");

  return (
    <Show value={isReady}>
      {() => (
        <StyleMemo
          value={{
            position: "absolute",
            borderRadius: "9999px",
            background: "radial-gradient(circle at 35% 30%, #f8fafc, #cbd5e1 60%, #94a3b8)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
            width: `${BALL_SIZE}px`,
            height: `${BALL_SIZE}px`,
            translate: use(paddle, () => {
              const p = paddle();
              return `${p.x + (p.w - BALL_SIZE) / 2}px ${p.y - BALL_SIZE - 2}px`;
            }),
          }}
        >
          <div />
        </StyleMemo>
      )}
    </Show>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HUD：分数与生命（订阅全局状态信号）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Hud(_: Record<string, never>, ctx: Context) {
  const { use } = ctx;

  const score = use(gameState.score, () => gameState.score());
  const lives = use(gameState.lives, () => gameState.lives());

  return (
    <div class="absolute left-4 top-3 flex items-center gap-6 font-mono text-sm text-white/90">
      <span>
        分数 {score} / {MAX_SCORE}
      </span>
      <span>生命 {lives}</span>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 覆盖层：开始 / 胜利 / 失败（订阅全局状态信号 + 发射事实）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Overlay(_: Record<string, never>, ctx: Context) {
  const { use } = ctx;

  const state = use(gameState.state, () => gameState.state() as GameState);

  // 覆盖层仅在非运行状态显示（运行中完全卸载，不遮挡游戏）
  const isVisible = use(state, () => state() !== "running");

  const title = use(state, () => {
    if (state() === "win") return "胜利！";
    if (state() === "lose") return "失败";
    return "打砖块";
  });
  const hint = use(state, () => {
    if (state() === "win" || state() === "lose") return "按 Enter 再来一局";
    return "← → 移动挡板，空格 发球，点击生成奖励球";
  });
  const showRestart = use(state, () => state() !== "ready");

  return (
    <Show value={isVisible}>
      {() => (
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 text-white">
          <h2 class="text-4xl font-bold tracking-wide">{title}</h2>
          <p class="text-sm text-white/70">{hint}</p>
          <Show value={showRestart}>
            {() => (
              <button
                class="mt-2 rounded-full bg-indigo-500 px-6 py-2 text-sm font-medium hover:bg-indigo-400"
                onClick={(e: MouseEvent) => {
                  rules.emit.restart({});
                  // 立即失焦：防止空格键激活按钮（浏览器默认在 keyup 触发 click）
                  (e.currentTarget as HTMLElement).blur();
                }}
              >
                重新开始
              </button>
            )}
          </Show>
        </div>
      )}
    </Show>
  );
}

export { Ball, Hud, Overlay, PaddleView };
