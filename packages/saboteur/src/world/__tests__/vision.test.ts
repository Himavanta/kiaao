// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 视线单测：遮挡、精度、视锥角度、对角缝
//
// 视线的错误最隐蔽——它不会崩溃，只会让 NPC「明明看不见却发现了你」
// 或「就在眼前却视而不见」。靠肉眼调参时，无法分辨是数值问题还是
// 判定逻辑问题，所以必须在纯函数层锁死。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, expect, test } from "vite-plus/test";

import { TILE } from "../geometry";
import { createGrid, setTile } from "../grid";
import { Tile } from "../levels/types";
import { canSee, castRay, computeCone, hasLineOfSight, traverseRay } from "../vision";

/** 从 ASCII 构造网格：`#` 墙、`T` 高家具、`t` 矮家具、`.` 地板 */
function fromAscii(rows: string[]) {
  const grid = createGrid(rows[0].length, rows.length);
  const map: Record<string, Tile> = {
    "#": Tile.Wall,
    T: Tile.HighFurniture,
    t: Tile.LowFurniture,
  };

  rows.forEach((line, row) =>
    line.split("").forEach((ch, col) => {
      const tile = map[ch];
      if (tile !== undefined) setTile(grid, col, row, tile);
    }),
  );

  return grid;
}

/** 格中心坐标 */
const center = (col: number, row: number) => ({
  x: col * TILE + TILE / 2,
  y: row * TILE + TILE / 2,
});

describe("hasLineOfSight / 基本遮挡", () => {
  test("空地直线上无遮挡", () => {
    const grid = createGrid(10, 10);
    expect(hasLineOfSight(grid, center(0, 0), center(9, 9))).toBe(true);
  });

  test("墙在中间：视线被挡", () => {
    const grid = fromAscii([".....", "..#..", "....."]);
    expect(hasLineOfSight(grid, center(0, 1), center(4, 1))).toBe(false);
  });

  test("墙在侧面：不影响视线", () => {
    const grid = fromAscii([".....", "..#..", "..#.."]);
    expect(hasLineOfSight(grid, center(0, 0), center(4, 0))).toBe(true);
  });

  test("高家具挡视线，矮家具不挡", () => {
    const withHigh = fromAscii([".....", "..T..", "....."]);
    const withLow = fromAscii([".....", "..t..", "....."]);

    expect(hasLineOfSight(withHigh, center(0, 1), center(4, 1))).toBe(false);
    expect(hasLineOfSight(withLow, center(0, 1), center(4, 1))).toBe(true);
  });

  test("起点所在格不挡自己的视线", () => {
    // 观察者站在墙里（异常情形）：不应因自身所在格而永远失明
    const grid = createGrid(10, 10);
    setTile(grid, 0, 0, Tile.Wall);
    expect(hasLineOfSight(grid, center(0, 0), center(5, 0))).toBe(true);
  });
});

describe("hasLineOfSight / 对角缝", () => {
  test("两面墙对角相接：视线不能从缝里漏过", () => {
    //  (1,1) 与 (2,2) 为墙，(2,1) 与 (1,2) 为空。
    //  斜穿对角时会同时擦过两面墙的角——物理上不成立。
    const grid = fromAscii([".....", ".#...", "..#..", ".....", "....."]);

    expect(hasLineOfSight(grid, center(1, 2), center(2, 1))).toBe(false);
  });

  test("对角两格都可通行：视线可以穿过", () => {
    const grid = createGrid(5, 5);
    expect(hasLineOfSight(grid, center(1, 1), center(2, 2))).toBe(true);
  });
});

describe("traverseRay / 命中点", () => {
  test("撞墙返回命中点（墙的边界附近）", () => {
    const grid = fromAscii([".....", "..#..", "....."]);
    const hit = traverseRay(grid, center(0, 1), center(4, 1));

    expect(hit).not.toBeNull();
    // 命中点应落在第 2 列墙的左沿附近
    expect(hit!.x).toBeGreaterThanOrEqual(2 * TILE - 1);
    expect(hit!.x).toBeLessThanOrEqual(2 * TILE + 1);
  });

  test("无遮挡返回 null", () => {
    const grid = createGrid(5, 5);
    expect(traverseRay(grid, center(0, 0), center(4, 4))).toBeNull();
  });

  test("起终点重合返回 null（零长度射线）", () => {
    const grid = createGrid(5, 5);
    expect(traverseRay(grid, center(1, 1), center(1, 1))).toBeNull();
  });

  test("地图外视为墙：指向地图外的射线会被挡", () => {
    const grid = createGrid(5, 5);
    const hit = traverseRay(grid, center(2, 2), { x: -100, y: center(2, 2).y });
    expect(hit).not.toBeNull();
  });

  test("maxDist 限制：范围内的墙才算遮挡", () => {
    const grid = fromAscii(["#######", "#.....#", "#..#..#", "#.....#", "#######"]);
    const from = center(1, 2);

    // 墙在 3 格之外：射程 1 格时够不着
    expect(traverseRay(grid, from, center(5, 2), TILE * 1)).toBeNull();
    // 射程充足时命中
    expect(traverseRay(grid, from, center(5, 2), TILE * 10)).not.toBeNull();
  });
});

describe("castRay", () => {
  test("无遮挡时落在最远点", () => {
    const grid = createGrid(20, 20);
    const origin = center(5, 5);
    const end = castRay(grid, origin, 0, 100);

    expect(end.x).toBeCloseTo(origin.x + 100, 4);
    expect(end.y).toBeCloseTo(origin.y, 4);
  });

  test("有遮挡时落在碰撞点", () => {
    const grid = fromAscii([".....", "..#..", "....."]);
    const end = castRay(grid, center(0, 1), 0, 200);

    expect(end.x).toBeLessThanOrEqual(2 * TILE);
  });

  test("角度方向正确（y 轴向下，顺时针为正）", () => {
    const grid = createGrid(20, 20);
    const origin = center(5, 5);

    const east = castRay(grid, origin, 0, 50);
    expect(east.x).toBeGreaterThan(origin.x);
    expect(east.y).toBeCloseTo(origin.y, 4);

    const south = castRay(grid, origin, Math.PI / 2, 50);
    expect(south.y).toBeGreaterThan(origin.y);
    expect(south.x).toBeCloseTo(origin.x, 4);
  });
});

describe("computeCone", () => {
  test("多边形首点为观察点", () => {
    const grid = createGrid(20, 20);
    const origin = center(5, 5);
    const cone = computeCone({ grid, origin, angle: 0, range: 100, halfArc: 0.5, rays: 8 });

    expect(cone[0]).toEqual(origin);
    expect(cone.length).toBe(1 + 9); // 首点 + rays+1 个落点
  });

  test("落点被墙裁剪：比无遮挡时更近", () => {
    const open = createGrid(20, 20);
    const walled = fromAscii([
      "..........",
      "..........",
      "....#.....",
      "..........",
      "..........",
    ]);

    const origin = center(4, 2);
    const opts = { origin, angle: 0, range: 200, halfArc: 0.2, rays: 4 };

    const openCone = computeCone({ grid: open, ...opts });
    const walledCone = computeCone({ grid: walled, ...opts });

    // 正右方第二条射线会撞上第 4 列的墙
    const openMax = Math.max(...openCone.slice(1).map((p) => p.x));
    const walledMax = Math.max(...walledCone.slice(1).map((p) => p.x));

    expect(walledMax).toBeLessThan(openMax);
  });

  test("扇形张角对称：首尾落点关于中心方向对称", () => {
    const grid = createGrid(40, 40);
    const origin = center(20, 20);
    const cone = computeCone({ grid, origin, angle: 0, range: 100, halfArc: 0.6, rays: 10 });

    const [first, last] = [cone[1], cone[cone.length - 1]];
    expect(first.y - origin.y).toBeCloseTo(-(last.y - origin.y), 4);
    // 对称的两点 x 相同
    expect(first.x).toBeCloseTo(last.x, 4);
  });
});

describe("canSee / 三级判定", () => {
  const grid = createGrid(20, 20);
  const origin = center(5, 5);
  const base = { grid, origin, range: 200, halfArc: Math.PI / 4 };

  test("距离超限：看不见", () => {
    expect(canSee({ ...base, angle: 0, range: 50, target: center(15, 5) })).toBe(false);
  });

  test("视线正前方且在射程内：看得见", () => {
    expect(canSee({ ...base, angle: 0, target: center(10, 5) })).toBe(true);
  });

  test("在正后方：看不见", () => {
    expect(canSee({ ...base, angle: 0, target: center(0, 5) })).toBe(false);
  });

  test("恰好落在视锥边缘内 / 外", () => {
    // 半角 45°，正东为 0：目标在正北（90°）刚好在边界外
    expect(canSee({ ...base, angle: 0, target: { x: origin.x, y: origin.y - 100 } })).toBe(false);
    // 45° 内的斜向目标可见
    expect(canSee({ ...base, angle: 0, target: { x: origin.x + 70, y: origin.y + 70 } })).toBe(
      true,
    );
  });

  test("角度跨越 ±PI 边界仍正确（朝西时看见正西目标）", () => {
    // 朝西 = PI。目标在正西方向，差角应为 0 而非 2PI
    const west = { ...base, angle: Math.PI, target: { x: origin.x - 100, y: origin.y } };
    expect(canSee(west)).toBe(true);
  });

  test("与观察者重合：视为可见（不因零向量失明）", () => {
    expect(canSee({ ...base, angle: 0, target: { ...origin } })).toBe(true);
  });

  test("视线被墙挡住：即使距离与角度都满足，仍看不见", () => {
    const walled = fromAscii(["..........", "....#.....", ".........."]);
    const from = center(2, 1);

    expect(
      canSee({
        grid: walled,
        origin: from,
        angle: 0,
        range: 200,
        halfArc: 0.5,
        target: center(8, 1),
      }),
    ).toBe(false);
  });
});
