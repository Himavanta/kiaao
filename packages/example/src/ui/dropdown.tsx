// kiaao — 通用下拉菜单组件
//
// 用法：
//   <Dropdown trigger={<UserIcon />}>
//     <div>面板内容</div>
//   </Dropdown>
//
// 点击 trigger 区域切换面板显隐，点击面板外部或按 Escape 关闭。

import type { Context } from "kiaao";

type Placement = "bottom-left" | "bottom-right" | "top-left" | "top-right";

interface DropdownProps {
  /** 触发器元素（点击切换面板） */
  trigger: any;
  /** 下拉面板内容 */
  children: any;
  /** 面板相对 trigger 的位置 */
  placement?: Placement;
  /** 点击外部关闭（默认 true） */
  closeOnOutsideClick?: boolean;
  /** Escape 键关闭（默认 true） */
  closeOnEscape?: boolean;
}

const PLACEMENT_CLASS: Record<Placement, string> = {
  "bottom-left": "left-0 top-full mt-1 origin-top-left",
  "bottom-right": "right-0 top-full mt-1 origin-top-right",
  "top-left": "left-0 bottom-full mb-1 origin-bottom-left",
  "top-right": "right-0 bottom-full mb-1 origin-bottom-right",
};

export default function Dropdown(props: DropdownProps, { onUnmount, use }: Context) {
  const [open, setOpen] = use<boolean>(false);
  const toggle = () => setOpen((v) => !v);
  const close = () => setOpen(false);

  const {
    trigger,
    children,
    placement = "bottom-right",
    closeOnOutsideClick = true,
    closeOnEscape = true,
  } = props;

  // 根元素引用
  const rootEl = (
    <div class="relative inline-block">
      <div onClick={toggle}>{trigger}</div>

      <div when={open} class="contents">
        <div
          class={`animate-[kd-drop-in_150ms_ease-out] absolute ${PLACEMENT_CLASS[placement]}`}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );

  // ── 事件监听：直接在组件创建时注册 ──────────────────────
  //
  // 不在 onMount 中注册，避免嵌套 onUnmount 丢失 context 的问题。
  // 使用 window 的 click 捕获阶段，composedPath 检测点击源。

  const cleanups: (() => void)[] = [];

  // 点击外部关闭（捕获阶段）
  if (closeOnOutsideClick) {
    const onClick = (e: MouseEvent) => {
      // 点击在 rootEl 内部 → 不处理
      if (rootEl.contains(e.target as Node)) return;
      if (!open()) return;
      close();
    };
    window.addEventListener("click", onClick, true);
    cleanups.push(() => window.removeEventListener("click", onClick, true));
  }

  // Escape 关闭
  if (closeOnEscape) {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open()) close();
    };
    window.addEventListener("keydown", onKey);
    cleanups.push(() => window.removeEventListener("keydown", onKey));
  }

  // 统一清理
  onUnmount(() => {
    for (const fn of cleanups) fn();
  });

  return rootEl;
}
