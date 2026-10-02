// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 游戏实例（模块级组装层）
//
// 系统实例 + 游戏实例 + 全局状态全部模块级：
// - 子组件直接 import 引用，零逐层传递、零查询
// - 生命周期：实例 start/stop 由 Game 组件控制（运行窗口），实例本身常驻
// - 全局状态（分数/生命/状态机/球目录）= 模块级信号（事件处理的产物，不是实体）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use } from "kiaao";

import { createGame } from "../engine";
import {
  createBoundarySystem,
  createCollisionSystem,
  createInputSystem,
  createMovementSystem,
} from "../engine/systems";
import { loadAssets, type SoundName } from "./assets";
import {
  ARENA_H,
  ARENA_W,
  createRuleSystem,
  createSoundSystem,
  LIVES,
  type BallData,
  type BreakoutEntity,
  type GameState,
} from "./systems";

// ── 全局状态信号（事件处理的产物——分数/生命/状态机/球目录）──

export const gameState = {
  /** 球实体目录（声明式生命周期数据源：Each 订阅，规则系统增删） */
  balls: use<BallData[]>([]),
  /** 分数（break 加分 / restart 清零） */
  score: use(0),
  /** 生命（out 减一 / restart 重置） */
  lives: use(LIVES),
  /** 游戏状态机（ready / running / win / lose） */
  state: use<GameState>("ready"),
};

// ── 音效播放器：惰性装配（loadAssets 异步完成，首次播放时已就绪）──

const play = (name: SoundName) => {
  void loadAssets().then((assets) => assets.play(name));
};

// ── 系统实例（模块级，按依赖顺序创建：audio → input → rules）──

export const audio = createSoundSystem(play);

// 输入系统（源系统）：键盘路由表 + 持续状态信号（方向键 → input.dir）
export const input = createInputSystem({
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

// 规则系统（事件系统：内部闭包队列，update 中处理）+ 音效系统路由
export const rules = createRuleSystem<BreakoutEntity>({
  ...gameState, // 全局状态信号注入（事件处理的产物）
  dir: input.dir,
  win: (p) => audio.emit.win(p),
  lose: (p) => audio.emit.lose(p),
});

export const movement = createMovementSystem<BreakoutEntity>();
export const boundary = createBoundarySystem<BreakoutEntity>(
  { width: ARENA_W, height: ARENA_H },
  { onOut: (p) => rules.emit.out(p) },
);
export const collision = createCollisionSystem<BreakoutEntity>({
  onBreak: (p) => {
    rules.emit.break(p);
    audio.emit.break(p);
  },
  onBounce: (p) => audio.emit.bounce(p),
});

// ── 游戏实例（模块级，autostart: false——运行窗口由 Game 组件控制）──

export const game = createGame<BreakoutEntity>(
  [movement.update, boundary.update, collision.update, rules.update, audio.update],
  { autostart: false },
);
export const { useEntity } = game;
