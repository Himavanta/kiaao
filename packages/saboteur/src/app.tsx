// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 根组件：舞台 + 关卡层 + 角色 + HUD 组装
//
// 组件负责运行窗口（挂载 start、卸载 stop），世界状态与系统实例
// 全部在模块级（game/instance.ts）——组件不持有游戏数据。
//
// 输入监听的挂载借用组件的生命周期：监听随游戏运行窗口存在，
// 不留到组件树之外。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Show, type Context } from "kiaao";

import { computeViewport } from "./game/config";
import { entityCount, frameSystem, input, level, showVision, start, stop } from "./game/instance";
import { Actor } from "./game/views/actor";
import { usePlayerCamera } from "./game/views/camera";
import { DebugPanel } from "./game/views/debug";
import { Hud } from "./game/views/hud";
import { Prop } from "./game/views/prop";
import { Stage } from "./game/views/stage";
import { Tilemap } from "./game/views/tilemap";
import { VisionLayer } from "./game/views/vision-layer";
import { TILE } from "./world";

import style from "./app.module.scss";

/** 视口尺寸的格数表示（HUD 展示用） */
function toTileCount(width: number, height: number): string {
  return `${Math.round(width / TILE)}×${Math.round(height / TILE)}`;
}

export default function App(_: Record<string, never>, ctx: Context) {
  const { onMount, onUnmount } = ctx;

  // 运行窗口：挂载开始帧循环，卸载暂停（实例与状态常驻模块级）
  onMount(start);
  onUnmount(stop);

  // 键盘监听随组件生命周期挂载/移除（输入是全局源系统，不属于实体）
  input.attach(ctx);

  // Tab 切换视野提示；输入系统不关心「视野提示」是什么，由组装层接线
  input.onToggleVision(() => showVision(!showVision()));

  const { grid, name, playerSpawn, npcSpawns, propSpawns } = level;
  const viewport = computeViewport(grid.cols, grid.rows);

  const player = playerSpawn ?? { col: 1, row: 1 };
  const camera = usePlayerCamera(ctx, viewport, grid);

  return (
    <div class={style.shell}>
      <Stage camera={camera} grid={grid}>
        <Tilemap grid={grid}>
          <canvas class={style.tilemap} />
        </Tilemap>

        {/* 视锥图层压在实体之下（zIndex 由 DOM 顺序决定） */}
        <Show value={showVision}>{() => <VisionLayer frames={frameSystem.frames} />}</Show>

        {propSpawns.map((prop) => (
          <Prop kind={prop.kind} col={prop.col} row={prop.row} />
        ))}

        <Actor col={player.col} row={player.row} facing={player.facing ?? "south"} role="player" />

        {npcSpawns.map((spawn) => (
          <Actor col={spawn.col} row={spawn.row} facing={spawn.facing ?? "south"} role="guest" />
        ))}
      </Stage>
      <Hud />
      <DebugPanel fps={frameSystem.fps} entities={entityCount} />
      <span class={style.hint}>
        {name} · 地图 {grid.cols}×{grid.rows} · 视口 {toTileCount(viewport.width, viewport.height)}{" "}
        · Space 交互 · Tab 显示视野
      </span>
    </div>
  );
}
