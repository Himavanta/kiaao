// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HUD：持有道具与交互提示
//
// 订阅的是 `interaction` 的两条信号（持有物 / 提示），而非游戏状态。
// 提示文案由交互系统产出，HUD 只负责显示——判定逻辑不散落到视图层。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context } from "kiaao";

import { interaction } from "../instance";

import style from "./hud.module.scss";

const ITEM_LABEL: Record<string, string> = { booze: "酒瓶" };

export function Hud(_: Record<string, never>, ctx: Context) {
  const { use } = ctx;

  const held = use(interaction.heldItem, () => {
    const item = interaction.heldItem();
    return item ? (ITEM_LABEL[item] ?? item) : "空手";
  });

  const hint = use(interaction.hint, () => interaction.hint());

  return (
    <div class={style.hud}>
      <div class={style.row}>
        <span class={style.label}>持有</span>
        <span class={style.value}>{held}</span>
      </div>
      <div class={style.hint}>{hint}</div>
    </div>
  );
}
