import { direct, isUse, toValue, type Signal } from "kiaao";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StyleMemo 指令：style 属性级细粒度更新
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * style 属性级细粒度更新指令：
 * - value 中的信号值变化时，只更新对应的样式属性，不触碰其他属性
 * - 静态值在挂载时写入一次
 * - 信号值为 null/undefined 时清除该属性
 * 配合派生层 memo 语义（值不变不传播），实现"只写变化的属性"。
 */
export const StyleMemo = direct((el, props, { use }) => {
  const style = (el as HTMLElement).style;
  const { value } = props as { value: Record<string, unknown> };
  const vals = toValue(value);

  for (const key in vals) {
    const val = vals[key];
    if (isUse(val)) {
      // 信号：值变化 → 仅更新该属性
      use(val, () => {
        const v = (val as Signal<any>)();
        // null / undefined 写 `""` 才能真的移除属性。
        // 直接写 `null` 不行：CSSStyleDeclaration 会静默忽略
        // `null`（`left` 保留旧值），而 `zIndex` 这类会把字面量
        // `null` 写进去（`z-index: null;`）。
        (style as any)[key] = v ?? "";
      });
    } else if (val != null) {
      // 静态值：挂载时写入一次
      (style as any)[key] = val;
    }
  }
});
