// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 视口推导：视口与地图尺寸的关系
//
// 这组用例的由来：视口曾硬编码为 960×640，而地图是 1024×768——
// 结果右墙与下墙落在视口之外，画面看起来像「地图没画完」。
// 绘制本身没错，是取景范围错了，且没有任何测试覆盖这条约束。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, expect, test } from "vite-plus/test";

import { TILE } from "../../world";
import { computeViewport, MAX_VIEW_H, MAX_VIEW_W } from "../config";

describe("computeViewport / 地图不超过上限", () => {
  test("视口等于地图尺寸：整张地图一屏可见（含四周边界墙）", () => {
    const viewport = computeViewport(32, 24);

    expect(viewport.width).toBe(32 * TILE);
    expect(viewport.height).toBe(24 * TILE);
  });

  test("小地图不被拉伸：视口随地图收缩", () => {
    const viewport = computeViewport(10, 8);

    expect(viewport.width).toBe(10 * TILE);
    expect(viewport.height).toBe(8 * TILE);
  });

  test("视口不小于地图，故相机可移动范围为零", () => {
    // 相机夹取用 Math.max(0, worldSize - viewportSize)——
    // 视口 >= 世界时该值为 0，相机恒定在原点
    const cols = 32;
    const rows = 24;
    const viewport = computeViewport(cols, rows);

    expect(Math.max(0, cols * TILE - viewport.width)).toBe(0);
    expect(Math.max(0, rows * TILE - viewport.height)).toBe(0);
  });
});

describe("computeViewport / 地图超过上限", () => {
  test("视口封顶，转为相机卷轴", () => {
    const viewport = computeViewport(200, 200);

    expect(viewport.width).toBe(MAX_VIEW_W);
    expect(viewport.height).toBe(MAX_VIEW_H);
  });

  test("宽高分别判定：一维超限不影响另一维", () => {
    // 很宽但很矮的地图：宽度封顶、高度贴合地图
    const viewport = computeViewport(200, 10);

    expect(viewport.width).toBe(MAX_VIEW_W);
    expect(viewport.height).toBe(10 * TILE);
  });

  test("封顶后相机有可移动空间", () => {
    const cols = 200;
    const rows = 200;
    const viewport = computeViewport(cols, rows);

    expect(Math.max(0, cols * TILE - viewport.width)).toBeGreaterThan(0);
    expect(Math.max(0, rows * TILE - viewport.height)).toBeGreaterThan(0);
  });
});
