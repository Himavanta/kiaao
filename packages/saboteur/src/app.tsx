// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 根组件：舞台 + HUD 组装
//
// 组件负责运行窗口（挂载 start、卸载 stop），世界状态与系统实例
// 全部在模块级（game/instance.ts）——组件不持有游戏数据。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use, type Context } from "kiaao";

import { VIEW_H, VIEW_W, WORLD_H, WORLD_W } from "./game/config";
import { frameSystem, entityCount, start, stop } from "./game/instance";
import { DebugPanel } from "./game/views/debug";
import { Marker } from "./game/views/marker";
import { followCamera, Stage } from "./game/views/stage";

import style from "./app.module.scss";

// 【M0 脚手架】圆周运动的演示实体；M2 落地时替换为玩家与 NPC。
// 位置写死在世界中心附近，为后续关卡数据留位。
const MARKERS = [
  { cx: WORLD_W / 2, cy: WORLD_H / 2, radius: 260, speed: 1.1, color: "#e0a34a" },
  { cx: WORLD_W / 2, cy: WORLD_H / 2, radius: 160, speed: -0.8, color: "#6ba3d6" },
  { cx: WORLD_W / 2, cy: WORLD_H / 2, radius: 320, speed: 0.6, color: "#9d7ad9" },
];

export default function App(_: Record<string, never>, ctx: Context) {
  const { onMount, onUnmount } = ctx;

  // 运行窗口：挂载开始帧循环，卸载暂停（实例与状态常驻模块级）
  onMount(start);
  onUnmount(stop);

  // 相机跟随世界中心——M2 起改为跟随玩家
  const focus = use({ x: WORLD_W / 2, y: WORLD_H / 2 });
  const camera = followCamera(ctx, focus);

  return (
    <div class={style.shell}>
      <Stage camera={camera}>
        {MARKERS.map((m) => (
          <Marker {...m} />
        ))}
      </Stage>
      <DebugPanel fps={frameSystem.fps} entities={entityCount} />
      <span class={style.hint}>
        viewport {VIEW_W}×{VIEW_H} · world {WORLD_W}×{WORLD_H}
      </span>
    </div>
  );
}
