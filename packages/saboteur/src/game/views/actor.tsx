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
  actor,
  alarm,
  behaviour,
  define,
  entityCount,
  interaction,
  locomotion,
  perception,
} from "../instance";
import { actorDefs } from "../npcs";
import type { NpcDef } from "../npcs/types";
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

/**
 * 朝向 → 箭头旋转角度（deg）。
 *
 * 基准箭头朝上（0°），顺时针为正——与 CSS `rotate` 一致。
 * 不用 `scale: -1 1` 镜像：占位形体是左右对称的，镜像等于没变
 * （实玩反馈「看不到朝向」的根因）。
 */
const FACING_DEGREES: Record<Facing, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

export function Actor({ col, row, facing, role }: ActorProps, ctx: Context) {
  const { use: useContext, onMount, onUnmount } = ctx;

  onMount(() => entityCount(entityCount() + 1));
  onUnmount(() => entityCount(entityCount() - 1));

  // 公共系统：所有角色都注册。
  // locomotion / perception / interaction 承载位置、视锥、持有与中毒——
  // 玩家与 NPC 都需要（玩家要持有与下药，客人要被下药、变尸体）。
  // `alarm.enter` 内部按 role 判定是否入恐慌池（玩家不入）。
  const common = [locomotion.enter, perception.enter, interaction.enter, alarm.enter({ role })];

  // 本角色的户口本（数值 / 状态 / 私有数据 / 岗位都在里面）
  const def: NpcDef = actorDefs[role];

  // 能力 → 系统的推导：
  // - 有状态集 ⇒ 跑状态机（玩家没有，故不入 behaviour 池）
  // - 有 decorate ⇒ 有私有方法，需要每帧「喊一声」（`actor.update`）
  const enters = [
    ...common,
    ...(def.states ? [behaviour.enter] : []),
    ...(def.decorate ? [actor.enter] : []),
  ];

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
    ...locomotion.spawn(speedProps(col, row, def.traits.speed, facing)),
    ...perception.spawn({ range: def.traits.sightRange }),
    ...interaction.spawn(),
    ...alarm.spawn(),
    ...behaviour.spawn({ role, post: def.post?.(col, row) ?? null }),
    role,
  };

  // 升格：户口本可选地挂上本角色私有的字段与方法（如保镖的 `seen`）
  const state = def.decorate ? def.decorate(base) : base;

  const entity = define(ctx, ...enters)(state);

  // 全局注册表：玩家供相机跟随，全部角色供视锥调试层遍历。
  // 卸载时反注册，避免调试层指向已销毁的信号。
  if (role === "player") {
    onMount(() => playerEntity(entity));
    // **只在「我还是当前的玩家」时才清空**——不能无条件 `playerEntity(undefined)`。
    //
    // 重开一局是「先挂载新的、后卸载旧的」（实测），于是新玩家写入后，
    // 旧玩家的卸载回调会把入口清空 ⇒ `playerEntity()` 变成 `undefined`，
    // 交互系统拿不到玩家，表现为「重开后捡不了瓶子 / 下不了药」。
    // 写成条件清空后，旧实体的卸载发现「现在的不是我」就跳过。
    onUnmount(() => {
      if (playerEntity()?.id === entity.id) playerEntity(undefined);
    });
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
  // 朝向用一个**不对称的箭头**表现（见 .facing 的说明）——镜像对称体
  // 无法表达朝向，那是原先 `scale` 方案的失效原因。
  const facingDeg = useContext(entity, () => `${FACING_DEGREES[entity().facing]}deg`);
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

  // 活着（朝向箭头的前置条件）
  const alive = useContext(entity, () => !entity().dead);

  return (
    <StyleMemo
      value={{
        position: "absolute",
        width: `${ACTOR_SIZE}px`,
        height: `${ACTOR_SIZE}px`,
        zIndex,
        translate,
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
        {/*
          朝向箭头：**死亡时隐藏**。尸体已被 `rotate: 90deg` 放倒，
          再挂一个方位箭头会误导（它指的是躺倒后的「上」，不是朝向）。
        */}
        <Show value={alive}>
          {() => (
            <StyleMemo value={{ rotate: facingDeg }}>
              <span class={style.facing}>
                <span class={style.facingArrow} />
              </span>
            </StyleMemo>
          )}
        </Show>
        <Show value={poisoned}>{() => <span class={style.poisonMark} />}</Show>
        <Show value={panicking}>{() => <span class={style.panicMark} />}</Show>
      </div>
    </StyleMemo>
  );
}

/**
 * 出生参数：位置、速度、朝向。
 *
 * **数值来自户口本**（`def.traits.speed`）——不再是视图层的 `ACTOR_TRAITS`
 * 表。数值属于「一只 NPC 是什么」，与「怎么装配」无关。
 */
function speedProps(col: number, row: number, speed: number, facing: Facing) {
  return {
    x: col * TILE + (TILE - ACTOR_SIZE) / 2,
    y: row * TILE + (TILE - ACTOR_SIZE) / 2,
    speed,
    facing,
  };
}
