// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 交互几何单测：面朝格、背后判定、触及距离
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, expect, test } from "vite-plus/test";

import { TILE } from "../geometry";
import {
  cellInFront,
  facingVector,
  isBehind,
  isInFront,
  normalize,
  withinReach,
} from "../interaction";

describe("facingVector", () => {
  test("四向映射正确", () => {
    expect(facingVector("north")).toEqual({ dx: 0, dy: -1 });
    expect(facingVector("south")).toEqual({ dx: 0, dy: 1 });
    expect(facingVector("west")).toEqual({ dx: -1, dy: 0 });
    expect(facingVector("east")).toEqual({ dx: 1, dy: 0 });
  });

  test("未知朝向返回零向量（不抛异常）", () => {
    expect(facingVector("sideways")).toEqual({ dx: 0, dy: 0 });
  });
});

describe("cellInFront", () => {
  test("返回面朝方向的一格之外", () => {
    const origin = { x: 100, y: 100 };

    expect(cellInFront(origin, "east")).toEqual({ x: 100 + TILE, y: 100 });
    expect(cellInFront(origin, "north")).toEqual({ x: 100, y: 100 - TILE });
    expect(cellInFront(origin, "west")).toEqual({ x: 100 - TILE, y: 100 });
    expect(cellInFront(origin, "south")).toEqual({ x: 100, y: 100 + TILE });
  });

  test("未知朝向：原地（不误移一格）", () => {
    const origin = { x: 100, y: 100 };
    expect(cellInFront(origin, "nope")).toEqual(origin);
  });
});

describe("withinReach", () => {
  test("范围内为真，范围外为假", () => {
    const a = { x: 0, y: 0 };
    expect(withinReach(a, { x: 10, y: 0 }, 20)).toBe(true);
    expect(withinReach(a, { x: 30, y: 0 }, 20)).toBe(false);
  });

  test("恰好等于距离：为真（含边界）", () => {
    expect(withinReach({ x: 0, y: 0 }, { x: 20, y: 0 }, 20)).toBe(true);
  });
});

describe("isBehind / isInFront", () => {
  test("目标朝东：西方在其背后，东方在其正面", () => {
    const west = { dx: -1, dy: 0 };
    const east = { dx: 1, dy: 0 };

    expect(isBehind("east", west)).toBe(true);
    expect(isInFront("east", east)).toBe(true);

    expect(isBehind("east", east)).toBe(false);
    expect(isInFront("east", west)).toBe(false);
  });

  test("正侧方（点积为 0）既不算背后也不算正面", () => {
    const side = { dx: 0, dy: 1 };
    expect(isBehind("east", side)).toBe(false);
    expect(isInFront("east", side)).toBe(false);
  });

  test("四向各自成立", () => {
    expect(isBehind("north", { dx: 0, dy: 1 })).toBe(true);
    expect(isBehind("south", { dx: 0, dy: -1 })).toBe(true);
    expect(isBehind("west", { dx: 1, dy: 0 })).toBe(true);
  });

  test("零向量（重合）：不算背后（不构成背刺）", () => {
    expect(isBehind("east", { dx: 0, dy: 0 })).toBe(false);
  });
});

describe("normalize", () => {
  test("归一化后长度为 1", () => {
    const n = normalize({ dx: 3, dy: 4 });
    expect(Math.hypot(n.dx, n.dy)).toBeCloseTo(1, 10);
  });

  test("零向量返回零向量（不产生 NaN）", () => {
    expect(normalize({ dx: 0, dy: 0 })).toEqual({ dx: 0, dy: 0 });
  });
});
