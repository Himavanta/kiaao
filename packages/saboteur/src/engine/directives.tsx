// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 指令：style 属性级细粒度更新
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { direct, isUse, toValue, type Signal } from "kiaao";

/**
 * StyleMemo：style 属性级细粒度更新。
 *
 * - `value` 中的信号值变化时，只更新对应的样式属性，不触碰其他属性
 * - 静态值在挂载时写入一次
 * - 信号值为 null / undefined 时清除该属性
 *
 * 静态布局走 CSS Modules 类名，逐帧变化的值走本指令——两者作用于不同通道
 * （类名 vs `el.style`），可安全共存于同一元素。
 */
export const StyleMemo = direct((el, props, { use }) => {
  const style = (el as HTMLElement).style;
  const { value } = props as { value: Record<string, unknown> };
  const vals = toValue(value);

  for (const key in vals) {
    const val = vals[key];
    if (!isUse(val)) {
      if (val != null) (style as any)[key] = val;
      continue;
    }

    // 信号：值变化 → 仅更新该属性
    use(val as Signal<any>, () => {
      const v = (val as Signal<any>)();
      (style as any)[key] = v ?? "";
    });
  }
});
