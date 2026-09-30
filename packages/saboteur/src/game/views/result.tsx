// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 结算界面：胜负提示与重开
//
// 只在终局显示——`Show` 分支的挂载/卸载就是它的生命周期，与
// 「游戏结束」这一状态天然对应（规划文档 4.6 的声明式生灭）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { type Context, type Signal } from "kiaao";

import { rules } from "../instance";
import { gameState, type Phase } from "../state";

import style from "./result.module.scss";

/** 终局阶段（排除进行中） */
type EndPhase = Exclude<Phase, "playing">;

/** 各终局阶段的文案 */
const TEXT: Record<EndPhase, { title: string; desc: string }> = {
  won: { title: "任务完成", desc: "目标已清除，无人察觉是你。" },
  caught: { title: "已被发现", desc: "警报拉响，警察赶到了现场。" },
  timeout: { title: "时间耗尽", desc: "派对结束了，你没能完成任务。" },
};

const IS_END: Record<Phase, boolean> = {
  playing: false,
  won: true,
  caught: true,
  timeout: true,
};

export function ResultOverlay(_: Record<string, never>, ctx: Context) {
  const { use: useContext, onMount, onUnmount } = ctx;

  // 阶段派生：把 Phase 收窄为标量信号，下游各字段独立派生
  const phase: Signal<Phase> = useContext(gameState.phase, () => gameState.phase());

  // 注意：`class` 必须传**信号**才能响应更新。写 `class={[a, b].join(" ")}`
  // 会在渲染时求值一次就固定——结算界面永远不会显示。
  const overlayClass = useContext(phase, () =>
    [style.overlay, IS_END[phase()] ? style.visible : ""].join(" "),
  );
  const cardClass = useContext(phase, () =>
    [style.card, IS_END[phase()] ? style[phase() as EndPhase] : ""].join(" "),
  );
  const title = useContext(phase, () => (IS_END[phase()] ? TEXT[phase() as EndPhase].title : ""));
  const desc = useContext(phase, () => (IS_END[phase()] ? TEXT[phase() as EndPhase].desc : ""));

  const stats = useContext(phase, () => {
    const secs = Math.round(gameState.elapsed());
    return `击杀 ${gameState.kills()}/${rules.objective.killGoal} · 用时 ${secs}s`;
  });

  // R 键重开：借用本组件的生命周期挂监听（终局界面卸载时自动移除）
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "KeyR") rules.restart();
  };

  onMount(() => window.addEventListener("keydown", onKeyDown));
  onUnmount(() => window.removeEventListener("keydown", onKeyDown));

  return (
    <div class={overlayClass}>
      <div class={cardClass}>
        <h2 class={style.title}>{title}</h2>
        <p class={style.desc}>{desc}</p>
        <p class={style.stats}>{stats}</p>
        <button
          class={style.button}
          onClick={(e: MouseEvent) => {
            rules.restart();
            // 立即失焦：防止空格键激活按钮（浏览器默认在 keyup 触发 click）
            (e.currentTarget as HTMLElement).blur();
          }}
        >
          再来一局（R）
        </button>
      </div>
    </div>
  );
}
