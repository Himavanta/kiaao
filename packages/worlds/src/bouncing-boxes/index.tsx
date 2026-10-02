import { createGame, StyleMemo } from "engine";
import type { Enter } from "engine";
import { createBoundarySystem, createCollisionSystem, createMovementSystem } from "engine/systems";
import type { Context } from "kiaao";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 创建游戏实例
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const movement = createMovementSystem();
const boundary = createBoundarySystem();
const collision = createCollisionSystem();

// 帧内执行顺序：移动 → 边界 → 碰撞
const game = createGame([movement.update, boundary.update, collision.update]);
const { define } = game;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Box 组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type BoxProps = {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  color: string;
  /** 是否参与移动：false 时静止不动（仍参与碰撞，作为静止障碍物） */
  moving?: boolean;
};

function Box({ x, y, vx, vy, color, moving = true }: BoxProps, ctx: Context) {
  const { use } = ctx;

  // 「谁进哪个池」由这里列了哪个 enter 决定：
  // 静止盒子不注册 movement（每帧不被推进），但仍注册 boundary / collision
  const enters: Enter<any>[] = moving
    ? [movement.enter, boundary.enter, collision.enterMover]
    : [boundary.enter, collision.enterStatic];

  const entity = define(
    ctx,
    ...enters,
  )({
    x,
    y,
    vx: vx ?? 0,
    vy: vy ?? 0,
    w: 80,
    h: 80,
    // 四边反弹（默认行为）
    left: "bounce",
    right: "bounce",
    top: "bounce",
    bottom: "bounce",
    shape: "rect",
    enabled: true,
    breakable: false,
    drive: 0,
    points: 0,
  });

  return (
    <StyleMemo
      value={{
        position: "fixed",
        borderRadius: "8px",
        willChange: "transform",
        background: color,
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
// 3. App
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function App() {
  return (
    <>
      <Box x={100} y={100} color="#e74c3c" moving={false} />
      <Box x={400} y={300} vx={-100} vy={-80} color="#3498db" />
      <Box x={700} y={200} vx={60} vy={120} color="#2ecc71" />
      <Box x={200} y={500} vx={-200} vy={-30} color="#f39c12" />
    </>
  );
}
