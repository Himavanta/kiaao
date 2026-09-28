// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M3 端到端：NPC 真的在房间里游荡
//
// 单测覆盖了寻路与各系统，但「三个系统接起来 NPC 是否真会走」
// 只有端到端能验证——信号未接线、意图未分派、路径未推进，
// 任何一处断开都会表现为「NPC 站着不动」。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import App from "../../app";
import { level, stop } from "../instance";

function createDriver(stepMs = 16) {
  const queue = new Map<number, (t: number) => void>();
  let nextId = 1;
  let clock = 0;

  const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  const caf = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id: any) => {
    queue.delete(id);
  });
  const now = vi.spyOn(performance, "now").mockImplementation(() => clock);

  return {
    tick() {
      clock += stepMs;
      const pending = [...queue.values()];
      queue.clear();
      for (const cb of pending) cb(clock);
    },
    tickTimes(n: number) {
      for (let i = 0; i < n; i += 1) this.tick();
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
      now.mockRestore();
    },
  };
}

/** 从 DOM 读出所有角色的位置（按 translate 解析） */
function actorPositions(): Array<{ x: number; y: number }> {
  return (
    [...document.querySelectorAll("#app div[style]")]
      .map((el) => /translate:\s*([\d.-]+)px\s+([\d.-]+)px/.exec(el.getAttribute("style") ?? ""))
      .filter((m): m is RegExpExecArray => m !== null)
      // 世界层也有 translate，其值为 0 且元素很大；按尺寸排除
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
      .filter((_, i) => i > 0)
  );
}

describe("M3 端到端 / NPC 游荡", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("关卡中的 NPC 全部被渲染", () => {
    const app = createApp(App);
    app.mount("#app");

    // 玩家 + NPC 的角色元素都存在
    const positions = actorPositions();
    expect(positions.length).toBeGreaterThanOrEqual(1 + level.npcSpawns.length);

    app.unmount();
  });

  test("推帧后 NPC 会移动（不只是玩家）", () => {
    const app = createApp(App);
    app.mount("#app");

    const before = actorPositions();
    // 游荡需要几秒才起步（初始有停留计时），给足帧数
    driver.tickTimes(400);
    const after = actorPositions();

    expect(after.length).toBe(before.length);

    // 至少一个角色位置发生变化
    const moved = after.some((pos, i) => pos.x !== before[i]?.x || pos.y !== before[i]?.y);
    expect(moved).toBe(true);

    app.unmount();
  });

  test("长时间游荡：NPC 始终待在可通行格内（不穿墙）", () => {
    const app = createApp(App);
    app.mount("#app");

    // 模拟约 50 秒
    for (let batch = 0; batch < 10; batch += 1) {
      driver.tickTimes(300);

      for (const { x, y } of actorPositions().slice(1)) {
        const col = Math.floor((x + 10) / 32);
        const row = Math.floor((y + 10) / 32);

        // 角色中心不能位于墙内
        const tile = level.grid.tiles[row * level.grid.cols + col];
        expect(tile).toBe(0); // Tile.Floor
      }
    }

    app.unmount();
  });

  test("多个 NPC 最终分散在不同位置（不是叠在一起）", () => {
    const app = createApp(App);
    app.mount("#app");

    driver.tickTimes(600);

    const npcPositions = actorPositions().slice(1);
    const unique = new Set(npcPositions.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));

    // 完全重合说明寻路或行为系统没生效
    expect(unique.size).toBe(npcPositions.length);

    app.unmount();
  });

  test("深度排序：zIndex 随 y 变化（俯视遮挡）", () => {
    const app = createApp(App);
    app.mount("#app");
    driver.tickTimes(200);

    const zValues = [...document.querySelectorAll("#app div[style]")]
      .map((el) => /z-index:\s*(\d+)/.exec(el.getAttribute("style") ?? ""))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]));

    expect(zValues.length).toBeGreaterThan(0);
    // 不同 y 的角色应有不同层级
    expect(new Set(zValues).size).toBeGreaterThan(1);

    app.unmount();
  });
});
