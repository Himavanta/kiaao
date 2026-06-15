import { animate } from "motion/mini";
import { use } from "../reactive/core.ts";
import { type Getter } from "../reactive/types.ts";
import { direct } from "../dom/directive.ts";
import type { DirectiveContext } from "../dom/directive.ts";

const MOTION_STATE = Symbol("kiaao.motion.state");

type MotionState = "idle" | "entering" | "exiting" | "exited";

function getMotionState(el: Element): MotionState {
  return (el as any)[MOTION_STATE] ?? "idle";
}

function setMotionState(el: Element, state: MotionState): void {
  (el as any)[MOTION_STATE] = state;
}

export function createMotion(
  signal: Getter<any>,
  context?: { use: typeof use },
): [visible: () => any, Motion: ReturnType<typeof direct>] {
  const elements = new Set<Element>();
  const propsMap = new Map<Element, { from: any; to: any; duration: number }>();
  let tick = 0;

  // 在一处拿到正确的 use 引用：有 context 则组件级（自动清理），否则全局
  const _use: typeof use = context ? context.use : use;

  // 动画信号：独立的定义信号（非派生），初始值与业务信号相同，由 internalPlay 更新
  const [visible, setVisible] = _use(signal());

  // 内部派生：监听业务信号变化，调度动画
  _use(signal, () => {
    void internalPlay(signal());
  });

  async function internalPlay(newValue: any): Promise<void> {
    const myTick = ++tick;

    // 进入：无需退出动画，立即更新 visible
    if (newValue === true) {
      setVisible(true);
      return;
    }

    // 退出：收集并等待所有退出动画完成
    const anims: Promise<any>[] = [];
    for (const el of elements) {
      const p = propsMap.get(el);
      if (!p || !p.from || getMotionState(el) === "exiting") continue;

      setMotionState(el, "exiting");
      anims.push(animate(el, p.from, { duration: p.duration }).finished);
    }

    await Promise.allSettled(anims);

    if (myTick !== tick) return; // 中途反转，跳过

    setVisible(false);
  }

  const Motion = direct(
    (el: Element, props: Record<string, any> & { children?: any }, ctx: DirectiveContext) => {
      const { from, to, duration = 0.3 } = props;
      propsMap.set(el, { from, to, duration });

      ctx.onMount(() => {
        elements.add(el);
        if (!to) return;

        setMotionState(el, "entering");
        void animate(el, to, { duration }).finished.then(() => {
          setMotionState(el, "idle");
        });
      });

      ctx.onUnmount(() => {
        elements.delete(el);
      });
    },
  );

  return [visible, Motion];
}
