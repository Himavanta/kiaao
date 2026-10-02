import { type Context } from "kiaao";

import { StyleMemo } from "../engine/directives";
import type { Bounds } from "../engine/systems";
import { boundary, collision, movement, rules, useEntity } from "./game-instance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 砖块布局
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 砖块布局数据（静态，渲染与注册共用） */
export type BrickData = {
  id: number;
  x: number;
  y: number;
  color: string;
  points: number;
};

/** 生成砖块网格：行数 × 列数，居中排列，颜色按行渐变，上层分值高 */
export function createBrickGrid(
  rows: number,
  cols: number,
  arenaW: number,
  bw: number,
  bh: number,
  gap: number,
  top: number,
): BrickData[] {
  const startX = (arenaW - (cols * bw + (cols - 1) * gap)) / 2;
  const colors = ["#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6"];
  const bricks: BrickData[] = [];
  const rowList = Array.from({ length: rows }, (_, i) => i);
  const colList = Array.from({ length: cols }, (_, i) => i);

  let id = 0;
  for (const row of rowList) {
    for (const col of colList) {
      bricks.push({
        id: id++,
        x: startX + col * (bw + gap),
        y: top + row * (bh + gap),
        color: colors[row % colors.length],
        points: rows - row,
      });
    }
  }
  return bricks;
}

// 砖块尺寸与边界（全 pass：不参与边界系统处理）
export const BRICK_W = 84;
export const BRICK_H = 26;
export const PASS_BOUNDS: Bounds = { left: "pass", right: "pass", top: "pass", bottom: "pass" };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 砖块组件（模块级游戏实例：直接 import 引用系统与注册入口）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type BrickProps = {
  data: BrickData;
};

/**
 * 砖块：静止实体，碰撞可击碎。
 * 击碎事实由碰撞系统经路由发射、规则系统落地（enabled 置 false）；
 * 组件只订阅实体数据隐藏，不承载任何游戏逻辑。
 */
function Brick({ data }: BrickProps, ctx: Context) {
  const { use } = ctx;

  const entity = useEntity(
    ctx,
    movement.enter({ x: data.x, y: data.y, moving: false }),
    boundary.enter({ w: BRICK_W, h: BRICK_H, bounds: PASS_BOUNDS }),
    collision.enter({ moving: false, enabled: true, breakable: true, points: data.points }),
    rules.enter.brick(),
  );

  return (
    <StyleMemo
      value={{
        position: "absolute",
        borderRadius: "4px",
        background: data.color,
        width: use(entity, () => `${entity().w}px`),
        height: use(entity, () => `${entity().h}px`),
        translate: use(entity, () => `${entity().x}px ${entity().y}px`),
        display: use(entity, () => (entity().enabled ? "" : "none")),
      }}
    >
      <div />
    </StyleMemo>
  );
}

export { Brick };
