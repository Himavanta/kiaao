// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 引擎生命周期：帧内 stop / start 的语义
//
// 这组用例的由来：胜负判定会在帧内调用 stop()，而首版 loop() 末尾
// 无条件重新排队 raf——停止完全失效，游戏结束后仍在后台空转。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { expect, test, vi } from "vite-plus/test";

import { createGame } from "../../../engine/game";

function setup() {
  const queue = new Map<number, any>();
  let i = 1;
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
    queue.set(i, cb);
    return i++;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((x: any) => {
    queue.delete(x);
  });
  const tick = () => {
    const p = [...queue.values()];
    queue.clear();
    p.forEach((cb) => cb(0));
  };
  return {
    queue,
    tick,
    get pending() {
      return queue.size;
    },
  };
}

test("帧内 stop 立即生效，不再继续跑帧", () => {
  const d = setup();
  let frames = 0;
  let game: any;
  game = createGame<any>([
    () => {
      frames += 1;
      if (frames === 3) game.stop();
    },
  ]);

  for (let k = 0; k < 10; k += 1) d.tick();

  expect(frames).toBe(3);
  expect(d.pending).toBe(0);
});

test("帧内 stop 再 start：不重复排队（帧率不翻倍）", () => {
  const d = setup();
  let frames = 0;
  let game: any;
  game = createGame<any>([
    () => {
      frames += 1;
      if (frames === 3) {
        game.stop();
        game.start();
      }
    },
  ]);

  for (let k = 0; k < 3; k += 1) d.tick();
  // 只剩 loop 尾部排的那一个；若 start 也排一个，此处会是 2
  expect(d.pending).toBe(1);

  for (let k = 0; k < 5; k += 1) d.tick();
  expect(frames).toBe(8);
});
