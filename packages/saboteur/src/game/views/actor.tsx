// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 角色视图：注册实体 + 逐属性渲染
//
// 只注册与渲染，不含游戏逻辑（与 example 的 Ball 同形态）。
// 位置 / 朝向 / 潜行态 / 层级都经派生信号产出，值不变时 memo 生效、
// 不写 DOM。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { StyleMemo } from "engine";
import { Show, type Context } from "kiaao";

import { TILE } from "../../world";
import {
  alarm,
  behaviour,
  define,
  entityCount,
  interaction,
  locomotion,
  perception,
} from "../instance";
import { playerEntity, registerActor } from "../state";
import { ACTOR_SIZE } from "../systems/locomotion";
import type { ActorEntity, Facing, Role } from "../types";

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
  // 两类角色都注册 locomotion / perception / interaction：
  // 交互字段承载 held / dead / poisonLeft——玩家需要（持有与下药），
  // 客人同样需要（被下药、变尸体）。只有导航与行为是客人专属。
  const common = [locomotion.enter, perception.enter, interaction.enter, alarm.enter({ role })];

  // 客人多一个行为状态机（玩家由输入驱动，不跑状态机）
  const enters = role === "guest" ? [...common, behaviour.enter] : common;

  // 数据归组件：state 写全各系统需要的字段。
  // 初值由各系统的 spawn 纯函数产出（D2 方案 B）——「初值怎么算」
  // 留在系统侧（它最清楚自己的字段），视图只负责组合与渲染。
  //
  // 行为字段**两类角色都给**（实体形态统一）：谁跑状态机由「注册了
  // 哪个 enter」决定，而非由字段有无决定。玩家不入行为池，其 mood / path
  // 等字段永不被读写。
  //
  // **必须注解为 `ActorEntity`**：`Signal` 在 TS 里是不变的，
  // 若让 `state` 保持字面量类型，`define` 返回的 `EntitySignal<字面量>`
  // 就无法赋给 `EntitySignal<ActorEntity>`（注册表需要它）。
  const state: ActorEntity = {
    ...locomotion.spawn(speedProps(col, row, role, facing)),
    ...perception.spawn(),
    ...interaction.spawn(),
    ...alarm.spawn(),
    ...behaviour.spawn(),
    role,
  };

  const entity = define(ctx, ...enters)(state);

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

  // 尸体：躺倒（旋转）且压暗，与活人一眼可辨——M6 的目击判读依赖这个区分
  const rotate = useContext(entity, () => (entity().dead ? "90deg" : "0deg"));
  // `class` 传信号才响应：死亡切换尸体样式依赖这一点
  const bodyClass = useContext(entity, () => {
    if (entity().dead) return style.corpse;
    return role === "player" ? style.player : style.guest;
  });

  // 中毒标记：让玩家看到药效正在起作用。
  // 中毒者**继续游荡直到毒发**（有意设计）——尸体位置因此不等于下药位置，
  // 玩家需要预判或跟随。没有这个标记，等待期就是无反馈的黑箱。
  const poisoned = useContext(entity, () => entity().poisonLeft !== null);

  // 恐慌标记：让「传播链在跑」可见。没有它，玩家只能看到 NPC 突然乱跑。
  const panicking = useContext(entity, () => entity().witnessed);

  return (
    <StyleMemo
      value={{
        position: "absolute",
        width: `${ACTOR_SIZE}px`,
        height: `${ACTOR_SIZE}px`,
        zIndex,
        translate,
        scale,
        rotate,
        opacity,
      }}
    >
      {/*
        标记放进被样式化的元素内部，而不是与它并列。
        `Show` 隐藏时会产出注释锚点；若锚点成为指令的直接子节点，框架会
        记一条「directive skipped non-Element child」警告（7 个角色 × 2 个
        标记 = 每帧刷屏）。
      */}
      <div class={bodyClass}>
        <Show value={poisoned}>{() => <span class={style.poisonMark} />}</Show>
        <Show value={panicking}>{() => <span class={style.panicMark} />}</Show>
      </div>
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
