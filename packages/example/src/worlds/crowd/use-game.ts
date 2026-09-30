// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 实验引擎：帧循环 + 对象池
//
// 与 ECS 版（`worlds/engine/index.ts`）的差别：
// - 池里放「带方法的对象」，不放信号——数据在组件闭包里
// - 没有帧管理器（frame / flush）：对象自己写自己的信号
// - 没有 useEntity 的「切片合并」：状态由组件自己给出完整初值
// - 没有系统流水线：唯一约定的方法名是 `update`
//
// 引擎对「状态长什么样」零知识——它只认识 `info` 与 `update`。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Context } from "kiaao";

import type { PeerInfo, PeerSource } from "./behaviour";

/**
 * 池里的东西：能被别人读（`info`）、能被帧循环调（`update`）。
 *
 * 两个方法都是可选的——`update` 省略即为静止物体（只提供信息，
 * 不需要每帧推进）。这一点与 ECS 版"系统池"的差别：那边静止物体
 * 也要注册进某个系统才有 `info`。
 */
export type Actor = {
  info: () => PeerInfo;
  update?: (dt: number, source: PeerSource) => void;
};

const pool = new Set<Actor>();

let rafId = 0;
let running = false;
let prevTime = 0;

/**
 * 帧循环。
 *
 * **本帧的池快照只分配一次**，循环内共享：否则每个 actor 调一次
 * `source.peers()` 就要拷贝一遍池，N 个 actor 就是 N 次 O(N)。
 *
 * 传入的是快照而非活池，还有个副作用：actor 在遍历中注册/注销不会影响
 * 本帧别人看到的内容（迭代中修改集合的经典陷阱被绕开）。
 *
 * **帧首快照（这里是实锤验证过的一处）**：`peers` 在循环开始前一次性取好，
 * 循环内所有人看的都是「帧开始时的世界」。这不是过度设计——早期版本让
 * `peers()` 每次调用都重读当前状态，结果是**恐慌按插入顺序传播**：
 * 20 个 NPC 排成 5×4 网格、插入顺序逐行，点掉第一个后单帧内整列（相隔
 * 140px 的四个人）全部变红——传播速度由 `Set` 的遍历顺序决定，而非空间
 * 关系。见实验文档 §3.1 与 §5.5。
 *
 * 这个修正与 ECS 版「帧末统一提交」是同一个思想：读状态与写状态分属
 * 不同的时间点。不同的是实现代价——这里只需一次 map，无需帧管理器。
 */
function step(now: number): void {
  // 上限 50ms：切到后台再切回来时不要跳帧
  const dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;

  const snapshot = [...pool];
  // 帧首快照：本帧所有读取都基于它，与遍历顺序无关
  const peers: PeerInfo[] = snapshot.map((actor) => actor.info());
  const source: PeerSource = { peers: () => peers };
  for (const actor of snapshot) actor.update?.(dt, source);

  if (running) rafId = requestAnimationFrame(step);
}

/** 启动帧循环（幂等） */
function start(): void {
  if (running) return;
  running = true;
  prevTime = performance.now();
  rafId = requestAnimationFrame(step);
}

/** 停止帧循环（幂等） */
function stop(): void {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);
}

/**
 * 把 actor 注册进池。
 *
 * 生命周期 = 组件的生命周期：挂载进池并启动帧循环，卸载出池；池空了就停
 * 帧循环。对应 ECS 版 `useEntity` 里 `onMount` / `onUnmount` 那一段——
 * 但**没有**切片合并那一段，因为状态不从这里来。
 *
 * 帧循环由池的进出隐式开关：组件挂载即开始，全部卸载即停止。ECS 版需要
 * 显式 `start()` / `stop()`（因为它把实例当状态容器，运行窗口另行控制）。
 */
export function useGame(ctx: Context, actor: Actor): Actor {
  const { onMount, onUnmount } = ctx;

  onMount(() => {
    pool.add(actor);
    start();
  });

  onUnmount(() => {
    pool.delete(actor);
    if (pool.size === 0) stop();
  });

  return actor;
}

/** 仅供调试与测试：当前池大小 */
export const poolSize = (): number => pool.size;
