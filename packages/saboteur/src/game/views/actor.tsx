// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 角色视图：注册实体 + 逐属性渲染
//
// 只注册与渲染，不含游戏逻辑（与 example 的 Ball 同形态）。
// 位置 / 朝向 / 潜行态 / 层级都经派生信号产出，值不变时 memo 生效、
// 不写 DOM。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { type Context } from "kiaao";

import { StyleMemo } from "../../engine/directives";
import { TILE } from "../../world";
import { behaviour, entityCount, locomotion, navigation, perception, useEntity } from "../instance";
import { playerEntity, registerActor } from "../state";
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

/** 朝向 → 是否水平镜像（图集只画朝右，其余靠翻转） */
function isFlipped(facing: Facing): boolean {
  return facing === "west";
}

export function Actor({ col, row, facing, role }: ActorProps, ctx: Context) {
  const { use: useContext, onMount, onUnmount } = ctx;

  onMount(() => entityCount(entityCount() + 1));
  onUnmount(() => entityCount(entityCount() - 1));

  // 客人注册导航与行为系统（玩家不入池——它的意图来自输入）
  const enters =
    role === "guest"
      ? [
          locomotion.enter(speedProps(col, row, role, facing)),
          navigation.enter(),
          behaviour.enter(),
          perception.enter(),
        ]
      : [locomotion.enter(speedProps(col, row, role, facing)), perception.enter()];

  const entity = useEntity(ctx, ...enters, () => ({ role }));

  // 全局注册表：玩家供相机跟随，全部角色供视锥调试层遍历。
  // 卸载时反注册，避免调试层指向已销毁的信号。
  if (role === "player") {
    onMount(() => playerEntity(entity));
    onUnmount(() => playerEntity(undefined));
  }
  onMount(() => {
    const unregister = registerActor(entity);
    onUnmount(unregister);
  });

  const translate = useContext(entity, () => {
    const { x, y } = entity();
    return `${x}px ${y}px`;
  });

  // 朝向与潜行态：各自派生，互不影响。
  // 镜像用 `scale`（真实 CSS 属性）而非自造的 `flip`——后者会被浏览器丢弃。
  const scale = useContext(entity, () => (isFlipped(entity().facing) ? "-1 1" : "1 1"));
  const opacity = useContext(entity, () => (entity().sneaking ? "0.55" : "1"));

  // 深度排序：按 y 量化到格子精度。量化后相邻帧多数取值相同，
  // memo 生效，写入频率远低于每帧。
  const zIndex = useContext(entity, () => `${Math.round(entity().y / TILE)}`);

  return (
    <StyleMemo
      value={{
        position: "absolute",
        width: `${ACTOR_SIZE}px`,
        height: `${ACTOR_SIZE}px`,
        zIndex,
        translate,
        scale,
        opacity,
      }}
    >
      <div class={role === "player" ? style.player : style.guest} />
    </StyleMemo>
  );
}

/** 出生位置与速度：玩家略快于客人 */
function speedProps(col: number, row: number, role: Role, facing: Facing) {
  return {
    x: col * TILE + (TILE - ACTOR_SIZE) / 2,
    y: row * TILE + (TILE - ACTOR_SIZE) / 2,
    speed: role === "player" ? 190 : 78,
    facing,
  };
}
