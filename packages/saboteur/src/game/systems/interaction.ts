// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 交互系统：拾取、下药、死亡判定
//
// 交互目标是**面朝方向的相邻格**（规划文档 4.7）——全键盘方案下目标
// 是离散可枚举的，不需要像素级瞄准。判定链：
//
// 1. 按下交互键 → 算出手心格（玩家面朝的下一个格）
// 2. 手心格上有酒瓶 → 拾取（入物品栏）
// 3. 手心格上有活着的客人且玩家持有酒瓶 → 下药（消耗酒瓶，启动倒计时）
// 4. 中毒倒计时归零 → 客人死亡（尸体留在原地）
//
// **尸体是 M6 目击链的输入**：死亡本身不产生恐慌，「被看见」才产生。
// 因此本系统只负责把活人变死人，不做任何暴露判定。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use, type Context, type Signal } from "kiaao";

import type { EntityId, EntitySignal, FrameManager } from "../../engine/types";
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

export type InteractionSystem = {
  /** 注册角色（含玩家与客人） */
  enter: () => (id: EntityId, ctx: Context) => Partial<ActorEntity>;
  /** 注册可交互物 */
  enterProp: (props: {
    kind: ItemKind;
    cell: { col: number; row: number };
  }) => (id: EntityId, ctx: Context) => Partial<PropEntity>;
  update: (frame: FrameManager<ActorEntity>, delta: number) => void;
  /** 玩家当前持有的道具（HUD 展示） */
  heldItem: Signal<ItemKind | null>;
  /** 最近一次交互的结果提示（HUD 展示） */
  hint: Signal<string>;
};

/** 本系统跨两个池读写：角色与道具。泛型由调用点收敛，id 不会混用。 */
type ReadWrite = <T>(id: EntityId, mutate?: (value: T) => void) => T | undefined;

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

  const actorPool = new Set<EntityId>();
  const propPool = new Set<EntityId>();

  const heldItem = use<ItemKind | null>(null);
  const hint = use("");

  // 上次处理的交互键计数：只在「新值 > 旧值」时触发（边沿检测，无需清零）
  let lastInteract = interactTicks();

  const enter =
    () =>
    (id: EntityId, ctx: Context): Partial<ActorEntity> => {
      ctx.onMount(() => {
        actorPool.add(id);
      });
      ctx.onUnmount(() => {
        actorPool.delete(id);
      });

      return { held: null, dead: false, poisonLeft: null } as Partial<ActorEntity>;
    };

  const enterProp =
    (props: { kind: ItemKind; cell: { col: number; row: number } }) =>
    (id: EntityId, ctx: Context): Partial<PropEntity> => {
      ctx.onMount(() => {
        propPool.add(id);
      });
      ctx.onUnmount(() => {
        propPool.delete(id);
      });

      return {
        kind: props.kind,
        x: props.cell.col * TILE + TILE / 2,
        y: props.cell.row * TILE + TILE / 2,
        taken: false,
      } as Partial<PropEntity>;
    };

  // ── 查询 ──────────────────────────────────────────────

  const centerOf = (actor: Readonly<ActorEntity>): Vec2 => ({
    x: actor.x + ACTOR_SIZE / 2,
    y: actor.y + ACTOR_SIZE / 2,
  });

  /** 手心格中心：面朝方向的下一格 */
  const frontCell = (actor: Readonly<ActorEntity>): Vec2 =>
    cellInFront(centerOf(actor), actor.facing);

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

    access.props<PropEntity>(propId, (p) => {
      p.taken = true;
    });
    access.actors<ActorEntity>(meId, (e) => {
      e.held = prop.kind;
    });
    heldItem(prop.kind);
    hint(`拾取了${labelOf(prop.kind)}`);
  };

  const poison = (access: FrameAccess, meId: EntityId, victimId: EntityId): void => {
    access.actors<ActorEntity>(victimId, (e) => {
      e.poisonLeft = POISON_DELAY;
    });
    access.actors<ActorEntity>(meId, (e) => {
      e.held = null;
    });
    heldItem(null);
    hint("已下药");
  };

  const tryInteract = (access: FrameAccess) => {
    const entity = player();
    const me = entity?.();
    if (!entity || !me || me.dead) return;

    const cell = frontCell(me);

    // 1. 拾取优先：脚下有东西先捡起来
    const propId = propAt(access, cell);
    if (propId !== undefined) {
      pickUp(access, entity.id, me, propId);
      return;
    }

    // 2. 下药：需要持有酒瓶
    if (me.held !== "booze") {
      hint("手中没有可用的道具");
      return;
    }

    const victimId = actorAt(access, cell, entity.id);
    if (victimId === undefined) {
      hint("面前没有可下药的对象");
      return;
    }

    poison(access, entity.id, victimId);
  };

  // ── 帧逻辑 ────────────────────────────────────────────

  /** 中毒倒计时：归零即死亡 */
  const tickPoison = (frame: FrameManager<ActorEntity>, delta: number) => {
    for (const id of actorPool) {
      const actor = frame(id);
      if (!actor || actor.dead || actor.poisonLeft === null) continue;

      const left = actor.poisonLeft - delta;
      if (left > 0) {
        frame(id, (e) => {
          e.poisonLeft = left;
        });
        continue;
      }

      frame(id, (e) => {
        e.dead = true;
        e.poisonLeft = null;
        // 尸体原地不动：清空路径与目标，避免死后还继续「走」
        e.path = [];
        e.goal = null;
      });

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

  return { enter, enterProp, update, heldItem, hint };
}

/** 道具的展示名（HUD 用） */
function labelOf(kind: ItemKind): string {
  return kind === "booze" ? "酒瓶" : kind;
}
