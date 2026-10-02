import { createGame, createPool, StyleMemo, type FrameManager } from "engine";
import { createBoundarySystem, createCollisionSystem, createMovementSystem } from "engine/systems";
import { Each, use, type Context } from "kiaao";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 重力系统（自定义系统示例）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 重力系统字段需求：实体具备受重力加速度 */
type Gravitable = { vy: number; gravity: number };

function createGravitySystem<T extends Gravitable = Gravitable>() {
  const [pool, enter] = createPool<T>();

  // update: 帧逻辑，重力加速度作用于垂直速度
  const update = (frame: FrameManager<T>, delta: number) => {
    for (const id of pool) {
      const e = frame(id)!;
      e.vy += e.gravity * delta;
    }
  };

  return { enter, update };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 创建游戏实例
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const movement = createMovementSystem();
const boundary = createBoundarySystem();
const collision = createCollisionSystem();
const gravity = createGravitySystem();

// 帧内执行顺序：重力 → 移动 → 边界 → 碰撞
const game = createGame([gravity.update, movement.update, boundary.update, collision.update]);
const { define } = game;

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

function Ball({ x, y, vx, vy, size, color, gravity: accel, onRemove }: BallProps, ctx: Context) {
  const { use } = ctx;

  // 复用基础系统 + 自定义重力系统
  const entity = define(
    ctx,
    movement.enter,
    boundary.enter,
    collision.enterMover,
    gravity.enter,
  )({
    x,
    y,
    vx,
    vy,
    w: size,
    h: size,
    // 自重（自定义字段：基础系统不认识它）
    gravity: accel ?? 500,
    // 四边反弹
    left: "bounce",
    right: "bounce",
    top: "bounce",
    bottom: "bounce",
    shape: "circle",
    enabled: true,
    breakable: false,
    drive: 0,
    points: 0,
  });

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

  // 静止实体：不注册 movement（不被推进），在碰撞里作为静止障碍
  const entity = define(
    ctx,
    boundary.enter,
    collision.enterStatic,
  )({
    x,
    y,
    vx: 0,
    vy: 0,
    w: size,
    h: size,
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
  let nextId = 6;

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
