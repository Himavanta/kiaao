// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 角色视图：注册实体 + 逐属性渲染
//
// 只注册与渲染，不含游戏逻辑（与 example 的 Ball 同形态）。
// 位置 / 朝向 / 潜行态 / 层级都经派生信号产出，值不变时 memo 生效、
// 不写 DOM。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { StyleMemo } from "engine";
import { Show, type Context } from "kiaao";

import { TILE, type Cell } from "../../world";
import {
  actor,
  alarm,
  behaviour,
  define,
  entityCount,
  interaction,
  locomotion,
  perception,
} from "../instance";
import { createGuardState } from "../npcs/guard";
import { playerEntity, registerActor } from "../state";
import { ACTOR_SIZE } from "../systems/locomotion";
import type { ActorEntity, Facing, Role } from "../types";
import { isNpc } from "../types";

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
  // 客人同样需要（被下药、变尸体）。只有导航与行为是 NPC 专属。
  const common = [locomotion.enter, perception.enter, interaction.enter, alarm.enter({ role })];

  // NPC 多一个行为状态机（玩家由输入驱动，不跑状态机）。
  // 判据是「是否为 NPC」而非「是否为客人」——加 guard 后二者不再等价。
  const enters = isNpc(role) ? [...common, behaviour.enter] : common;

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
  const base: ActorEntity = {
    ...locomotion.spawn(speedProps(col, row, role, facing)),
    ...perception.spawn({ range: ACTOR_TRAITS[role].sightRange }),
    ...interaction.spawn(),
    ...alarm.spawn(),
    ...behaviour.spawn({ role, post: postFor(col, row, role) }),
    role,
  };

  // ── 实验：只属于保镖的私有数据与方法 ──
  // 走「交叉类型 + 闭包捕获 state」：不改 ActorEntity（它是所有角色的
  // 共享类型，加保镖专用字段会让它重新膨胀）。
  const state = role === "guard" ? createGuardState(base) : base;
  const entersWithHooks = role === "guard" ? [...enters, actor.enter] : enters;

  const entity = define(ctx, ...entersWithHooks)(state);

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
    return style[role];
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

/**
 * 出生参数：位置、速度、视距。
 *
 * **按角色查表**（S1 的全部差别就在这张表）——这正是「参数轴」的落地形态：
 * 同一个动作系统读不同的数，不需要任何新机制（文档 §二）。
 */
const ACTOR_TRAITS: Record<Role, { speed: number; sightRange?: number }> = {
  player: { speed: 190 },
  guest: { speed: 78 },
  // 保镖：巡逻 / 恐慌——比客人快一点、看得远一点（S1 的参数轴）
  guard: { speed: 96, sightRange: 9 * TILE },
};

/**
 * 巡逻岗位（保镖用）：出生格就是它的岗位。
 *
 * 客人返回 null——它们不巡逻。这个字段进实体是必要的：`patrol` 状态的
 * 每帧逻辑要读它，而状态只能从 `self` 拿到数据（文档 §3.3 的边界）。
 */
function postFor(col: number, row: number, role: Role): Cell | null {
  return role === "guard" ? { col, row } : null;
}

function speedProps(col: number, row: number, role: Role, facing: Facing) {
  return {
    x: col * TILE + (TILE - ACTOR_SIZE) / 2,
    y: row * TILE + (TILE - ACTOR_SIZE) / 2,
    speed: ACTOR_TRAITS[role].speed,
    facing,
  };
}
