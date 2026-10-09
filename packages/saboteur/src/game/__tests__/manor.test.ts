// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 关卡数据健全性：手写 ASCII 图容易出错，且错误是静默的
//
// 地图网格错位、区域不通、出生点落在墙里——这些都不会抛异常，
// 只会在跑起来后表现为「AI 卡住」「走不到某处」，很难定位。
// 此处的用例把这类问题挡在关卡编辑阶段。
//
// **住在 `game/` 而非 `world/`**：这些用例要用游戏层的词汇表
// （`parseLevel` 把符号解读为角色），而 `world` 只解读几何。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, expect, test } from "vite-plus/test";

import { isBlocked, Tile, type Grid } from "../../world";
import { manor } from "../../world";
import { parseLevel, validateLevel } from "../level";

/** 四邻域方向 */
const NEIGHBORS: Array<[number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

/** 从起点洪泛，返回可达的格子集合（键为 `col,row`） */
function floodFill(grid: Grid, start: { col: number; row: number }): Set<string> {
  const seen = new Set<string>([`${start.col},${start.row}`]);
  const queue: Array<[number, number]> = [[start.col, start.row]];

  // 广度优先：用索引推进而非 shift，避免大图上的 O(n²)
  for (let head = 0; head < queue.length; head += 1) {
    const [col, row] = queue[head];
    for (const [dc, dr] of NEIGHBORS) {
      const nc = col + dc;
      const nr = row + dr;
      const key = `${nc},${nr}`;
      if (seen.has(key) || isBlocked(grid, nc, nr)) continue;
      seen.add(key);
      queue.push([nc, nr]);
    }
  }

  return seen;
}

/** 统计地图中的地板格总数 */
function countFloors(grid: Grid): number {
  return [...grid.tiles].filter((t) => t === Tile.Floor).length;
}

describe("庄园关卡 / 健全性", () => {
  test("校验无问题（行等长、有玩家出生点、无未知符号）", () => {
    expect(validateLevel(manor)).toEqual([]);
  });

  test("玩家出生点存在且不落在实心格", () => {
    const { grid, playerSpawn } = parseLevel(manor);

    expect(playerSpawn).toBeDefined();
    const { col, row } = playerSpawn!;
    expect(isBlocked(grid, col, row)).toBe(false);
  });

  test("所有 NPC 出生点不落在实心格", () => {
    const { grid, npcSpawns } = parseLevel(manor);

    expect(npcSpawns.length).toBeGreaterThan(0);
    for (const { col, row } of npcSpawns) {
      expect(isBlocked(grid, col, row)).toBe(false);
    }
  });

  test("全图连通：从玩家出生点可达所有地板与全部 NPC", () => {
    const { grid, playerSpawn, npcSpawns } = parseLevel(manor);
    const reachable = floodFill(grid, playerSpawn!);

    // 无孤岛——否则玩家永远到不了某些区域，AI 也可能被生成在死区
    expect(reachable.size).toBe(countFloors(grid));

    for (const { col, row } of npcSpawns) {
      expect(reachable.has(`${col},${row}`)).toBe(true);
    }
  });

  test("地图四周封闭：边界行与列全为墙", () => {
    const { grid } = parseLevel(manor);

    // 边界漏空会让实体走出地图；虽然越界查询安全，但视觉上不合理
    for (const col of Array.from({ length: grid.cols }, (_, i) => i)) {
      expect(isBlocked(grid, col, 0)).toBe(true);
      expect(isBlocked(grid, col, grid.rows - 1)).toBe(true);
    }
    for (const row of Array.from({ length: grid.rows }, (_, i) => i)) {
      expect(isBlocked(grid, 0, row)).toBe(true);
      expect(isBlocked(grid, grid.cols - 1, row)).toBe(true);
    }
  });

  test("存在矮家具与高家具：两类遮挡都在关卡中被实际使用", () => {
    const { grid } = parseLevel(manor);
    const tiles = new Set(grid.tiles);

    // 两类家具都在图里——否则「不挡视线的遮挡物」这个玩法维度是空谈
    expect(tiles.has(Tile.LowFurniture)).toBe(true);
    expect(tiles.has(Tile.HighFurniture)).toBe(true);
  });

  test("家具不贴边：四周留出可通行的走廊", () => {
    const { grid, playerSpawn } = parseLevel(manor);
    const reachable = floodFill(grid, playerSpawn!);

    // 边界内侧一圈应基本可通行，避免关卡显得局促
    const innerRing = [
      ...Array.from({ length: grid.cols - 2 }, (_, i) => [i + 1, 1] as const),
      ...Array.from({ length: grid.cols - 2 }, (_, i) => [i + 1, grid.rows - 2] as const),
    ];
    const walkable = innerRing.filter(([c, r]) => reachable.has(`${c},${r}`));

    expect(walkable.length).toBeGreaterThan(innerRing.length * 0.5);
  });
});
