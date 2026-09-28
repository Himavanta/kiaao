// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【M0 脚手架】标记视图：验证「实体 → DOM」的逐属性更新通路
//
// 只注册实体并渲染，不含游戏逻辑（与 example 的 Ball 同形态）。
// 位置经派生信号产出字符串；值不变时 memo 生效、不写 DOM——
// 细粒度渲染的前提，此组件是它的最小验证载体。M2 落地时删除。
//
// 注意：类名写在子元素上。指令的 props 传给指令函数，不作用于 DOM
// 元素，因此 `<StyleMemo class="...">` 不会生效。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { type Context } from "kiaao";

import { StyleMemo } from "../../engine/directives";
import { entityCount, scaffold, useEntity } from "../instance";

import style from "./marker.module.scss";

type MarkerProps = {
  /** 圆周运动中心（世界坐标） */
  cx: number;
  cy: number;
  /** 圆周半径 */
  radius: number;
  /** 角速度（rad/s） */
  speed: number;
  color: string;
};

export function Marker({ cx, cy, radius, speed, color }: MarkerProps, ctx: Context) {
  const { use: useContext, onMount, onUnmount } = ctx;

  onMount(() => entityCount(entityCount() + 1));
  onUnmount(() => entityCount(entityCount() - 1));

  const entity = useEntity(ctx, scaffold.enter({ cx, cy, radius, speed }));

  const translate = useContext(entity, () => {
    const { x, y } = entity();
    return `${x}px ${y}px`;
  });

  return (
    <StyleMemo
      value={{
        position: "absolute",
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        background: color,
        translate,
      }}
    >
      <div class={style.marker} />
    </StyleMemo>
  );
}
