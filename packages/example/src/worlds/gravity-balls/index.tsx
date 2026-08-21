import { Each, use, type Context } from "kiaao";

import { createGame, type EngineEvents, type EntityId, type FrameManager } from "../engine";
import { StyleMemo } from "../engine/directives";
import {
  createBoundarySystem,
  createCollisionSystem,
  createMovementSystem,
  type Bounds,
  type Movable,
  type Shape,
} from "../engine/systems";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 重力系统（world2 自定义系统示例）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 重力系统字段需求：实体具备受重力加速度 */
type Gravitable = Movable & { gravity: number };

function createGravitySystem<T extends Gravitable = Gravitable>() {
  const pool = new Set<EntityId>();

  const register = (props: { gravity?: number }) => {
    return (id: EntityId, ctx: Context) => {
      const { onMount, onUnmount } = ctx;
      onMount(() => {
        pool.add(id);
      });
      onUnmount(() => {
        pool.delete(id);
      });

      // 返回数据切片
      return { gravity: props.gravity ?? 500 };
    };
  };

  // update: 帧逻辑，重力加速度作用于垂直速度
  const update = (frame: FrameManager<T>, delta: number) => {
    for (const id of pool) {
      frame(id, (e) => {
        e.vy += e.gravity * delta;
      });
    }
  };

  return [register, update] as const;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 创建游戏实例
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 弹球实体：复用基础系统 + 重力字段 */
type BallEntity = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  gravity: number;
  bounds: Bounds;
  shape: Shape;
  enabled: boolean;
  breakable: boolean;
  drive: number;
  points: number;
};

const [regMove, updMove] = createMovementSystem<BallEntity>();
const [regBound, updBound] = createBoundarySystem<BallEntity>();
const [regColl, updColl] = createCollisionSystem<BallEntity>();
const [regGrav, updGrav] = createGravitySystem<BallEntity>();

// 帧内执行顺序：重力 → 移动 → 边界 → 碰撞
const { useGame } = createGame<BallEntity, EngineEvents>([updGrav, updMove, updBound, updColl]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 弹球组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type BallProps = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  gravity?: number;
  onRemove: () => void;
};

function Ball({ x, y, vx, vy, size, color, gravity, onRemove }: BallProps, ctx: Context) {
  const { use } = ctx;

  // 复用基础系统 + 自定义重力系统；注册顺序决定帧内执行顺序（重力→移动→边界→碰撞）
  const entity = useGame(
    ctx,
    regMove({ x, y, vx, vy }),
    regBound({ w: size, h: size }),
    regColl({ moving: true, shape: "circle" }),
    regGrav({ gravity }),
  );

  return (
    <StyleMemo
      value={{
        position: "fixed",
        borderRadius: "9999px",
        background: color,
        width: use(entity, () => `${entity().w}px`),
        height: use(entity, () => `${entity().h}px`),
        translate: use(entity, () => `${entity().x}px ${entity().y}px`),
      }}
    >
      <div onClick={onRemove} />
    </StyleMemo>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 静止方块：障碍物，小球撞上反弹
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type BlockProps = {
  x: number;
  y: number;
  size: number;
  color: string;
};

function Block({ x, y, size, color }: BlockProps, ctx: Context) {
  const { use } = ctx;

  // 静止实体：注册到移动/碰撞的静止池，参与碰撞但不移动
  const entity = useGame(
    ctx,
    regMove({ x, y, moving: false }),
    regBound({ w: size, h: size }),
    regColl({ moving: false }),
  );

  return (
    <StyleMemo
      value={{
        position: "fixed",
        borderRadius: "8px",
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
// 5. App：点击空白生成弹球，点击弹球销毁
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 弹球列表项：生成时的配置数据 */
type BallData = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  gravity: number;
};

const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

function randomBall(nextId: number): BallData {
  return {
    id: nextId,
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight * 0.6,
    vx: (Math.random() - 0.5) * 500,
    vy: -100 - Math.random() * 300,
    size: 16 + Math.random() * 36,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    gravity: 300 + Math.random() * 400,
  };
}

export default function App() {
  const balls = use<BallData[]>([
    randomBall(1),
    randomBall(2),
    randomBall(3),
    randomBall(4),
    randomBall(5),
  ]);
  let nextId = 4;

  const addBall = () => {
    balls([...balls(), randomBall(nextId++)]);
  };

  return (
    <>
      <div class="fixed inset-0" onClick={addBall} />
      <Block
        x={(window.innerWidth - 100) / 2}
        y={(window.innerHeight - 100) / 2}
        size={100}
        color="#8e44ad"
      />
      <Each value={balls} keyed={(v) => v.id}>
        {({ item }) => {
          const b = item();
          return (
            <Ball
              x={b.x}
              y={b.y}
              vx={b.vx}
              vy={b.vy}
              size={b.size}
              color={b.color}
              gravity={b.gravity}
              onRemove={() => balls(balls().filter((v) => v.id !== b.id))}
            />
          );
        }}
      </Each>
    </>
  );
}
