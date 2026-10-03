// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M2 端到端：真实挂载 + 真实键盘事件 → 玩家在 DOM 中移动
//
// 这是「输入 → 意图 → 移动 → 碰撞 → DOM」的完整链路验证。
// 单测只覆盖各段，链路的接缝（信号未接线、监听未挂载、朝向未写）
// 只有端到端能发现。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import App from "../../app";
import { level, stop } from "../instance";
import { playerEntity } from "../state";
import { createDriver } from "./helpers";

function press(code: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code }));
}
function release(code: string) {
  window.dispatchEvent(new KeyboardEvent("keyup", { code }));
}

describe("M2 端到端 / 输入驱动移动", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  /** 挂载并返回玩家实体信号 */
  function mount() {
    const app = createApp(App);
    app.mount("#app");
    // 玩家在 Actor 组件内注册，挂载后即可从注册表读到
    const player = playerEntity();
    expect(player).toBeDefined();
    return { app, player: player! };
  }

  test("玩家实体注册到全局表（相机跟随的前提）", () => {
    const { app, player } = mount();
    expect(player.id).toBeTypeOf("symbol");
    expect(player().role).toBe("player");
    app.unmount();
  });

  test("按下方向键后，玩家位置随帧推进而改变", () => {
    const { app, player } = mount();
    const before = player().x;

    press("KeyD");
    for (let i = 0; i < 10; i += 1) driver.tick();
    release("KeyD");

    expect(player().x).toBeGreaterThan(before);
    app.unmount();
  });

  test("未按键时玩家不动", () => {
    const { app, player } = mount();
    const before = { x: player().x, y: player().y };

    for (let i = 0; i < 10; i += 1) driver.tick();

    expect(player().x).toBe(before.x);
    expect(player().y).toBe(before.y);
    app.unmount();
  });

  test("朝向随移动方向更新", () => {
    const { app, player } = mount();

    press("KeyD");
    driver.tick();
    release("KeyD");
    expect(player().facing).toBe("east");

    press("KeyS");
    driver.tick();
    release("KeyS");
    expect(player().facing).toBe("south");

    press("KeyA");
    driver.tick();
    release("KeyA");
    expect(player().facing).toBe("west");

    press("KeyW");
    driver.tick();
    release("KeyW");
    expect(player().facing).toBe("north");

    app.unmount();
  });

  test("撞墙后停下：位置不再随按键变化", () => {
    const { app, player } = mount();

    // 一路向右走。玩家速度 190px/s、帧步长 16ms，
    // 从 col 15 走到右墙约需 100 帧，此处给足余量
    press("KeyD");
    driver.tickTimes(300);
    const atWall = player().x;
    expect(atWall).toBeGreaterThan(0);

    driver.tickTimes(50);
    release("KeyD");

    // 已贴墙：继续按也不会前进
    expect(player().x).toBe(atWall);
    // 且没有穿出地图
    expect(atWall).toBeLessThan(level.grid.cols * 32);
    app.unmount();
  });

  test("撞墙后停下：贴住墙的左沿而非停在半途", () => {
    const { app, player } = mount();

    press("KeyD");
    driver.tickTimes(300);
    release("KeyD");

    const rightEdge = player().x + 20; // ACTOR_SIZE
    const wallLeft = (level.grid.cols - 1) * 32;

    // 紧贴右墙内侧：差距远小于一帧位移（190px/s × 16ms ≈ 3px）
    expect(wallLeft - rightEdge).toBeLessThan(4);
    app.unmount();
  });

  test("Shift 潜行：移动更慢且实体标记为潜行中", () => {
    const { app, player } = mount();

    press("KeyD");
    driver.tickTimes(10);
    const normalDistance = player().x;
    release("KeyD");
    app.unmount();

    // 重开一份干净的应用状态
    document.body.innerHTML = '<div id="app"></div>';
    const { app: app2 } = mount();
    const player2 = playerEntity()!;

    press("ShiftLeft");
    press("KeyD");
    driver.tickTimes(10);

    expect(player2().sneaking).toBe(true);
    expect(player2().x).toBeLessThan(normalDistance);

    release("KeyD");
    release("ShiftLeft");
    app2.unmount();
  });
});

describe("M2 端到端 / 渲染", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  test("玩家 DOM 元素的 translate 随移动更新", () => {
    const app = createApp(App);
    app.mount("#app");

    const player = playerEntity()!;
    /** 按实体位置定位 DOM 元素 */
    const findEl = () => {
      const { x, y } = player();
      return [...document.querySelectorAll("#app div[style]")].find((node) =>
        (node.getAttribute("style") ?? "").includes(`translate: ${x}px ${y}px`),
      );
    };

    expect(findEl()).toBeDefined();

    press("KeyD");
    driver.tickTimes(10);
    release("KeyD");

    // 按新位置仍能找到该元素——证明 DOM 跟随信号
    expect(findEl()).toBeDefined();
    app.unmount();
  });

  test("朝西时 DOM 水平镜像（scale）", () => {
    const app = createApp(App);
    app.mount("#app");
    const player = playerEntity()!;

    press("KeyA");
    driver.tick();
    release("KeyA");

    expect(player().facing).toBe("west");

    const { x, y } = player();
    const mirrored = [...document.querySelectorAll("#app div[style]")].some((node) => {
      const s = node.getAttribute("style") ?? "";
      return s.includes(`translate: ${x}px ${y}px`) && s.includes("scale: -1 1");
    });
    expect(mirrored).toBe(true);

    app.unmount();
  });
});
