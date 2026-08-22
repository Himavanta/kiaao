import { Each, type Context } from "kiaao";

import { createGame, type FrameManager } from "../engine";
import {
  createBoundarySystem,
  createCollisionSystem,
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
  PADDLE_SPEED,
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
  const { use, onMount, onUnmount } = ctx;

  // 输入方向（持续状态 → 信号）
  const dir = use(0);

  // ── 系统实例化与路由连接（组装层：系统间的连接在此一目了然）──

  // 规则系统 + 音效系统（事件系统：内部闭包队列，update 中处理）
  const rules = createRuleSystem<BreakoutEntity>({
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
    updInput,
    movement.update,
    boundary.update,
    collision.update,
    rules.update,
    audio.update,
  ]);

  // ── 实体注册 ──

  // 状态实体：承载实体目录（balls 数组）与游戏状态（分数/生命/状态机）
  const stateEntity = useEntity(
    ctx,
    rules.enter.state({ balls: [], score: 0, lives: LIVES, state: "ready" as GameState }),
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

  // ── 输入更新系统：方向信号 → 挡板速度（仅在变化时写入）──

  let lastDir = 0;
  function updInput(frame: FrameManager<BreakoutEntity>) {
    const d = dir();
    if (d !== lastDir) {
      frame(paddle.id, (v) => {
        v.vx = d * PADDLE_SPEED;
      });
      lastDir = d;
    }
  }

  // ── 键盘输入：方向 → 信号（持续状态）；动作 → 事件（瞬时事实，直接调用系统 emit）──

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") dir(-1);
      else if (e.key === "ArrowRight" || e.key === "d") dir(1);
      else if (e.key === " ") {
        e.preventDefault();
        rules.emit.launch({});
      } else if (e.key === "Enter") {
        e.preventDefault();
        rules.emit.restart({});
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") e.preventDefault(); // 阻止空格在 keyup 激活聚焦按钮
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "ArrowRight" || e.key === "d") {
        dir(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    onUnmount(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      dispose();
    });
  });

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
