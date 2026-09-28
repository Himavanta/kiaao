// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 可复现的伪随机数
//
// 目的不是密码学强度，而是**可复现**：给同一种子必得同一序列，
// 于是「NPC 每次跑到哪里」在测试中可断言。Math.random 会让涉及
// 随机的系统只能做范围断言，测不出「序列是否真按预期推进」。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 线性同余发生器（Numerical Recipes 参数） */
export type Random = {
  /** 下一个 [0, 1) 之间的浮点数 */
  (): number;
  /** [min, max] 之间的整数（含两端） */
  int: (min: number, max: number) => number;
  /** 从数组中等概率取一项（空数组返回 undefined） */
  pick: <T>(items: readonly T[]) => T | undefined;
};

export function createRandom(seed: number): Random {
  let state = seed >>> 0 || 1;

  const next = (() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  }) as Random;

  next.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  next.pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];

  return next;
}
