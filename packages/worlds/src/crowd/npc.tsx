// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Npc 组件：状态在闭包，动作在池里，渲染订阅闭包信号
//
// 本文件回答实验的核心问题：一个 NPC 能在一个文件里读完吗？
// 状态形状、注册进池、渲染订阅都在这里；行为规则在 behaviour.ts（纯逻辑，
// 可独立测试）；跨实体只经过 `PeerSource` 接口，不互相持有引用。
//
// 对照 ECS 版（saboteur）：一个 NPC 的字段分散在 5 个系统的 `enter()` 里，
// 加一个行为要动 types.ts + system + instance + actor.tsx。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { StyleMemo } from "engine";
import { type Context, type Signal } from "kiaao";

import { advance, createInitialState, NPC_SIZE, type NpcState, type PeerSource } from "./behaviour";
import { useGame } from "./use-game";

type NpcProps = {
  id: number;
  x: number;
  y: number;
  color: string;
};

/**
 * 表现层用色。**导出是为了让测试引用同一份常量**——若测试里再写一遍
 * `#dc2626`，改色时测试会假失败（而它其实在测「恐慌是否发生」）。
 */
export const PAINT = {
  /** 恐慌中 */
  flee: "#dc2626",
  /** 尸体 */
  corpse: "#4b5563",
} as const;

/** 读取某个状态应对应的颜色（与渲染用的是同一个函数，避免两处判断） */
export function paintBackground(state: NpcState, idleColor: string): string {
  if (state.dead) return PAINT.corpse;
  return state.mood === "flee" ? PAINT.flee : idleColor;
}

/**
 * 渲染分两级：
 *   一级：从 state 派生「要显示的值」（订阅整个 state，每次写都重算）
 *   二级：StyleMemo 只订阅具体属性——值没变就不写 DOM
 *
 * 因此 state 每帧被写（连 `moodLeft` 也在变）不会造成 DOM 抖动：截断发生在
 * 等价性守卫（值不变不向下传播），不在写入处。见实验文档 §5.2。
 */
function usePaint(input: { ctx: Context; state: Signal<NpcState>; color: string }) {
  const { ctx, state, color } = input;
  const { use } = ctx;

  const translate = use(state, () => `${state().x}px ${state().y}px`);
  const scale = use(state, () => (state().facing < 0 ? "-1 1" : "1 1"));
  const borderRadius = use(state, () => (state().dead ? "3px" : "50%"));
  const background = use(state, () => paintBackground(state(), color));

  return { translate, scale, borderRadius, background };
}

export function Npc({ id, x, y, color }: NpcProps, ctx: Context) {
  const { use } = ctx;

  // ① 状态：就在这个闭包里。每个组件实例一份（Each 展开时天然隔离）
  const state = use<NpcState>(createInitialState({ x, y }));

  // ② 动作：注册进池。池里只有「这个实体能做什么」，不含数据
  useGame(ctx, {
    info: () => {
      const s = state();
      return { id, x: s.x, y: s.y, dead: s.dead, panicked: s.mood === "flee" };
    },
    update: (dt, source: PeerSource) => {
      // 一次写完：直接写信号，不拆成多次（见实验文档 §3.2）
      state(advance({ state: state(), selfId: id, dt, source }));
    },
  });

  // ③ 渲染：订阅同一个闭包信号——通知链天然是通的，不需要任何桥接
  const paint = usePaint({ ctx, state, color });

  // 实验触发器：点一下变尸体，用来观察恐慌链（制造「异常」的唯一手段）
  const kill = () => {
    if (state().dead) return;
    state({ ...state(), dead: true });
  };

  return (
    <StyleMemo
      value={{
        position: "absolute",
        width: `${NPC_SIZE}px`,
        height: `${NPC_SIZE}px`,
        translate: paint.translate,
        scale: paint.scale,
        borderRadius: paint.borderRadius,
        background: paint.background,
      }}
    >
      <div onClick={kill} />
    </StyleMemo>
  );
}
