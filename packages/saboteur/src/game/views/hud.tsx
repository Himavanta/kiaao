// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HUD：持有道具与交互提示
//
// 订阅的是 `interaction` 的两条信号（持有物 / 提示），而非游戏状态。
// 提示文案由交互系统产出，HUD 只负责显示——判定逻辑不散落到视图层。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context } from "kiaao";

import { alarm, interaction } from "../instance";

import style from "./hud.module.scss";

const ITEM_LABEL: Record<string, string> = { booze: "酒瓶" };

export function Hud(_: Record<string, never>, ctx: Context) {
  const { use } = ctx;

  const held = use(interaction.heldItem, () => {
    const item = interaction.heldItem();
    return item ? (ITEM_LABEL[item] ?? item) : "空手";
  });

  const hint = use(interaction.hint, () => interaction.hint());

  const alarmValue = use(alarm.alarm, () => Math.round(alarm.alarm()));
  const witnesses = use(alarm.witnessCount, () => alarm.witnessCount());

  // 警报等级：越接近满值越紧张，用于切换配色
  const level = use(alarm.alarm, () => {
    const v = alarm.alarm();
    if (v >= 100) return style.critical;
    if (v >= 50) return style.warning;
    return "";
  });

  return (
    <div class={style.hud}>
      <div class={style.row}>
        <span class={style.label}>持有</span>
        <span class={style.value}>{held}</span>
      </div>
      <div class={style.row}>
        <span class={style.label}>目击</span>
        <span class={style.value}>{witnesses}</span>
      </div>
      <div class={style.row}>
        <span class={style.label}>警报</span>
        <span class={[style.value, level].join(" ")}>{alarmValue}</span>
      </div>
      <div class={style.hint}>{hint}</div>
    </div>
  );
}
