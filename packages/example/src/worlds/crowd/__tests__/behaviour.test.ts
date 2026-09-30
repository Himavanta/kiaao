import { describe, expect, test } from "vite-plus/test";

import {
  advance,
  createInitialState,
  flee,
  NPC_SIZE,
  randomGoal,
  senseThreat,
  wander,
  WORLD_H,
  WORLD_W,
  type NpcState,
  type PeerInfo,
  type PeerSource,
  type Threat,
} from "../behaviour";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NPC 行为纯逻辑测试
//
// 这些测试**完全不碰 kiaao**——behaviour.ts 是纯函数模块。这正是把逻辑
// 从组件里拆出来的回报：行为可以独立验证，不必渲染组件、不必跑帧循环。
//
// （对照 ECS 版：行为测试要构造 frame 管理器、注册切片、跑系统。见
//   saboteur 的 navigation.test.ts / stuck.test.ts。）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 构造一个站在原点的闲游 NPC */
function idle(over: Partial<NpcState> = {}): NpcState {
  return { ...createInitialState({ x: 100, y: 100 }), moodLeft: 999, ...over };
}

/** 用一组固定的 peer 造环境 */
function sourceOf(peers: PeerInfo[]): PeerSource {
  return { peers: () => peers };
}

/** 无人的环境 */
const empty: PeerSource = sourceOf([]);

describe("createInitialState", () => {
  test("出生点即目标点（站在原地等下才走）", () => {
    const s = createInitialState({ x: 42, y: 84 });
    expect([s.x, s.y]).toEqual([42, 84]);
    expect([s.goalX, s.goalY]).toEqual([42, 84]);
    expect(s.mood).toBe("wander");
    expect(s.dead).toBe(false);
    expect(s.fleeFrom).toBeNull();
  });
});

describe("senseThreat", () => {
  test("视野内没人 → null", () => {
    expect(senseThreat({ state: idle(), selfId: 0, source: empty })).toBeNull();
  });

  test("活人不算异常", () => {
    const peer: PeerInfo = { id: 1, x: 100, y: 110, dead: false, panicked: false };
    expect(senseThreat({ state: idle(), selfId: 0, source: sourceOf([peer]) })).toBeNull();
  });

  test("尸体算异常", () => {
    const peer: PeerInfo = { id: 1, x: 100, y: 110, dead: true, panicked: false };
    expect(senseThreat({ state: idle(), selfId: 0, source: sourceOf([peer]) })).toEqual({
      x: 100,
      y: 110,
      id: 1,
    });
  });

  test("恐慌者也算异常（这是恐慌能传播的原因）", () => {
    const peer: PeerInfo = { id: 1, x: 120, y: 100, dead: false, panicked: true };
    expect(senseThreat({ state: idle(), selfId: 0, source: sourceOf([peer]) })).not.toBeNull();
  });

  test("排除自己（否则每个恐慌者会看见自己，永远无法平静）", () => {
    const self: PeerInfo = { id: 7, x: 100, y: 100, dead: false, panicked: true };
    expect(senseThreat({ state: idle(), selfId: 7, source: sourceOf([self]) })).toBeNull();
  });

  test("多个异常时取最近的", () => {
    const near: PeerInfo = { id: 1, x: 100, y: 130, dead: true, panicked: false };
    const far: PeerInfo = { id: 2, x: 100, y: 250, dead: true, panicked: false };
    expect(senseThreat({ state: idle(), selfId: 0, source: sourceOf([far, near]) })).toEqual({
      x: 100,
      y: 130,
      id: 1,
    });
  });

  test("已反应过的异常源不再被感知（去重）", () => {
    const peer: PeerInfo = { id: 1, x: 100, y: 110, dead: true, panicked: false };
    const s = idle({ reacted: [1] });
    expect(senseThreat({ state: s, selfId: 0, source: sourceOf([peer]) })).toBeNull();
  });

  test("去重是按源而非按人：没反应过的源仍能被感知", () => {
    const a: PeerInfo = { id: 1, x: 100, y: 110, dead: true, panicked: false };
    const b: PeerInfo = { id: 2, x: 120, y: 100, dead: true, panicked: false };
    const s = idle({ reacted: [1] });
    expect(senseThreat({ state: s, selfId: 0, source: sourceOf([a, b]) })).toMatchObject({ id: 2 });
  });

  test("超出视距（170px）看不见", () => {
    const peer: PeerInfo = { id: 1, x: 100, y: 400, dead: true, panicked: false };
    expect(senseThreat({ state: idle(), selfId: 0, source: sourceOf([peer]) })).toBeNull();
  });
});

describe("wander", () => {
  test("朝目标移动（位移方向正确）", () => {
    const s = idle({ x: 100, y: 100, goalX: 200, goalY: 100 });
    const next = wander({ state: s, dt: 0.1 });
    expect(next.x).toBeGreaterThan(100);
    expect(next.facing).toBe(1);
  });

  test("朝左移动时朝向为 -1", () => {
    const s = idle({ x: 200, y: 100, goalX: 100, goalY: 100 });
    expect(wander({ state: s, dt: 0.1 }).facing).toBe(-1);
  });

  test("到达目标后换新目标", () => {
    const s = idle({ x: 100, y: 100, goalX: 100, goalY: 100 });
    const next = wander({ state: s, dt: 0.1 });
    expect(next.goalX !== 100 || next.goalY !== 100).toBe(true);
  });

  test("计时到期后换新目标", () => {
    const s = idle({ x: 100, y: 100, goalX: 100, goalY: 100, moodLeft: 0.01 });
    const next = wander({ state: s, dt: 0.1 });
    expect(next.moodLeft).toBeGreaterThan(0);
  });

  test("新目标始终在场地内", () => {
    for (let i = 0; i < 50; i += 1) {
      const g = randomGoal();
      expect(g.goalX).toBeGreaterThanOrEqual(0);
      expect(g.goalX).toBeLessThanOrEqual(WORLD_W - NPC_SIZE);
      expect(g.goalY).toBeGreaterThanOrEqual(0);
      expect(g.goalY).toBeLessThanOrEqual(WORLD_H - NPC_SIZE);
    }
  });

  test("换目标不会连带把 NPC 瞬移过去（键名对齐回归测试）", () => {
    // 曾经的 bug：randomGoal 返回 { x, y }，被 `...goal` 展开覆盖了状态
    // 的 x / y，NPC 直接跳到随机点。现要求目标变更与坐标无关。
    const s = idle({ x: 100, y: 100, goalX: 100, goalY: 100 });
    const next = wander({ state: s, dt: 0.1 });
    expect(next.x).toBe(100);
    expect(next.y).toBe(100);
  });
});

describe("flee", () => {
  test("进入恐慌：背对威胁跑（远离参照点）", () => {
    const s = idle({ x: 100, y: 100, mood: "wander" });
    const threat: Threat = { x: 50, y: 100, id: 9 }; // 威胁在左边
    const next = flee({ state: s, threat, dt: 0.1 });
    expect(next.mood).toBe("flee");
    expect(next.x).toBeGreaterThan(100); // 往右逃
  });

  test("威胁消失后沿用记忆中的 fleeFrom 继续跑", () => {
    const s = idle({ x: 100, y: 100, mood: "flee", fleeFrom: { x: 50, y: 100 } });
    const next = flee({ state: s, threat: null, dt: 0.1 });
    expect(next.mood).toBe("flee");
    expect(next.x).toBeGreaterThan(100);
  });

  test("既无威胁也无记忆 → 不恐慌", () => {
    const s = idle({ mood: "wander", fleeFrom: null });
    const next = flee({ state: s, threat: null, dt: 0.1 });
    expect(next.mood).toBe("wander");
    expect(next.moodLeft).toBe(0);
  });

  test("恐慌到期后回到闲游并清掉参照点", () => {
    const s = idle({ mood: "flee", moodLeft: 0.01, fleeFrom: { x: 50, y: 100 } });
    const next = flee({ state: s, threat: { x: 50, y: 100, id: 9 }, dt: 0.1 });
    expect(next.mood).toBe("wander");
    expect(next.fleeFrom).toBeNull();
  });

  test("落点被限制在场地内（不会逃出边界）", () => {
    const s = idle({ x: 5, y: WORLD_H - 5, mood: "flee" });
    const threat: Threat = { x: 100, y: 100, id: 9 };
    const next = flee({ state: s, threat, dt: 0.1 });
    expect(next.goalX).toBeGreaterThanOrEqual(0);
    expect(next.goalX).toBeLessThanOrEqual(WORLD_W - NPC_SIZE);
    expect(next.goalY).toBeGreaterThanOrEqual(0);
    expect(next.goalY).toBeLessThanOrEqual(WORLD_H - NPC_SIZE);
  });

  // ── 以下两个机制都是实测发现「恐慌不炮」后才补的（见实验文档 §5.5）──

  test("进入恐慌时记下源 id（去重的起点）", () => {
    const s = idle({ mood: "wander", reacted: [] });
    const next = flee({ state: s, threat: { x: 50, y: 100, id: 42 }, dt: 0.1 });
    expect(next.reacted).toContain(42);
  });

  test("逃跑途中路过的异常源也会被记下（否则级联无法烧完）", () => {
    // 已处于恐慌，途中看到另一个异常源（id 55）—— 它应被记入 reacted。
    // 若只记进入时的源，永久尸体会反复触发还没反应过它的人，
    // 级联永远不会烧完（实测 10 次里 6 次 120 秒内未平息）。
    const s = idle({ mood: "flee", moodLeft: 5, fleeFrom: { x: 0, y: 100 }, reacted: [7] });
    const next = flee({ state: s, threat: { x: 50, y: 100, id: 55 }, dt: 0.1 });
    expect(next.reacted).toContain(55);
    expect(next.reacted).toContain(7);
  });

  test("参照点粘滞：逃跑途中不因新威胁改变方向", () => {
    // 早期版本每帧重选最近威胁，被两个威胁夹住时方向来回抵消、
    // 人原地卡死（实测 500 帧只移动 1px）。现在 fleeFrom 进入时就固定。
    const s = idle({ x: 100, y: 100, mood: "flee", moodLeft: 5, fleeFrom: { x: 50, y: 100 } });
    // 新威胁在下方，但应继续往右逃（背离原参照点）
    const next = flee({ state: s, threat: { x: 100, y: 300, id: 88 }, dt: 0.1 });
    expect(next.x).toBeGreaterThan(100);
    expect(next.fleeFrom).toEqual({ x: 50, y: 100 });
  });
});

describe("advance", () => {
  test("死者不推进（返回原对象——信号不传播）", () => {
    const s = idle({ dead: true });
    expect(advance({ state: s, selfId: 0, dt: 0.1, source: empty })).toBe(s);
  });

  test("看不见异常 → 保持闲游", () => {
    const s = idle();
    expect(advance({ state: s, selfId: 0, dt: 0.016, source: empty }).mood).toBe("wander");
  });

  test("看见尸体 → 转入恐慌", () => {
    const corpse: PeerInfo = { id: 1, x: 120, y: 100, dead: true, panicked: false };
    const next = advance({ state: idle(), selfId: 0, dt: 0.016, source: sourceOf([corpse]) });
    expect(next.mood).toBe("flee");
  });

  test("处于恐慌中即使暂时看不见也继续逃", () => {
    const s = idle({ mood: "flee", fleeFrom: { x: 0, y: 100 }, moodLeft: 3 });
    expect(advance({ state: s, selfId: 0, dt: 0.016, source: empty }).mood).toBe("flee");
  });

  test("纯函数：不修改传入的 state", () => {
    const s = idle({ x: 100, y: 100, goalX: 300, goalY: 100 });
    const snapshot = { ...s };
    advance({ state: s, selfId: 0, dt: 0.5, source: empty });
    expect(s).toEqual(snapshot);
  });

  test("无事发生时（闲游中途）不换目标", () => {
    const s = idle({ x: 100, y: 100, goalX: 300, goalY: 100, moodLeft: 999 });
    const next = advance({ state: s, selfId: 0, dt: 0.016, source: empty });
    expect([next.goalX, next.goalY]).toEqual([300, 100]);
  });
});

describe("恐慌传播（链式）", () => {
  test("被恐慌者（非尸体）也能触发恐慌", () => {
    // 场景：A 已是恐慌者，B 在视野内 —— B 应该也被传染
    const panicker: PeerInfo = { id: 1, x: 150, y: 100, dead: false, panicked: true };
    const b = idle({ x: 100, y: 100 });
    const next = advance({ state: b, selfId: 2, dt: 0.016, source: sourceOf([panicker]) });
    expect(next.mood).toBe("flee");
  });

  test("传染需要进入视野：距离 170px 外的恐慌者不会引发恐慌", () => {
    const farPanicker: PeerInfo = { id: 1, x: 300, y: 100, dead: false, panicked: true };
    const b = idle({ x: 100, y: 100 });
    const next = advance({ state: b, selfId: 2, dt: 0.016, source: sourceOf([farPanicker]) });
    expect(next.mood).toBe("wander");
  });
});
