// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 组装层：两种范式各就各位
//
// 这个模块是整个世界「怎么拼起来」的唯一一处。它只做一件事：
// 把两个机制的 `update` 按顺序放进帧流水线。
//
//   bird.onFrame   ← 个体：决定「想往哪飞」（写 vx/vy）
//   movement       ← 机制：把速度积分成位置（所有实体共用一份）
//   boundary       ← 机制：越界反弹（所有实体共用一份）
//
// **顺序是有意的**：先让个体表态（改速度），再由机制统一位移。
// 这与 saboteur 的「behaviour 决定 → locomotion 推进」是同一个道理——
// 若反了，实体这一帧用的就是上一帧的速度。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createActorSystem, createGame } from "engine";

import type { BirdState } from "./bird";
import { WORLD, createBird } from "./bird";
import { createBoundarySystem, createMovementSystem } from "./systems";

// ── 两个机制（共享）──
const movement = createMovementSystem();
const boundary = createBoundarySystem({ ...WORLD, pad: 14 });

// ── 两个范式并排：一个服务所有实体，一个只跑个体方法 ──
const actor = createActorSystem<BirdState>();

/**
 * 游戏实例。
 *
 * 流水线顺序：个体表态 → 位移 → 边界。
 * 注意 `actor.update` 在 `movement.update` **之前**——见文件头注释。
 */
export const game = createGame<BirdState>([actor.update, movement.update, boundary.update], {
  autostart: false,
});

export const { define, start, stop } = game;

/** 一只鸟要注册的两个 `enter`——机制一个、个体一个 */
export const birdEnters = [movement.enter, boundary.enter, actor.enter];

/** 造一只鸟（视图用；内容见 bird.ts） */
export { createBird };
