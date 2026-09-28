// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【M0 脚手架】绕行系统：让标记实体做圆周运动
//
// 用途：在真实玩法系统（M2 移动、M3 NPC）就位前，用它打通并验证
// 整条渲染通路——帧循环 → frame 写 → 帧末提交 → 派生重算 →
// StyleMemo 逐属性写 DOM。M2 落地时删除本文件。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context } from "kiaao";

import type { EntityId, FrameManager } from "../../engine/types";

/** 系统闭包内自持的实体池——框架不介入池的管理 */
type ScaffoldPool = Set<EntityId>;

export function createScaffoldSystem() {
  const pool: ScaffoldPool = new Set();

  const enter = (props: { cx: number; cy: number; radius: number; speed: number }) => {
    return (id: EntityId, ctx: Context) => {
      // 实体存活窗口 = 池成员窗口：挂载加入、卸载移出
      ctx.onMount(() => {
        pool.add(id);
      });
      ctx.onUnmount(() => {
        pool.delete(id);
      });

      return {
        x: props.cx + props.radius,
        y: props.cy,
        speed: props.speed,
        facing: "east" as const,
      };
    };
  };

  let phase = 0;

  const update = (frame: FrameManager<any>, delta: number) => {
    phase += delta;
    for (const id of pool) {
      frame(id, (e) => {
        e.x = 480 + Math.cos(phase) * 260;
        e.y = 320 + Math.sin(phase) * 160;
      });
    }
  };

  return { enter, update };
}
