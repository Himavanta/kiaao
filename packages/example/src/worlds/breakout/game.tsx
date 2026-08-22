import { Each, type Context } from "kiaao";

import { createGame } from "../engine";
import {
  createBoundarySystem,
  createCollisionSystem,
  createInputSystem,
  createMovementSystem,
} from "../engine/systems";
import type { Assets } from "./assets";
import { BRICK_H, BRICK_W, Brick, createBrickGrid, type GameSystems } from "./bricks";
import {
  ARENA_H,
  ARENA_W,
  BALL_SIZE,
  COLS,
  createRuleSystem,
  createSoundSystem,
  LIVES,
  PADDLE_H,
  PADDLE_W,
  ROWS,
  type BreakoutEntity,
  type GameState,
} from "./systems";
import { Ball, Hud, Overlay, PaddleView, ReadyBall } from "./views";

const PADDLE_BOUNDS = { left: "clamp", right: "clamp", top: "pass", bottom: "pass" } as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Game 主组件：系统实例化 + 路由连接（组装层）+ 渲染
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Game({ assets }: { assets: Assets }, ctx: Context) {
  const { use, onUnmount } = ctx;

  // ── 系统实例化与路由连接（组装层：系统间的连接在此一目了然）──

  // 输入系统（源系统）：键盘路由表 + 持续状态信号（方向键 → input.dir）
  // 瞬时动作 → 直接调消费者 emit；持续状态 → 写 dir 信号
  const input = createInputSystem({
    keydown: {
      Space: () => rules.emit.launch({}),
      Enter: () => rules.emit.restart({}),
      ArrowLeft: () => input.dir(-1),
      KeyA: () => input.dir(-1),
      ArrowRight: () => input.dir(1),
      KeyD: () => input.dir(1),
    },
    keyup: {
      ArrowLeft: () => input.dir(0),
      KeyA: () => input.dir(0),
      ArrowRight: () => input.dir(0),
      KeyD: () => input.dir(0),
    },
  });

  // 规则系统 + 音效系统（事件系统：内部闭包队列，update 中处理）
  // 规则系统注入 dir 信号：挡板跟随（方向 → 挡板速度）在 rules.update 中执行
  const rules = createRuleSystem<BreakoutEntity>({
    dir: input.dir,
    win: (p) => audio.emit.win(p),
    lose: (p) => audio.emit.lose(p),
  });
  const audio = createSoundSystem(assets.play);

  const movement = createMovementSystem<BreakoutEntity>();
  const boundary = createBoundarySystem<BreakoutEntity>(
    { width: ARENA_W, height: ARENA_H },
    { onOut: (p) => rules.emit.out(p) },
  );
  const collision = createCollisionSystem<BreakoutEntity>({
    onBreak: (p) => {
      rules.emit.break(p);
      audio.emit.break(p);
    },
    onBounce: (p) => audio.emit.bounce(p),
  });

  // 游戏实例：帧循环（组件内创建，卸载时销毁）
  const { useEntity, dispose } = createGame<BreakoutEntity>([
    movement.update,
    boundary.update,
    collision.update,
    rules.update,
    audio.update,
  ]);

  // ── 实体注册 ──

  // 状态实体：承载实体目录（balls 数组）与游戏状态（分数/生命/状态机）
  // 顺带 enter 输入系统：借用其生命周期钩子（挂载时挂键盘监听 / 卸载时移除）
  const stateEntity = useEntity(
    ctx,
    rules.enter.state({ balls: [], score: 0, lives: LIVES, state: "ready" as GameState }),
    input.enter(),
  );

  // 挡板实体：静止语义（碰撞不交换速度），左右夹住，表面速度传导带动球
  const paddle = useEntity(
    ctx,
    rules.enter.paddle(),
    movement.enter({ x: (ARENA_W - PADDLE_W) / 2, y: ARENA_H - 48, vx: 0, vy: 0 }),
    boundary.enter({ w: PADDLE_W, h: PADDLE_H, bounds: PADDLE_BOUNDS }),
    collision.enter({ moving: false, shape: "rect", drive: 0.5 }),
  );

  // 砖块网格（静态布局，常驻不销毁）
  const bricks = use(createBrickGrid(ROWS, COLS, ARENA_W, BRICK_W, BRICK_H, 8, 48));

  // 系统对象集合（供子组件使用）
  const systems: GameSystems = { movement, boundary, collision, rules };

  // 组件卸载时销毁帧循环（键盘监听由输入系统的 enter 钩子移除）
  onUnmount(() => dispose());

  // ── 点击空白 → 生成奖励球（坐标换算到游戏区域）──

  const onClickArena = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    rules.emit.click({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // 球列表派生（状态实体数据 → Each）
  const balls = use(stateEntity, () => stateEntity().balls);

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

      <Hud stateEntity={stateEntity} />
      <PaddleView paddle={paddle} />
      <ReadyBall stateEntity={stateEntity} paddle={paddle} size={BALL_SIZE} />

      <Each value={bricks} keyed={(v) => v.id}>
        {({ item }) => {
          const data = item();
          return <Brick data={data} systems={systems} useEntity={useEntity} />;
        }}
      </Each>

      <Each value={balls} keyed={(v) => v.id}>
        {({ item }) => {
          const data = item();
          return <Ball data={data} systems={systems} useEntity={useEntity} />;
        }}
      </Each>

      <Overlay stateEntity={stateEntity} onRestart={() => rules.emit.restart({})} />
    </div>
  );
}
