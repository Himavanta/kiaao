// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 瓦片地图层：canvas 预绘制
//
// 地图静态，画一次即可（规划文档 4.2）。32×24 的图用 DOM 是 768 个节点，
// 用 canvas 是 1 个元素一次绘制。
//
// canvas 元素的获取途径只有 `direct`——框架没有 ref API，指令函数是
// 唯一能拿到元素引用的地方。指令作用于**子元素**（而非指令元素本身），
// 所以必须写成包裹形态，不能写成自闭合的 `<Tilemap grid={...} />`。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { direct } from "kiaao";

import { type Grid } from "../../world";
import { paintGrid } from "./paint";

export type TilemapProps = {
  grid: Grid;
};

/**
 * 瓦片地图指令：在地图数据加载后绘制一次。
 *
 * 绘制逻辑抽到 `paint.ts`——canvas 上下文无法在 happy-dom 中获取
 * （`getContext("2d")` 返回 null），把纯计算部分分离出去才能单测
 * 「哪些格被画成什么」，而不是只能靠肉眼。
 *
 * 地图在关卡生命周期内不变，故无订阅、无重绘——重开一局换关卡时，
 * 组件会随 `Show` / `Each` 重建，指令重新执行。
 */
export const Tilemap = direct((el, props) => {
  // el 为 canvas 元素（与 PaintTarget 结构兼容，无需强转）
  paintGrid(el as HTMLCanvasElement, (props as TilemapProps).grid);
});
