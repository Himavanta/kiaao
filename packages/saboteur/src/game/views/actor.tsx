// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 角色视图：注册实体 + 逐属性渲染
//
// 只注册与渲染，不含游戏逻辑（与 example 的 Ball 同形态）。
// 位置 / 朝向 / 潜行态都经派生信号产出，值不变时 memo 生效、不写 DOM。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { type Context } from "kiaao";

import { StyleMemo } from "../../engine/directives";
import { TILE } from "../../world";
import { entityCount, locomotion, useEntity } from "../instance";
import { playerEntity } from "../state";
import { ACTOR_SIZE } from "../systems/locomotion";
import type { Facing, Role } from "../types";

import style from "./actor.module.scss";

type ActorProps = {
  /** 出生格坐标 */
  col: number;
  row: number;
  /** 初始朝向 */
  facing: Facing;
  role: Role;
};

/** 朝向 → 翻转：图集只画朝右，其余方向靠水平翻转 */
function isFlipped(facing: Facing): boolean {
  return facing === "west";
}

export function Actor({ col, row, facing, role }: ActorProps, ctx: Context) {
  const { use: useContext, onMount, onUnmount } = ctx;

  onMount(() => entityCount(entityCount() + 1));
  onUnmount(() => entityCount(entityCount() - 1));

  const entity = useEntity(
    ctx,
    locomotion.enter({
      x: col * TILE + (TILE - ACTOR_SIZE) / 2,
      y: row * TILE + (TILE - ACTOR_SIZE) / 2,
      speed: role === "player" ? 190 : 120,
      facing,
    }),
    () => ({ role }),
  );

  // 玩家注册到全局表：相机据此跟随（组件树无法向上传出实体信号，
  // 框架没有 ref API）。卸载时清空，避免相机指向已销毁的信号。
  if (role === "player") {
    onMount(() => playerEntity(entity));
    onUnmount(() => playerEntity(undefined));
  }

  const translate = useContext(entity, () => {
    const { x, y } = entity();
    return `${x}px ${y}px`;
  });

  // 朝向与潜行态：各自派生，互不影响
  // 镜像用 `scale`（真实 CSS 属性）而非自造的 `flip`——后者会被浏览器丢弃
  const scale = useContext(entity, () => (isFlipped(entity().facing) ? "-1 1" : "1 1"));
  const opacity = useContext(entity, () => (entity().sneaking ? "0.55" : "1"));

  return (
    <StyleMemo
      value={{
        position: "absolute",
        width: `${ACTOR_SIZE}px`,
        height: `${ACTOR_SIZE}px`,
        translate,
        scale,
        opacity,
      }}
    >
      <div class={role === "player" ? style.player : style.guest} />
    </StyleMemo>
  );
}
