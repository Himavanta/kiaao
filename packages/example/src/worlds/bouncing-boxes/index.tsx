import type { Context } from "kiaao";

import { createGame, type EngineEvents } from "../engine";
import { StyleMemo } from "../engine/directives";
import {
  createBoundarySystem,
  createCollisionSystem,
  createMovementSystem,
  type Bounds,
  type Shape,
} from "../engine/systems";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 创建游戏实例
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 示例实体：结构由使用者自定义，取决于注册了哪些系统 */
type BoxEntity = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  bounds: Bounds;
  shape: Shape;
  enabled: boolean;
  breakable: boolean;
  drive: number;
  points: number;
};

const [regMove, updMove] = createMovementSystem<BoxEntity>();
const [regBound, updBound] = createBoundarySystem<BoxEntity>();
const [regColl, updColl] = createCollisionSystem<BoxEntity>();

const { useGame } = createGame<BoxEntity, EngineEvents>([updMove, updBound, updColl]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Box 组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type BoxProps = {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  color: string;
  /** 是否参与移动：false 时实体注册到静止池，保持不动（仍参与边界/碰撞） */
  moving?: boolean;
};

function Box({ x, y, vx, vy, color, moving = true }: BoxProps, ctx: Context) {
  const { use } = ctx;

  // 所有实体统一注册三个系统；moving 参数决定进移动池还是静止池（移动/碰撞同步）
  const entity = useGame(
    ctx,
    regMove({ x, y, vx, vy, moving }),
    regBound({ w: 80, h: 80 }),
    regColl({ moving }),
  );

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
