// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 相机：跟随玩家实体
//
// 相机只更新一层容器的 translate——相机移动时每帧 1 次 DOM 写入，
// 而不是每个实体各算一次（规划文档 4.4）。
//
// 视口不小于世界时夹取范围为零，相机恒在原点——等价于「无相机」，
// 但表达式不变，地图放大后自动转为卷轴而无需改代码。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { type Context, type Signal } from "kiaao";

import { TILE, type Grid } from "../../world";
import type { Viewport } from "../config";
import { level } from "../instance";
import { playerEntity } from "../state";
import { ACTOR_SIZE } from "../systems/locomotion";
import type { Camera, CameraTarget } from "./stage";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** 出生点：玩家实体尚未注册时的回退焦点 */
function spawnFocus(): CameraTarget {
  const { col, row } = level.playerSpawn ?? { col: 0, row: 0 };
  return { x: col * TILE, y: row * TILE };
}

/**
 * 相机跟随玩家：把玩家中心置于视口中心，并夹在世界边界内。
 *
 * 焦点派生自 `playerEntity`——玩家注册后自动开始跟随，无需重组装。
 * 位置不变时 memo 生效，不写 DOM。
 */
export function usePlayerCamera(ctx: Context, viewport: Viewport, grid: Grid): Signal<Camera> {
  const { use } = ctx;

  const worldW = grid.cols * TILE;
  const worldH = grid.rows * TILE;

  const focus = use(playerEntity, () => {
    const player = playerEntity();
    if (!player) return spawnFocus();

    const { x, y } = player();
    // 焦点取角色中心而非左上角
    return { x: x + ACTOR_SIZE / 2, y: y + ACTOR_SIZE / 2 };
  });

  return use(focus, () => {
    const { x, y } = focus();
    return {
      x: clamp(x - viewport.width / 2, 0, Math.max(0, worldW - viewport.width)),
      y: clamp(y - viewport.height / 2, 0, Math.max(0, worldH - viewport.height)),
    };
  });
}
