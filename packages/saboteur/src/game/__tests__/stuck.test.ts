// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 静止与僵死回归测试
//
// 这组用例的由来：一次实测发现「走一会儿人全停下不动」。根因是三个
// 互不相关的 bug 叠加，且都只在长时间运行后显现：
//
// 1. 恐慌永不过期——behaviour 在 witnessed 时早退，moodLeft 再无人递减
// 2. 恐慌目标可能是自身格——findPath 返回空路径，陷入「有目标无路径」
// 3. **空数组是 truthy**——`path ? ... : ...` 把「已在目标格」当成成功，
//    每帧重新规划到当前格，无限空转
//
// 三者都表现为「NPC 站着不动」，靠单点单测很难区分，必须用长时程模拟。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createApp } from "kiaao";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import App from "../../app";
import { alarm, level, stop } from "../instance";
import { gameState, listActors } from "../state";
import { createDriver } from "./helpers";
import { live, setState } from "./live";

/**
 * 驱动器 = 共享帧驱动 + 本文件的两个领域方法。
 *
 * `run` / `runThrough` 只服务本文件（僵死检测、跨终局推进），
 * 故不进 `helpers.ts`——那里只放共同的驱动能力。
 */
function createStuckDriver(stepMs = 16) {
  const base = createDriver(stepMs);

  return {
    ...base,
    /**
     * 推进 frames 帧，返回「所有客人位置完全不变」的最长连续帧数。
     *
     * **终局后停止计数**：游戏结束时规则系统会 stop() 帧循环，此后静止
     * 是正确行为，不是僵死。若把这段也计入，用例会把「正常结束」误报为
     * 缺陷——而警报满值只需约 8 秒，终局远比时限来得早。
     */
    run(frames: number): number {
      let lastKey = "";
      let still = 0;
      let worst = 0;

      for (let i = 0; i < frames; i += 1) {
        base.tick();

        if (gameState.phase() !== "playing") break;

        const guests = listActors().filter((e) => e().role === "guest" && !e().dead);
        const key = guests.map((e) => `${Math.round(e().x)},${Math.round(e().y)}`).join("|");
        if (key === lastKey) {
          still += 1;
          worst = Math.max(worst, still);
        } else {
          still = 0;
        }
        lastKey = key;
      }

      return worst;
    },

    /** 推进 frames 帧，无视终局（用于需要跨过终局的场景） */
    runThrough(frames: number): void {
      for (let i = 0; i < frames; i += 1) base.tick();
    },
  };
}

const guestsOf = () => listActors().filter((e) => e().role === "guest");

describe("僵死回归 / 长期运行", () => {
  let driver: ReturnType<typeof createStuckDriver>;

  beforeEach(() => {
    driver = createStuckDriver();
    document.body.innerHTML = '<div id="app"></div>';
    alarm.reset();
  });

  afterEach(() => {
    stop();
    driver.restore();
  });

  /**
   * 一局的帧数。
   *
   * **不能超出关卡的时限**——到点后规则系统会 stop() 帧循环，之后
   * 一切静止是正确行为，不是僵死。这组用例要测的是「运行期间是否有
   * 僵死」，故以关卡时限为界。
   */
  const runFrames = Math.floor((level.objective.timeLimit - 5) / 0.016);

  test("无事件时：整局内不存在全员静止（含游荡与驻足循环）", () => {
    const app = createApp(App);
    app.mount("#app");

    // 驻足最长 3.5s（约 220 帧），全员同时驻足的窗口远小于 600 帧
    const worst = driver.run(runFrames);

    expect(worst).toBeLessThan(600);
    app.unmount();
  });

  test("尸体引发恐慌后：整局内不存在全员静止（恐慌会结束并恢复游荡）", () => {
    const app = createApp(App);
    app.mount("#app");

    // 大厅中央放一具尸体，触发完整传播链
    const victim = guestsOf()[0];
    setState(victim, { x: 16 * 32, y: 11 * 32, dead: true, path: [], goal: null });

    const worst = driver.run(runFrames);

    // 恐慌结束后若 goal 未被清理，NPC 会「规划到自身格」而无限空转——
    // 这正是本用例要盯住的回归
    expect(worst).toBeLessThan(600);
    app.unmount();
  });

  test("恐慌会到期：单人目击、无人传播时确实结束", () => {
    const app = createApp(App);
    app.mount("#app");

    // **隔离**：只让一个客人目击，其余全部钉到远处死角且背对。
    // 不隔离的话，恐慌会在 NPC 之间反复传播——那是正确行为，
    // 但会掩盖本用例真正要验证的东西：「计时到期后 panic 会不会结束」。
    const witness = guestsOf()[0];
    const corpse = guestsOf()[1];
    const keep = [witness, corpse];

    // 先放好尸体（它是目击的对象），再让 witness 正对它
    setState(corpse, { x: 7 * 32, y: 10 * 32, dead: true, path: [], goal: null });

    for (let i = 0; i < 40 && !witness().witnessed; i += 1) {
      for (const g of guestsOf()) {
        if (keep.includes(g)) continue;
        setState(g, {
          x: 38,
          y: 38,
          facing: "north",
          path: [],
          goal: null,
          idleLeft: 1e6,
        });
      }
      setState(witness, {
        x: 5 * 32,
        y: 10 * 32,
        facing: "east",
        path: [],
        goal: null,
        idleLeft: 1e6,
      });
      driver.tick();
    }

    expect(witness().witnessed).toBe(true);
    expect(witness().mood).toBe("panic");

    // 松开手，跑满剩余时间（把警报压住以免游戏提前结束）
    for (let i = 0; i < runFrames; i += 1) {
      alarm.alarm(0);
      driver.tick();
    }

    // 情绪结束，但记忆保留——这是两者的关键区别
    expect(witness().mood).not.toBe("panic");
    expect(witness().witnessed).toBe(true);

    app.unmount();
  });

  test("恐慌结束后不会退化成「既无路径也无目标」", () => {
    const app = createApp(App);
    app.mount("#app");

    const victim = guestsOf()[0];
    setState(victim, { x: 16 * 32, y: 11 * 32, dead: true, path: [], goal: null });

    // 每帧压回警报：本用例要跨过恐慌全程，而警报满值会让游戏在约 6 秒
    // 就结束（终局后帧循环停止，之后静止是正常的，不是僵死）。
    for (let i = 0; i < runFrames; i += 1) {
      alarm.alarm(0);
      driver.tick();
    }

    // 恐慌早已到期；此时每个客人都该有「正在进行的事」：
    // 有路径、有目标，或正在正常驻足。若三者皆无，就是僵死。
    // 注意：恐慌置位的那一帧会清空 path/goal/idle（让 navigation 重规划），
    // 所以只能断言稳定态，不能断言瞬态。
    //
    // 另：读**活对象**而非渲染快照（`guest()`）——`dead` 的写入要到帧末
    // 才提交给信号，用快照会把死者当成活人（使一个死者因「无工作」而失败）。
    for (const guest of guestsOf()) {
      const a = live(guest);
      if (a.dead) continue;

      const hasWork = a.path.length > 0 || a.goal !== null || a.idleLeft > 0;
      expect(hasWork).toBe(true);
    }

    app.unmount();
  });

  test("长时间运行不产生 NaN 坐标", () => {
    const app = createApp(App);
    app.mount("#app");

    const victim = guestsOf()[0];
    setState(victim, { x: 16 * 32, y: 11 * 32, dead: true, path: [], goal: null });

    driver.run(runFrames - 30);

    for (const entity of listActors()) {
      const a = entity();
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
    }

    app.unmount();
  });
});
