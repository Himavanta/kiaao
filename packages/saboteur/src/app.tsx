// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 根组件：舞台 + 关卡层 + 角色 + HUD 组装
//
// 组件负责运行窗口（挂载 start、卸载 stop），世界状态与系统实例
// 全部在模块级（game/instance.ts）——组件不持有游戏数据。
//
// **重开一局靠声明式重建**：所有角色与道具由 `Each` 渲染，key 里含
// `runId`。递增局号即改变全部 key，框架卸载旧条目、挂载新条目——
// 实体池随之清空重建，`enter` 重新执行给出全新初始状态。不需要
// `dispose`，也不必逐个字段手动复位（规划文档 4.6）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Each, Show, type Context, type Signal } from "kiaao";

import { computeViewport } from "./game/config";
import { entityCount, frameSystem, input, level, runId, start, stop } from "./game/instance";
import { showVision } from "./game/state";
import type { Facing, ItemKind, Role } from "./game/types";
import { Actor } from "./game/views/actor";
import { usePlayerCamera } from "./game/views/camera";
import { DebugPanel } from "./game/views/debug";
import { Hud } from "./game/views/hud";
import { Prop } from "./game/views/prop";
import { ResultOverlay } from "./game/views/result";
import { Stage } from "./game/views/stage";
import { Tilemap } from "./game/views/tilemap";
import { VisionLayer } from "./game/views/vision-layer";
import { TILE } from "./world";

import style from "./app.module.scss";

/** 视口尺寸的格数表示（HUD 展示用） */
function toTileCount(width: number, height: number): string {
  return `${Math.round(width / TILE)}×${Math.round(height / TILE)}`;
}

/**
 * 一个待生成的角色。
 *
 * `run` 参与 key：换局时全部 key 变化，触发声明式重建。
 */
type ActorSpawn = {
  run: number;
  col: number;
  row: number;
  facing: Facing;
  role: Role;
};

/** 一个待生成的道具 */
type PropSpawn = {
  run: number;
  col: number;
  row: number;
  kind: ItemKind;
};

/**
 * 由局号派生出生列表。
 *
 * 读 `runId` 建立依赖：递增时本派生重算，产出新的 `run`，
 * 下游 `Each` 随之整体重建。
 */
function useSpawns(
  ctx: Context,
  run: Signal<number>,
): {
  actors: Signal<ActorSpawn[]>;
  props: Signal<PropSpawn[]>;
} {
  const { use } = ctx;
  const { grid, playerSpawn, npcSpawns, propSpawns } = level;

  const actors = use(run, () => {
    const r = run();
    const player = playerSpawn ?? {
      col: 1,
      row: 1,
      facing: "south" as const,
      kind: "player" as const,
    };

    return [
      {
        run: r,
        col: player.col,
        row: player.row,
        facing: (player.facing ?? "south") as Facing,
        role: player.kind,
      },
      ...npcSpawns.map((s) => ({
        run: r,
        col: s.col,
        row: s.row,
        facing: (s.facing ?? "south") as Facing,
        // 类型来自地图符号（`SpawnKind`），不再写死 guest
        role: s.kind,
      })),
    ].filter((s) => s.col >= 0 && s.row >= 0 && s.col < grid.cols && s.row < grid.rows);
  });

  const props = use(run, () => {
    const r = run();
    return propSpawns.map((p) => ({ run: r, col: p.col, row: p.row, kind: p.kind }));
  });

  return { actors, props };
}

export default function App(_: Record<string, never>, ctx: Context) {
  const { onMount, onUnmount } = ctx;

  // 运行窗口：挂载开始帧循环，卸载停止（实例与状态常驻模块级）
  onMount(start);
  onUnmount(stop);

  // 键盘监听随组件生命周期挂载/移除（输入是全局源系统，不属于实体）
  input.attach(ctx);

  // Tab 切换视野提示；输入系统不关心「视野提示」是什么，由组装层接线
  input.onToggleVision(() => showVision(!showVision()));

  const { grid, name } = level;
  const viewport = computeViewport(grid.cols, grid.rows);
  const camera = usePlayerCamera(ctx, viewport, grid);
  const { actors, props } = useSpawns(ctx, runId);

  return (
    <div class={style.shell}>
      <Stage camera={camera} grid={grid}>
        <Tilemap grid={grid}>
          <canvas class={style.tilemap} />
        </Tilemap>

        {/* 视锥图层压在实体之下（zIndex 由 DOM 顺序决定） */}
        <Show value={showVision}>{() => <VisionLayer frames={frameSystem.frames} />}</Show>

        <Each value={props} keyed={(p) => `${p.run}-${p.col}-${p.row}`}>
          {({ item }) => {
            const p = item();
            return <Prop kind={p.kind} col={p.col} row={p.row} />;
          }}
        </Each>

        <Each value={actors} keyed={(a) => `${a.run}-${a.role}-${a.col}-${a.row}`}>
          {({ item }) => {
            const a = item();
            return <Actor col={a.col} row={a.row} facing={a.facing} role={a.role} />;
          }}
        </Each>
      </Stage>

      <Hud />
      <DebugPanel fps={frameSystem.fps} entities={entityCount} />
      <ResultOverlay />
      <span class={style.hint}>
        {name} · 地图 {grid.cols}×{grid.rows} · 视口 {toTileCount(viewport.width, viewport.height)}{" "}
        · Space 交互 · Tab 显示视野 · R 重开
      </span>
    </div>
  );
}
