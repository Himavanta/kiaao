// kiaao — 通用下拉菜单组件
// 点击 trigger 区域切换面板显隐，点击面板外部或按 Escape 关闭。

import { Show, type Context } from "kiaao";
import { createMotion } from "kiaao/motion";

import { ClickOutside } from "./click-outside";

type Placement = "bottom-left" | "bottom-right" | "top-left" | "top-right";

interface DropdownProps {
  trigger: any;
  children: any;
  placement?: Placement;
  closeOnEscape?: boolean;
}

const PLACEMENT_CLASS: Record<Placement, string> = {
  "bottom-left": "left-0 top-full mt-1 origin-top-left",
  "bottom-right": "right-0 top-full mt-1 origin-top-right",
  "top-left": "left-0 bottom-full mb-1 origin-bottom-left",
  "top-right": "right-0 bottom-full mb-1 origin-bottom-right",
};

export default function Dropdown(
  { trigger, children, placement = "bottom-right", closeOnEscape = true }: DropdownProps,
  context: Context,
) {
  const { use: useFn } = context;
  const open = useFn<boolean>(false);
  const [visible, Motion] = createMotion(open, context);

  const toggle = () => open(!open());
  const close = () => open(false);

  // ── 事件监听 ─────────────────────────────────────────
  const cleanups: (() => void)[] = [];

  if (closeOnEscape) {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open()) close();
    };
    window.addEventListener("keydown", onKey);
    cleanups.push(() => window.removeEventListener("keydown", onKey));
  }

  context.onUnmount(() => {
    for (const fn of cleanups) fn();
  });

  return (
    <ClickOutside onClickOutside={close}>
      <div class="relative inline-block">
        <div onClick={toggle}>{trigger}</div>

        <Show value={visible}>
          {() => (
            <Motion
              from={{ opacity: 0, transform: "scale(0.95)" }}
              to={{ opacity: 1, transform: "scale(1)" }}
              duration={0.15}
            >
              <div
                class={`absolute ${PLACEMENT_CLASS[placement]}`}
                onClick={(e: MouseEvent) => e.stopPropagation()}
              >
                {children}
              </div>
            </Motion>
          )}
        </Show>
      </div>
    </ClickOutside>
  );
}
