// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 可交互物视图：酒瓶
//
// 被拾取后卸载（不入不可见状态）——`Show` 分支的切换就是它的生命周期，
// 与实体池的增删一致（规划文档 4.6 的声明式生灭）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { StyleMemo } from "engine";
import { Show, type Context } from "kiaao";

import { TILE } from "../../world";
import { define, interaction } from "../instance";
import type { ItemKind } from "../types";

import style from "./prop.module.scss";

type PropProps = {
  kind: ItemKind;
  col: number;
  row: number;
};

/**
 * 可交互物：注册实体 + 渲染。
 *
 * 位置写死在注册数据里（道具不移动），因此 `translate` 用静态值，
 * 无需派生——省掉一个永不变化的订阅。
 */
export function Prop({ kind, col, row }: PropProps, ctx: Context) {
  const { use: useContext } = ctx;

  // 道具是异形实体（不是角色）——同一个 define，不同的字段集与 enter。
  // 初值由 spawnProp 做格子 → 像素换算（道具不移动，故无「每帧」概念）。
  const entity = define(
    ctx,
    interaction.enterProp,
  )(interaction.spawnProp({ kind, cell: { col, row } }));

  // 拾取后隐藏：实体仍在（保留 taken 状态），但不再渲染
  const visible = useContext(entity, () => !entity().taken);

  const translate = `${col * TILE + TILE / 2 - 6}px ${row * TILE + TILE / 2 - 10}px`;

  return (
    <Show value={visible}>
      {() => (
        <StyleMemo
          value={{
            position: "absolute",
            width: "12px",
            height: "20px",
            translate,
          }}
        >
          <div class={style.booze} />
        </StyleMemo>
      )}
    </Show>
  );
}
