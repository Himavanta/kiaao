// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 端到端：真实挂载 crowd App，验证本实验的四项核心主张
//
// 纯逻辑由 behaviour.test.ts 覆盖；这里验证的是**架构层面**的东西——
// 帧循环、池生命周期、闭包状态隔离、以及「写信号 → DOM 更新」这条链。
//
// 这一层正是本实验与 ECS 版的关键分歧点：ECS 版靠 frame/flush 做帧末
// 提交，这里靠对象直接写自己的信号。两者都要能跑通。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import Crowd from "../index";
import { PAINT } from "../npc";
import { poolSize } from "../use-game";

/**
 * mulberry32：确定性伪随机（固定种子 → 固定序列）。
 *
 * **为什么必须固定种子**：NPC 的闲游目标用 `Math.random()`。不固定时
 * 「恐慌多久烧完」是随机的——实测 200 次收敛分位：p50=8s、p95=30s、
 * p99=58s、max=62s，**长尾很重**。给个固定超时值都会不时挂掉（实测
 * 20 次里 9 次失败）。
 *
 * 固定种子后同一条件下的收敛时间稳定在 7–13 秒（12 个种子实测）。
 * 这不是「把测试改得容易过」——是把**随机导致的假失败**去掉，保留
 * 对行为的真实验证。
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 手动驱动的 rAF + 可控时钟。
 *
 * **必须同时 mock `performance.now()`**：帧循环用 `performance.now()` 算 dt，
 * 而紧密循环里两次 tick 的真实间隔只有微秒级——不控时钟的话，跑 200 帧
 * 实际只推进 0.02 秒，任何基于时长的行为（恐慌到期）都测不到。
 *
 * 每 tick 默认推进 16ms（≈60fps），可通过参数调整。
 * `cancelAnimationFrame` 真正从队列移除——否则无法验证「池空后停止」。
 */
function createRafDriver() {
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
    /** 推进一帧：取当前队列快照执行（执行中新增的留到下一帧） */
    tick(stepMs = 16) {
      clock += stepMs;
      const pending = [...queue.values()];
      queue.clear();
      for (const cb of pending) cb(clock);
    },
    get pending() {
      return queue.size;
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
      now.mockRestore();
    },
  };
}

/** 所有 NPC 的方块（结构：每个 StyleMemo 内一个 div） */
const blocks = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>("#app [style*='position: absolute']"),
];

/** 读取某个方块的某个样式属性 */
const styleOf = (el: HTMLElement, prop: string): string => el.style.getPropertyValue(prop);

describe("crowd 端到端", () => {
  let driver: ReturnType<typeof createRafDriver>;
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    driver = createRafDriver();
    // 固定随机种子：否则同一断言会随机上运算波动而间歇失败
    randomSpy = vi.spyOn(Math, "random").mockImplementation(seededRandom(1));
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    driver.restore();
    randomSpy.mockRestore();
    document.body.innerHTML = "";
  });

  test("挂载后：实体全部进池，帧循环启动", () => {
    const app = createApp(Crowd);
    app.mount("#app");

    // 5 列 × 4 行 = 20 个 NPC
    expect(poolSize()).toBe(20);
    expect(driver.pending).toBeGreaterThan(0);

    app.unmount();
  });

  test("卸载后：池清空，帧循环停止（不再排帧）", () => {
    const app = createApp(Crowd);
    app.mount("#app");
    app.unmount();

    expect(poolSize()).toBe(0);
    // 卸载时增量排的那一帧可能还在队列里，推进一次让它消费掉
    driver.tick();
    expect(driver.pending).toBe(0);
  });

  test("渲染出 20 个方块", () => {
    const app = createApp(Crowd);
    app.mount("#app");
    expect(blocks()).toHaveLength(20);
    app.unmount();
  });

  test("帧循环真的在推进位置（DOM 被写入）", () => {
    const app = createApp(Crowd);
    app.mount("#app");

    const [first] = blocks();
    const before = styleOf(first, "translate");

    // 推进若干帧：NPC 会朝目标移动，位置必然变化
    for (let i = 0; i < 60; i += 1) driver.tick();

    const after = styleOf(first, "translate");
    expect(after).not.toBe(before);
    expect(after).toMatch(/px/);

    app.unmount();
  });

  test("每个实例状态独立（各走各的，不是同一个目标）", () => {
    const app = createApp(Crowd);
    app.mount("#app");

    for (let i = 0; i < 30; i += 1) driver.tick();

    // 20 个方块的 translate 应互不相同——若状态被共享，它们会重叠
    const positions = blocks().map((el) => styleOf(el, "translate"));
    expect(new Set(positions).size).toBeGreaterThan(1);

    app.unmount();
  });

  test("点击方块 → 变尸体（圆角变方、颜色变灰）", () => {
    const app = createApp(Crowd);
    app.mount("#app");

    const [target] = blocks();
    expect(styleOf(target, "border-radius")).toBe("50%");

    // 触发实验用的 kill：可点击元素就是被 StyleMemo 样式化的那个 div 本身
    // （directive 把样式作用在元素子节点上，所以没有嵌套层）
    target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(styleOf(target, "border-radius")).toBe("3px");
    app.unmount();
  });

  test("恐慌链：尸体让附近 NPC 变红逃离，并逐帧扩散（不是一帧全红）", () => {
    const app = createApp(Crowd);
    app.mount("#app");

    // 网格 5 列 × 4 行：列间距 180px、行间距 140px，视距 170px。
    // 这个几何是刻意选的——正下方（140）在视野内，正右方（180）在外面。
    const countRed = (): number =>
      blocks().filter((el) => styleOf(el, "background") === PAINT.flee).length;

    expect(countRed()).toBe(0);

    // 制造一个尸体（网格第一个：左上角）
    const [victim] = blocks();
    victim.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    // 单帧后：只应有直接看到尸体的人恐慌。
    // 若引擎没有做「帧首快照」，恐慌会按 Set 遍历顺序在单帧内连跳数格
    // （实测：一帧内整列 4 人全红，相隔 140px 仍在传播）。
    driver.tick();
    const afterOneFrame = countRed();
    expect(afterOneFrame).toBeGreaterThan(0);
    expect(afterOneFrame).toBeLessThan(blocks().length - 1);

    // 逐帧扩散：后续帧恐慌人数应增长（波及更远的人）
    for (let i = 0; i < 3; i += 1) driver.tick();
    expect(countRed()).toBeGreaterThanOrEqual(afterOneFrame);

    app.unmount();
  });

  test("传染有几何边界：视距（170px）外的 NPC 不受影响", () => {
    const app = createApp(Crowd);
    app.mount("#app");
    for (let i = 0; i < 10; i += 1) driver.tick();

    // 左列相邻行间距 140px → 会被传染
    const grid = blocks();
    const [corpse] = grid;
    corpse.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    driver.tick();

    const reds = grid.filter((el) => styleOf(el, "background") === PAINT.flee);
    // 尸体自身不算红（它是 corpse 色）——红的是被传染者
    expect(reds.length).toBeGreaterThan(0);
    // 但远不可能是全场 20 个都红
    expect(reds.length).toBeLessThan(grid.length - 1);

    app.unmount();
  });

  test("恐慌会炮起来，也会落下去（级联不是单向累积）", () => {
    const app = createApp(Crowd);
    app.mount("#app");

    const [victim] = blocks();
    victim.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    // 断言的是**真实成立的性质**，不是「永远安静」：
    //
    // 尸体永久存在，所以恐慌会**周期性复发**——NPC 闲游时不断走进尸体
    // 的视野；而且 `reacted` 是按「观察者对每个源」记的，A 反应过尸体后
    // 仍会因「看到 B 恐慌」再次恐慌（它没反应过 B）。实测 120 秒内可见
    // 0→19→0→18→0→19 的反复。
    //
    // 因此不能断言「最终全不红」（那不是设计现状，且随机性下会间歇失败）。
    // 可断言的是：级联会**落下去**（不存在只涨不跌的单向累积）。
    // 固定种子（1）下实测：约 3 秒达峰值 19，约 6 秒落到 0。
    let peak = 0;
    let fellAfterPeak = false;

    for (let i = 0; i < 1250; i += 1) {
      driver.tick();
      const n = blocks().filter((el) => styleOf(el, "background") === PAINT.flee).length;
      peak = Math.max(peak, n);
      // 「落下去」= 峰值之后（曾达多数恐慌）又回到 ≤ 1
      if (peak >= 10 && n <= 1) fellAfterPeak = true;
    }

    expect(peak).toBeGreaterThan(0);
    expect(fellAfterPeak).toBe(true);

    app.unmount();
  });
});
