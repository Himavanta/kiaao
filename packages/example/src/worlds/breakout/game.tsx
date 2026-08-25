import { Each, type Context } from "kiaao";

import type { Assets } from "./assets";
import { Brick, createBrickGrid, BRICK_H, BRICK_W } from "./bricks";
import { game, gameState, rules } from "./game-instance";
import { ARENA_H, ARENA_W, COLS, ROWS } from "./systems";
import { Ball, Hud, Overlay, PaddleView } from "./views";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Game 主组件：运行窗口控制 + 渲染
// 系统实例/游戏实例/全局状态均为模块级（game-instance.ts）——
// 组件只负责：挂载时 start、卸载时 stop、渲染实体与订阅全局状态
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Game({ assets }: { assets: Assets }, ctx: Context) {
  const { use, onMount, onUnmount } = ctx;

  // 运行窗口：挂载开始帧循环，卸载停止（实例与状态常驻模块级）
  onMount(() => game.start());
  onUnmount(() => game.stop());

  // 砖块网格（静态布局，常驻不销毁）
  const bricks = use(createBrickGrid(ROWS, COLS, ARENA_W, BRICK_W, BRICK_H, 8, 48));

  // 球列表派生（全局状态信号 → Each）
  const balls = use(gameState.balls, () => gameState.balls());

  // 点击空白 → 生成奖励球（坐标换算到游戏区域）
  const onClickArena = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    rules.emit.click({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      class="relative overflow-hidden rounded-xl shadow-2xl"
      style={{
        width: `${ARENA_W}px`,
        height: `${ARENA_H}px`,
        backgroundImage: `url(${assets.bg})`,
        backgroundSize: "cover",
      }}
    >
      {/* 点击层：空白处生成奖励球（最底层） */}
      <div class="absolute inset-0" onClick={onClickArena} />

      <Hud />
      <PaddleView />

      <Each value={bricks} keyed={(v) => v.id}>
        {({ item }) => {
          const data = item();
          return <Brick data={data} />;
        }}
      </Each>

      <Each value={balls} keyed={(v) => v.id}>
        {({ item }) => {
          const data = item();
          return <Ball data={data} />;
        }}
      </Each>

      <Overlay />
    </div>
  );
}
