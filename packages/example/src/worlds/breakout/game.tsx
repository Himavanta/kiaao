import { Each, type Context } from "kiaao";

import { createGame, type EntityId, type FrameManager } from "../engine";
import {
  createBoundarySystem,
  createCollisionSystem,
  createMovementSystem,
} from "../engine/systems";
import type { Assets } from "./assets";
import {
  BRICK_H,
  BRICK_W,
  Brick,
  createBrickGrid,
  type BreakoutEntity,
  type GameRegisters,
} from "./bricks";
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
  type BallData,
  type BreakoutEvents,
  type GameState,
  type RuleDeps,
} from "./systems";
import { Ball, Hud, Overlay, PaddleView, ReadyBall } from "./views";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 系统实例（注册函数；帧循环实例在组件内创建，路由重进时重建）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const [regMove, updMove] = createMovementSystem<BreakoutEntity>();
const [regBound, updBound] = createBoundarySystem<BreakoutEntity>({
  width: ARENA_W,
  height: ARENA_H,
});
const [regColl, updColl] = createCollisionSystem<BreakoutEntity>();

const PADDLE_BOUNDS = { left: "clamp", right: "clamp", top: "pass", bottom: "pass" } as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Game 主组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Game({ assets }: { assets: Assets }, ctx: Context) {
  const { use, onMount, onUnmount } = ctx;

  // 输入方向（持续状态 → 信号）
  const dir = use(0);

  // 规则系统依赖：实体 id 由注册时收集（register 包装函数可拿到 id）
  const ruleDeps: RuleDeps = { state: {}, ballIds: new Map(), brickIds: [] };

  // 规则系统 + 音效系统（事件系统：帧内事件阶段消费）
  const rule = createRuleSystem(ruleDeps);
  const sound = createSoundSystem(assets.play);

  // 游戏实例：帧循环 + 事件队列（组件内创建，卸载时销毁）
  const { useGame, emits, dispose } = createGame<BreakoutEntity, BreakoutEvents>(
    [updInput, updMove, updBound, updColl],
    [rule, sound],
  );

  // 状态实体：承载实体目录（balls 数组）与游戏状态（分数/生命/状态机）
  const stateEntity = useGame(ctx, (id) => {
    ruleDeps.state.stateId = id;
    return { balls: [], score: 0, lives: LIVES, state: "ready" as GameState };
  });

  // 挡板实体：静止语义（碰撞不交换速度），左右夹住，表面速度传导带动球
  const paddle = useGame(
    ctx,
    (id) => {
      ruleDeps.state.paddleId = id;
      return {};
    },
    regMove({ x: (ARENA_W - PADDLE_W) / 2, y: ARENA_H - 48, vx: 0, vy: 0 }),
    regBound({ w: PADDLE_W, h: PADDLE_H, bounds: PADDLE_BOUNDS }),
    regColl({ moving: false, shape: "rect", drive: 0.5 }),
  );

  // 砖块网格（静态布局，常驻不销毁）
  const bricks = use(createBrickGrid(ROWS, COLS, ARENA_W, BRICK_W, BRICK_H, 8, 48));

  // 注册函数集合（供子组件使用）
  const regs: GameRegisters = { useGame, regMove, regBound, regColl };

  // 球实体 id → 数组项 id 关联（规则系统处理 out 时声明式销毁）
  const collectBallId = (id: EntityId, dataId: number) => {
    ruleDeps.ballIds.set(id, dataId);
  };

  // 砖块实体 id 收集（规则系统重开时恢复 enabled）
  const collectBrickId = (id: EntityId) => {
    ruleDeps.brickIds.push(id);
  };

  // 输入更新系统：方向信号 → 挡板速度（仅在变化时写入）
  let lastDir = 0;
  function updInput(frame: FrameManager<BreakoutEntity>) {
    const d = dir();
    const paddleId = ruleDeps.state.paddleId;
    if (d !== lastDir && paddleId) {
      frame(paddleId, (v) => {
        v.vx = d * PADDLE_SPEED;
      });
      lastDir = d;
    }
  }

  // 键盘输入：方向 → 信号（持续状态）；动作 → 事件（瞬时事实）
  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") dir(-1);
      else if (e.key === "ArrowRight" || e.key === "d") dir(1);
      else if (e.key === " ") {
        e.preventDefault();
        emits.launch({});
      } else if (e.key === "Enter") {
        e.preventDefault();
        emits.restart({});
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

  // 点击空白 → 生成奖励球（坐标换算到游戏区域）
  const onClickArena = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    emits.click({ x: e.clientX - rect.left, y: e.clientY - rect.top });
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
          return <Brick data={data} regs={regs} onRegistered={collectBrickId} />;
        }}
      </Each>

      <Each value={balls} keyed={(v: BallData) => v.id}>
        {({ item }) => {
          const data = item();
          return <Ball data={data} regs={regs} onRegistered={collectBallId} />;
        }}
      </Each>

      <Overlay stateEntity={stateEntity} onRestart={() => emits.restart({})} />
    </div>
  );
}
