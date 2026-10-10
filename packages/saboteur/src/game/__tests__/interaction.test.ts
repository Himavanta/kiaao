// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// M2 端到端：真实挂载 + 真实键盘事件 → 玩家在 DOM 中移动
//
// 这是「输入 → 意图 → 移动 → 碰撞 → DOM」的完整链路验证。
// 单测只覆盖各段，链路的接缝（信号未接线、监听未挂载、朝向未写）
// 只有端到端能发现。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// <reference types="node" />
import { readFileSync } from "node:fs";

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import App from "../../app";
import { level, stop } from "../instance";
import { listActors, playerEntity } from "../state";
import { createDriver } from "./helpers";
import { setState } from "./live";

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

  /**
   * 朝向由一个**独立的旋转层**表达：四向写出四个不同角度。
   *
   * 背景：原先用 `scale: -1 1` 镜像表达朝西——但占位形体左右对称，
   * 镜像等于没变，实玩反馈「看不到朝向」。
   *
   * **这条测试能测什么、不能测什么（如实说明）**：
   *
   * - 能测：存在一个专门的朝向标记元素、四个朝向写出四个互不相同的
   *   `rotate` 值。（`scale` 方案下只会是 0/180 两种，且作用在对称体上。）
   * - **不能测：「看起来是否可见」**。那取决于 CSS 形状是否不对称，而
   *   happy-dom 没有布局引擎。实测反证：把箭头改成对称方块后，本用例
   *   仍然通过——所以「可见性」只能靠人眼看（已由实玩确认）。
   *
   * 不假装测到没有的东西：把边界写清楚，比留一条虚假的安心更有用。
   */
  test("朝向由独立的旋转层表达：四向写出四个不同角度", () => {
    const app = createApp(App);
    app.mount("#app");
    const player = playerEntity()!;

    /**
     * 当前朝向对应的角度。
     *
     * **必须只认箭头所在的旋转层**（带 `facing` 类名的 span）：身体本身
     * 也有 `rotate`（尸体躺倒用，活人是 0deg），泛取第一个会永远读到 0。
     */
    const facingDeg = (): string | undefined => {
      // 旋转层是 `facing`（含 rotate），内层箭头是 `facingArrow`（无 rotate）。
      // 两个类名都含 "facing"，故取「有 rotate 的那个」而非第一个匹配。
      for (const marker of document.querySelectorAll("#app span[class*='facing']")) {
        const value = /rotate:\s*([\d.]+deg)/.exec(marker.getAttribute("style") ?? "")?.[1];
        if (value !== undefined) return value;
      }
      return undefined;
    };

    const seen = new Map<string, string>();
    for (const [key, facing] of [
      ["KeyW", "north"],
      ["KeyD", "east"],
      ["KeyS", "south"],
      ["KeyA", "west"],
    ] as const) {
      press(key);
      driver.tick();
      release(key);
      expect(player().facing).toBe(facing);
      seen.set(facing, facingDeg() ?? "");
    }

    // 四个朝向 → 四个互不相同的角度（镜像方案下只会是 0/180 两种）
    const values = [...seen.values()];
    expect(values.every((v) => v !== "")).toBe(true);
    expect(new Set(values).size).toBe(4);

    // 标记元素**每个活着的角色一个**，且是专门的旋转层（不是身体本身）
    const markers = () =>
      [...document.querySelectorAll("#app span[class*='facing']")].filter((el) =>
        el.getAttribute("style")?.includes("rotate"),
      );
    expect(markers().length).toBe(listActors().length);

    // 旋转层与箭头是**两个不同元素**：旋转层负责转，箭头负责居中
    const arrow = document.querySelector("#app span[class*='facing'] span") as HTMLElement;
    expect(arrow).not.toBeNull();
    expect(arrow.className).not.toBe((arrow.parentElement as HTMLElement).className);

    // 尸体不带朝向箭头：它已被 rotate 90deg 放倒，箭头会落在错的位置
    const guest = listActors().find((e) => e().role === "guest")!;
    setState(guest, { dead: true });
    driver.tickTimes(2);
    expect(markers().length).toBe(listActors().length - 1);

    app.unmount();
  });
});

/**
 * 静态校验：**`style.X` 引用的类必须在 SCSS 里有对应规则**。
 *
 * ## 为什么需要这条
 *
 * 曾出过这个 bug：`actor.tsx` 引用 `style.facingArrow`，但
 * `actor.module.scss` 里**没有** `.facingArrow` 规则（一次编辑事故：
 * 中途 `git checkout` 回退了样式，TSX 的引用没跟着改）。后果是那个
 * `<span>` 拿不到任何样式——0×0、不可见。
 *
 * ## 为什么不写成运行时断言（关键教训）
 *
 * **运行时测不出来**。Vitest 默认不处理 CSS：CSS Modules 被替换成一个
 * **Proxy**，访问任何属性都凭空生成一个类名：
 *
 * ```
 * style.facingArrow              → "_facingArrow_03dee2"   // 规则不存在，照样有值
 * style.definitelyNotARealClass  → "_definitelyNotARealClass_03dee2"  // 瞎编的也有
 * ```
 *
 * 而**生产构建**下不存在的类返回 `undefined`，class 变成字面量
 * `"undefined"`——静默失效。所以「断言 className 不是 undefined」这类
 * 测试**永远通过**，给出的是假的安全感（已实测反证：删掉规则后测试仍绿）。
 *
 * 因此改为**读源文件**做静态比对——直接检查那条被违反的不变式。
 */
describe("静态校验 / CSS Module 引用的类必须存在", () => {
  // 直接读源文件：`?raw` 会被 CSS 插件拦下（返回 CSS-module 对象），
  // 所以用 node:fs。reference 是因为本包 tsconfig 的 `types` 只有
  // `vite-plus/client`，不含 node。
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const actorScss = read("../views/actor.module.scss");
  const actorTsx = read("../views/actor.tsx");

  /** 从 SCSS 源里取出所有类名规则（`.foo` / `%foo` 占位符也算） */
  function declaredClasses(scss: string): Set<string> {
    const names = new Set<string>();
    // 行首的 `.name {` 或 `%name {`
    for (const m of scss.matchAll(/^[.%]([A-Za-z][\w-]*)\s*(?=[,{:])/gm)) {
      if (m[1]) names.add(m[1]);
    }
    return names;
  }

  test("actor.tsx 引用的每个 style.X 都在 actor.module.scss 里有规则", () => {
    const declared = declaredClasses(actorScss);
    const referenced = [...actorTsx.matchAll(/style\.([A-Za-z][\w]*)/g)]

      .map((m) => m[1])
      .filter((n): n is string => n !== undefined);

    expect(referenced.length).toBeGreaterThan(0);
    for (const name of new Set(referenced)) {
      expect(declared.has(name)).toBe(true);
    }
  });

  test("校验本身有效：瞎编的类名会被判为不存在", () => {
    expect(declaredClasses(actorScss).has("definitelyNotARealClass")).toBe(false);
    // 而真实存在的类必须被认出（否则「全都通过」可能只是解析器坏了）
    expect(declaredClasses(actorScss).has("facingArrow")).toBe(true);
    expect(declaredClasses(actorScss).has("poisonMark")).toBe(true);
  });
});
