// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 根组件：舞台 + 关卡层 + HUD 组装
//
// 组件负责运行窗口（挂载 start、卸载 stop），世界状态与系统实例
// 全部在模块级（game/instance.ts）——组件不持有游戏数据。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use, type Context } from "kiaao";

import { TILE } from "./game/config";
import { entityCount, frameSystem, level, start, stop } from "./game/instance";
import { DebugPanel } from "./game/views/debug";
import { followCamera, Stage } from "./game/views/stage";
import { Tilemap } from "./game/views/tilemap";

import style from "./app.module.scss";

/**
 * M1：相机初始对准玩家出生点（无跟随目标，静止）。
 * M2 接入玩家实体后，这里改为订阅玩家位置的派生信号。
 */
function useCamera(ctx: Context) {
  const { col, row } = level.playerSpawn ?? { col: 0, row: 0 };
  const focus = use({ x: col * TILE, y: row * TILE });
  return followCamera(ctx, focus, level.grid);
}

export default function App(_: Record<string, never>, ctx: Context) {
  const { onMount, onUnmount } = ctx;

  // 运行窗口：挂载开始帧循环，卸载暂停（实例与状态常驻模块级）
  onMount(start);
  onUnmount(stop);

  const camera = useCamera(ctx);

  return (
    <div class={style.shell}>
      <Stage camera={camera} grid={level.grid}>
        {/* 指令作用于子元素——必须包裹真实 <canvas>，不能自闭合 */}
        <Tilemap grid={level.grid}>
          <canvas class={style.tilemap} />
        </Tilemap>
      </Stage>
      <DebugPanel fps={frameSystem.fps} entities={entityCount} />
      <span class={style.hint}>
        {level.name} · {level.grid.cols}×{level.grid.rows}
      </span>
    </div>
  );
}
