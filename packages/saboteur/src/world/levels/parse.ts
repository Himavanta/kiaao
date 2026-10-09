// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 地图解析：ASCII → Grid + 符号标记
//
// **本层只解读几何**：瓦片符号（`#` `t` `T` `.`）落地为网格；其余符号
// 原样交出（`SymbolMark`），由游戏层用自己的词汇表解读它是角色还是道具。
//
// 这样 `world/` 不认识任何具体角色（原来有一行 `kind === "player"` 判
// 玩家是否特殊），`game/` 也不必为了拿类型名而反向依赖它。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createGrid, setTile, type Grid } from "../grid";
import { tileForSymbol, type LevelDef } from "./types";

/** 地图上一个「非瓦片」符号的位置——它是什么由游戏层解读 */
export type SymbolMark = {
  /** 原始字符 */
  symbol: string;
  col: number;
  row: number;
};

/** 地图解析结果：网格 + 待解读的符号标记 */
export type ParsedMap = {
  grid: Grid;
  marks: SymbolMark[];
};

/**
 * 把关卡的地图部分解析为网格与符号标记。
 *
 * 行长度不一致时按最长行右侧补地板——手写 ASCII 图容易漏字符，
 * 补位比直接抛错更实用（且是显式、可预期的行为）。
 *
 * **不报告「未知符号」**：未知与否取决于游戏层的词汇表，本层无从判断。
 */
export function parseMap(level: LevelDef): ParsedMap {
  const { rows } = level;
  const cols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const grid = createGrid(cols, rows.length);
  const marks: SymbolMark[] = [];

  for (const [row, line] of rows.entries()) {
    // split("") 而非展开：地图为 ASCII，逐 UTF-16 码元即逐字符
    for (const [col, char] of line.split("").entries()) {
      const tile = tileForSymbol(char);
      if (tile !== undefined) {
        setTile(grid, col, row, tile);
        continue;
      }

      // 非瓦片符号原样交出——「它是谁」不是几何问题
      marks.push({ symbol: char, col, row });
      // 出生点与道具所在格为地板——createGrid 已初始化为 Floor，无需写入
    }
  }

  return { grid, marks };
}
