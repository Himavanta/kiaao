import { animate } from "motion/mini";
import { use } from "../reactive/core.ts";
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
  signal: () => any,
  context?: { use: typeof use },
): [play: (newValue: any) => Promise<void>, Motion: ReturnType<typeof direct>] {
  const [_getter, setter] = context ? context.use(signal) : use(signal);
  const elements = new Set<Element>();
  const propsMap = new Map<Element, { from: any; to: any; duration: number }>();
  let tick = 0;

  const play = async (newValue: any): Promise<void> => {
    const myTick = ++tick;

    const anims: Promise<any>[] = [];
    for (const el of elements) {
      const p = propsMap.get(el);
      if (!p || typeof newValue !== "boolean" || newValue !== false || !p.from) continue;
      if (getMotionState(el) === "exiting") continue;

      setMotionState(el, "exiting");
      anims.push(
        animate(el, p.from, { duration: p.duration }).finished.then(() => {
          setMotionState(el, "exited");
        }),
      );
    }

    await Promise.allSettled(anims);
    if (myTick !== tick) return;
    setter(newValue);
  };

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

  return [play, Motion];
}
