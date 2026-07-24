// kiaao example — cns(class builder with use injection)
// 用法:
//   const cn = cns.bind(use);
//   const cls = cn(signal1, signal2, () => ["class1", signal1() && "class2"]);
//   const cls = cn(signal1, () => ({ "class1": true, "class2": signal1() }));
//
// 数组元素:
//   - string → 加入类名
//   - false/null/undefined → 忽略
//   - { "class": condition } → condition 为 true 时加入
//
// 对象:
//   键为类名，值为条件（boolean 或 () => boolean）

import { use, type Signal } from "kiaao";

// ── 类型 ──────────────────────────────────────────────

type ClassValue = string | false | null | undefined | Record<string, boolean | (() => boolean)>;
type UseFn = typeof use;

function resolveValue(v: ClassValue): string[] {
  if (typeof v === "string") return [v];
  if (!v) return [];
  if (typeof v === "object") {
    return Object.entries(v)
      .filter(([, cond]) => (typeof cond === "function" ? (cond as () => boolean)() : cond))
      .map(([key]) => key);
  }
  return [];
}

/** 通过 .bind(use) 或 .bind(context.use) 注入 use */
export function cns(this: UseFn, ...args: any[]): Signal<string> {
  const [fn, ...deps] = args.reverse();
  return (this as any)(...deps, () => {
    const val = fn();
    if (Array.isArray(val)) {
      return val.flatMap(resolveValue).filter(Boolean).join(" ");
    }
    if (val && typeof val === "object") {
      return Object.entries(val)
        .filter(([, cond]) => (typeof cond === "function" ? (cond as () => boolean)() : cond))
        .map(([key]) => key)
        .join(" ");
    }
    return "";
  }) as Signal<string>;
}
