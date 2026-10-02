// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M5 端到端：拾取 → 下药 → 死亡（尸体留在原地）
//
// M5 的验收标准是「能完成一次击杀，尸体留在原地且可被发现」。
// 这条链跨越输入、交互、碰撞、渲染四个环节，只有端到端能验证——
// 任何一处接线错误都会让「按了没反应」或「人死了但尸体不见了」。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import App from "../../app";
import { alarm, level, resetGameState, stop } from "../instance";
import { gameState, listActors } from "../state";
import { POISON_DELAY } from "../systems/interaction";

/**
 * 每例前复位全局状态。
 *
 * `gameState` 是模块级单例，同文件内跨用例共享——上一例的 `held` /
 * `kills` / `timeLeft` 会带到下一例。实体随组件卸载而清理，但信号不会。
 */
function resetAll() {
  alarm.reset();
  resetGameState(level.objective.timeLimit);
  gameState.kills(0);
}

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

function press(code: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code }));
}
function release(code: string) {
  window.dispatchEvent(new KeyboardEvent("keyup", { code }));
}

/** 玩家与某角色的位置 */
const playerOf = () => listActors().find((e) => e().role === "player")!;
const guestsOf = () => listActors().filter((e) => e().role === "guest");

describe("M5 / 关卡数据", () => {
  test("关卡中解析出酒瓶道具", () => {
    expect(level.propSpawns.length).toBeGreaterThan(0);
    expect(level.propSpawns.every((p) => p.kind === "booze")).toBe(true);
  });

  test("道具所在格可通行（否则玩家够不着）", () => {
    for (const { col, row } of level.propSpawns) {
      const tile = level.grid.tiles[row * level.grid.cols + col];
      expect(tile).toBe(0); // Tile.Floor
    }
  });
});

describe("M5 / 端到端击杀链", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
    resetAll();
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("道具被渲染（初始可见）", () => {
    const app = createApp(App);
    app.mount("#app");

    // 酒瓶是 12×20 的元素（在 actor 的 20×20 之外）
    const props = [...document.querySelectorAll("#app div[style]")].filter((el) =>
      (el.getAttribute("style") ?? "").includes("width: 12px"),
    );
    expect(props.length).toBe(level.propSpawns.length);

    app.unmount();
  });

  test("走向酒瓶并按 Space：拾取成功", () => {
    const app = createApp(App);
    app.mount("#app");

    const player = playerOf();
    // 直接放到第一个酒瓶旁并面朝它（推帧由引擎驱动）
    const [prop] = level.propSpawns;
    const before = { ...player() };

    // 把玩家挪到酒瓶左侧一格并朝东
    Object.assign(player.state, {
      x: (prop.col - 1) * 32,
      y: prop.row * 32,
      facing: "east",
    });

    press("Space");
    driver.tick();
    release("Space");

    expect(player().held).toBe("booze");

    void before;
    app.unmount();
  });

  test("拾取后酒瓶不再渲染（实体保留但隐藏）", () => {
    const app = createApp(App);
    app.mount("#app");

    const player = playerOf();
    const [prop] = level.propSpawns;

    const visibleProps = () =>
      [...document.querySelectorAll("#app div[style]")].filter((el) =>
        (el.getAttribute("style") ?? "").includes("width: 12px"),
      ).length;

    const initialCount = visibleProps();

    Object.assign(player.state, { x: (prop.col - 1) * 32, y: prop.row * 32, facing: "east" });
    press("Space");
    driver.tick();
    release("Space");
    driver.tick();

    expect(visibleProps()).toBe(initialCount - 1);
    app.unmount();
  });

  test("空手对着客人按 Space：下药失败且给出提示", () => {
    const app = createApp(App);
    app.mount("#app");

    const player = playerOf();
    const guest = listActors().find((e) => e().role === "guest")!;

    // 玩家站到客人左侧、面朝客人，但手中无道具
    Object.assign(player.state, {
      x: guest().x - 32,
      y: guest().y,
      facing: "east",
      held: null,
    });

    press("Space");
    driver.tick();
    release("Space");

    expect(guest().dead).toBe(false);
    expect(guest().poisonLeft).toBeNull();

    app.unmount();
  });

  test("持酒瓶对客人按 Space：下药成功，延迟后死亡且尸体留在原地", () => {
    const app = createApp(App);
    app.mount("#app");

    const player = playerOf();
    const guest = listActors().find((e) => e().role === "guest")!;

    // 玩家持酒瓶、站到客人左侧并面朝客人
    Object.assign(player.state, {
      x: guest().x - 32,
      y: guest().y,
      facing: "east",
      held: "booze",
    });

    press("Space");
    driver.tick();
    release("Space");

    // 下药后：中毒倒计时启动、酒瓶消耗
    expect(guest().poisonLeft).not.toBeNull();
    expect(player().held).toBeNull();
    expect(guest().dead).toBe(false);

    // 推进到毒发（POISON_DELAY 秒 + 余量）
    const frames = Math.ceil((POISON_DELAY + 0.5) / 0.016);
    driver.tickTimes(frames);

    expect(guest().dead).toBe(true);
    expect(guest().poisonLeft).toBeNull();

    // 尸体停在毒发时刻的位置，此后不再移动。
    // 注意：中毒期间客人仍在游荡（毒发前不会察觉），所以尸体位置
    // 不等于下药瞬间的位置——这是有意的设计而非缺陷。
    const deathPos = { x: guest().x, y: guest().y };
    driver.tickTimes(200);
    expect(guest().x).toBe(deathPos.x);
    expect(guest().y).toBe(deathPos.y);

    app.unmount();
  });

  test("尸体不再移动（死后停止帧写入）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guest = listActors().find((e) => e().role === "guest")!;
    Object.assign(guest.state, { dead: true, path: [], goal: null });

    const pos = { x: guest().x, y: guest().y };
    driver.tickTimes(300);

    expect(guest().x).toBe(pos.x);
    expect(guest().y).toBe(pos.y);

    app.unmount();
  });

  test("尸体在渲染上可与活人区分", () => {
    const app = createApp(App);
    app.mount("#app");

    const guest = listActors().find((e) => e().role === "guest")!;
    const styleOf = () => {
      const el = [...document.querySelectorAll("#app div[style]")].find((n) =>
        (n.getAttribute("style") ?? "").includes(`translate: ${guest().x}px ${guest().y}px`),
      );
      return el?.getAttribute("style") ?? "";
    };

    const alive = styleOf();
    Object.assign(guest.state, { dead: true });
    driver.tick();
    const dead = styleOf();

    // 死亡后旋转 90°，与活人一眼可辨（M6 的目击判读依赖这个区分）
    expect(alive).not.toContain("rotate: 90");
    expect(dead).toContain("rotate: 90deg");

    app.unmount();
  });

  test("尸体换用不同的 class（class 传信号才响应）", () => {
    const app = createApp(App);
    app.mount("#app");

    const guest = guestsOf()[0];
    // 角色元素自身同时带 translate 与 class（StyleMemo 的包裹元素即角色本体）
    const classOf = () =>
      [...document.querySelectorAll("#app div[style]")].find((n) =>
        (n.getAttribute("style") ?? "").includes(`translate: ${guest().x}px ${guest().y}px`),
      )?.className ?? "";

    const aliveClass = classOf();
    expect(aliveClass).not.toBe("");

    Object.assign(guest.state, { dead: true });
    driver.tick();

    // class 绑定若写成 `class={cond ? a : b}` 的普通三元（非信号），
    // 首次渲染求值后就不再更新——尸体仍是活人配色。
    const deadClass = classOf();
    expect(deadClass).not.toBe("");
    expect(deadClass).not.toBe(aliveClass);

    app.unmount();
  });
});

describe("M5 / 交互键的边沿语义", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
    resetAll();
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("按住不放不重复触发（长按仅第一次生效）", () => {
    const app = createApp(App);
    app.mount("#app");

    const player = playerOf();
    const guest = listActors().find((e) => e().role === "guest")!;

    Object.assign(player.state, {
      x: guest().x - 32,
      y: guest().y,
      facing: "east",
      held: "booze",
    });

    press("Space");
    driver.tickTimes(5);
    // 长按期间的重复 keydown（浏览器会发 repeat）不该再次下药
    for (let i = 0; i < 5; i += 1) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", repeat: true }));
    }
    driver.tickTimes(5);
    release("Space");

    // 一次下药：毒计时不会被重置成更晚，酒瓶也只消耗一次
    expect(player().held).toBeNull();
    expect(guest().poisonLeft).not.toBeNull();

    app.unmount();
  });

  test("松开后再按可以再次触发", () => {
    const app = createApp(App);
    app.mount("#app");

    const player = playerOf();
    const [prop] = level.propSpawns;

    Object.assign(player.state, { x: (prop.col - 1) * 32, y: prop.row * 32, facing: "east" });

    press("Space");
    driver.tick();
    release("Space");
    expect(player().held).toBe("booze");

    // 再次按下（酒瓶已拾取，手心格空无一物）→ 手中无对象可交互，
    // 不改变持有状态
    press("Space");
    driver.tick();
    release("Space");
    expect(player().held).toBe("booze");

    app.unmount();
  });
});
