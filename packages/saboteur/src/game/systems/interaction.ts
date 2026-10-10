// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 交互系统：拾取、下药、死亡判定
//
// 交互目标是**两个格：自己脚下的格 + 面朝方向的相邻格**——全键盘方案
// 下目标是离散可枚举的，不需要像素级瞄准。（最初只查面朝格，实玩反馈
// 「必须正对着才能操作」很别扭；加上脚下格后，走近就能拾取。）
//
// 判定链：
//
// 1. 按下交互键 → 取出候选格（脚下、面前，按此顺序）
// 2. 任一格上有酒瓶 → 拾取（入物品栏）
// 3. 任一格上有活着的客人且玩家持有酒瓶 → 下药（消耗酒瓶，启动倒计时）
// 4. 中毒倒计时归零 → 客人死亡（尸体留在原地）
//
// **尸体是 M6 目击链的输入**：死亡本身不产生恐慌，「被看见」才产生。
// 因此本系统只负责把活人变死人，不做任何暴露判定。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  createPool,
  type EntityId,
  type EntitySignal,
  type Enter,
  type FrameManager,
} from "engine";
import { use, type Signal } from "kiaao";

import { cellAt, cellInFront, TILE, type Vec2 } from "../../world";
import { gameState } from "../state";
import type { ActorEntity, ItemKind } from "../types";
import { ACTOR_SIZE } from "./locomotion";

/** 中毒后的存活时长（秒）：留出「下完药走开」的窗口 */
export const POISON_DELAY = 4.5;

/**
 * 可交互物实体（酒瓶等）。
 *
 * 有位置但**不入移动池**——它们不动，参与交互判定即可。
 * 位置留在实体上而非外挂一张表：实体本就是数据的载体，
 * 外挂表会让「同一份数据两处存放」。
 *
 * 位置（x / y）由本系统的 `spawnProp` 从格子坐标换算。
 */
export type PropEntity = {
  /** 【身份，注册时定】道具类型 */
  kind: ItemKind;
  /** 【身份，注册时定】所在格中心（像素） */
  x: number;
  y: number;
  /** 【interaction 写】是否已被拾取 */
  taken: boolean;
};

/** 角色侧字段需求：交互判定读位置/朝向/状态，写持有与中毒 */
export type Interactable = Pick<ActorEntity, "x" | "y" | "facing" | "dead" | "held" | "poisonLeft">;

export type InteractionSystem = {
  /** 注册角色（含玩家与客人） */
  enter: Enter<Interactable>;
  /** 注册可交互物（异形实体） */
  enterProp: Enter<PropEntity>;
  /** 初值（D2 方案 B）：持有 / 死亡 / 中毒 */
  spawn: () => Pick<ActorEntity, "held" | "dead" | "poisonLeft">;
  /** 初值（D2 方案 B）：道具的格子 → 像素换算 */
  spawnProp: (props: { kind: ItemKind; cell: { col: number; row: number } }) => PropEntity;
  update: (frame: FrameManager<ActorEntity>, delta: number) => void;
  /** 玩家当前持有的道具（HUD 展示） */
  heldItem: Signal<ItemKind | null>;
  /** 最近一次交互的结果提示（HUD 展示） */
  hint: Signal<string>;
  /**
   * 重置模块级信号（重开一局时调用）。
   *
   * 这两个信号**不在实体上**，声明式重建（递增 `runId`）碰不到它们——
   * 不显式归零就会残留：新玩家明明是空手，HUD 却还显示「持有酒瓶」。
   * 同类的还有 `alarm` 的 `alarm` / `witnessCount`（它已有 `reset`）。
   */
  reset: () => void;
};

/** 本系统跨两个池读写：角色与道具。泛型由调用点收敛，id 不会混用。 */
type ReadWrite = <T>(id: EntityId) => T | undefined;

/** 道具与角色的帧读写入口（两者共用一个 frame） */
export type FrameAccess = {
  /** 角色池 */
  actors: ReadWrite;
  /** 道具池 */
  props: ReadWrite;
};

export function createInteractionSystem(options: {
  /** 交互键的按下计数信号（输入系统提供） */
  interactTicks: Signal<number>;
  /**
   * 玩家实体信号（含 id）。传信号而非裸数据——交互需要同时拿到
   * 位置 / 朝向（读值）与身份（id，用于排除自己、写回持有状态），
   * 而实体数据本身不含 id。
   */
  player: () => EntitySignal<ActorEntity> | undefined;
}): InteractionSystem {
  const { interactTicks, player } = options;

  const [actorPool, enter] = createPool<Interactable>();
  const [propPool, enterProp] = createPool<PropEntity>();

  const heldItem = use<ItemKind | null>(null);
  const hint = use("");

  // 上次处理的交互键计数：只在「新值 > 旧值」时触发（边沿检测，无需清零）
  let lastInteract = interactTicks();

  // 持有 / 死亡 / 中毒的初值（D2 方案 B）
  const spawn = () => ({ held: null, dead: false, poisonLeft: null });

  // 道具的初值：格子坐标 → 像素中心
  const spawnProp = (props: {
    kind: ItemKind;
    cell: { col: number; row: number };
  }): PropEntity => ({
    kind: props.kind,
    x: props.cell.col * TILE + TILE / 2,
    y: props.cell.row * TILE + TILE / 2,
    taken: false,
  });

  // ── 查询 ──────────────────────────────────────────────

  const centerOf = (actor: Readonly<ActorEntity>): Vec2 => ({
    x: actor.x + ACTOR_SIZE / 2,
    y: actor.y + ACTOR_SIZE / 2,
  });

  /** 手心格中心：面朝方向的下一格 */
  const frontCell = (actor: Readonly<ActorEntity>): Vec2 =>
    cellInFront(centerOf(actor), actor.facing);

  /**
   * 交互的候选格，按**优先级**排列：脚下 → 面前。
   *
   * 顺序有意义：脚下的格子不用瞄准，是「我正站在上面」这个无争议的
   * 事实；面前的格子需要朝向正确。两者都有东西时，取其下者。
   *
   * 两个格都试过之后，玩家手边一格之内就不必精确朝向了——这正是
   * 要消除的别扭感。
   */
  const targetCells = (actor: Readonly<ActorEntity>): Vec2[] => [centerOf(actor), frontCell(actor)];

  const cellKey = (pos: Vec2): string => {
    const cell = cellAt(pos.x, pos.y);
    return cell ? `${cell.col},${cell.row}` : "";
  };

  /** 手心格上未被拾取的道具 */
  const propAt = (access: FrameAccess, cell: Vec2): EntityId | undefined => {
    const key = cellKey(cell);
    for (const id of propPool) {
      const prop = access.props<PropEntity>(id);
      if (!prop || prop.taken) continue;
      if (cellKey({ x: prop.x, y: prop.y }) === key) return id;
    }
    return undefined;
  };

  /** 手心格上活着的角色（排除自己） */
  const actorAt = (access: FrameAccess, cell: Vec2, selfId: EntityId): EntityId | undefined => {
    const key = cellKey(cell);
    for (const id of actorPool) {
      if (id === selfId) continue;
      const actor = access.actors<ActorEntity>(id);
      if (!actor || actor.dead) continue;
      if (cellKey(centerOf(actor)) !== key) continue;
      return id;
    }
    return undefined;
  };

  // ── 交互动作 ──────────────────────────────────────────

  const pickUp = (access: FrameAccess, meId: EntityId, me: ActorEntity, propId: EntityId): void => {
    const prop = access.props<PropEntity>(propId);
    if (!prop) return;

    if (me.held === prop.kind) {
      hint(`已持有${labelOf(prop.kind)}`);
      return;
    }

    const target = access.props<PropEntity>(propId);
    if (!target) return;
    target.taken = true;
    const holder = access.actors<ActorEntity>(meId);
    if (holder) holder.held = prop.kind;
    heldItem(prop.kind);
    hint(`拾取了${labelOf(prop.kind)}`);
  };

  const poison = (access: FrameAccess, meId: EntityId, victimId: EntityId): void => {
    const victim = access.actors<ActorEntity>(victimId);
    if (victim) victim.poisonLeft = POISON_DELAY;
    const me = access.actors<ActorEntity>(meId);
    if (me) me.held = null;
    heldItem(null);
    hint("已下药");
  };

  /** 候选格上第一个未被拾取的道具 */
  const firstPropIn = (access: FrameAccess, cells: Vec2[]): EntityId | undefined => {
    for (const cell of cells) {
      const id = propAt(access, cell);
      if (id !== undefined) return id;
    }
    return undefined;
  };

  /** 候选格上第一个活着的其他角色 */
  const firstActorIn = (
    access: FrameAccess,
    cells: Vec2[],
    selfId: EntityId,
  ): EntityId | undefined => {
    for (const cell of cells) {
      const id = actorAt(access, cell, selfId);
      if (id !== undefined) return id;
    }
    return undefined;
  };

  const tryInteract = (access: FrameAccess) => {
    const entity = player();
    if (!entity) return;

    // 读**活对象**（帧管理器）而不是渲染快照：快照只在帧末提交，
    // 帧内读到的是上一帧的值。玩家位置可能在同帧被 locomotion 改过，
    // 用快照会算错手心格。
    // 玩家一定在角色池里（`Actor` 为 role="player" 也注册 `interaction.enter`），
    // 故这里不需要回退分支。
    const me = access.actors<ActorEntity>(entity.id);
    if (!me || me.dead) return;

    const cells = targetCells(me);
    const propId = firstPropIn(access, cells);

    // 拾取优先——但**只有它真的会做事时**才算数。
    // 已持有同款时拾取是空操作（只报个提示），若仍让它抢先返回，
    // 玩家站在酒瓶上就没法给面前的客人下药了（脚下格引入后的新情况）。
    if (propId !== undefined) {
      const prop = access.props<PropEntity>(propId);
      if (prop && me.held !== prop.kind) {
        pickUp(access, entity.id, me, propId);
        return;
      }
    }

    // 下药：需要持有酒瓶，且候选格上有活人
    if (me.held === "booze") {
      const victimId = firstActorIn(access, cells, entity.id);
      if (victimId !== undefined) {
        poison(access, entity.id, victimId);
        return;
      }
      hint("身旁没有可下药的对象");
      return;
    }

    if (propId !== undefined) {
      hint("已持有酒瓶");
      return;
    }
    hint("手中没有可用的道具");
  };

  // ── 帧逻辑 ────────────────────────────────────────────

  /** 中毒倒计时：归零即死亡 */
  const tickPoison = (frame: FrameManager<ActorEntity>, delta: number) => {
    for (const id of actorPool) {
      const actor = frame(id);
      if (!actor || actor.dead || actor.poisonLeft === null) continue;

      const left = actor.poisonLeft - delta;
      if (left > 0) {
        actor.poisonLeft = left;
        continue;
      }

      actor.dead = true;
      actor.poisonLeft = null;
      // **不再清 path/goal**：那是死代码。
      // `locomotion` 与 `behaviour` 都有 `dead` 早退，渲染也不读这两个
      // 字段——去掉清理后全部测试仍通过（实测）。
      // 若哪天有系统在没有 `dead` 早退的情况下读 `path`，这里必须重新
      // 考虑；那时应该走 navigation 的服务接口，而不是直接写字段。

      // 击杀计数在此累加而非由规则系统轮询：死亡是本系统判定的事实，
      // 「谁死了」的真相源只有一处。规则系统只读计数、决定何时终局。
      gameState.kills(gameState.kills() + 1);
    }
  };

  const update = (frame: FrameManager<ActorEntity>, delta: number) => {
    // 角色与道具共用同一个 frame；按池分派是为了让类型在调用点收敛
    const access: FrameAccess = {
      actors: frame as ReadWrite,
      props: frame as unknown as ReadWrite,
    };

    const nowTicks = interactTicks();
    if (nowTicks > lastInteract) {
      lastInteract = nowTicks;
      tryInteract(access);
    }

    tickPoison(frame, delta);
  };

  const reset = () => {
    heldItem(null);
    hint("");
    lastInteract = interactTicks();
  };

  return { enter, enterProp, spawn, spawnProp, update, heldItem, hint, reset };
}

/** 道具的展示名（HUD 用） */
function labelOf(kind: ItemKind): string {
  return kind === "booze" ? "酒瓶" : kind;
}
