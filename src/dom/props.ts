// kiaao — Property/attribute/event handling
// Platform-agnostic: all DOM operations go through RenderAdapter.
// browser-specific knowledge (FORCE_ATTRIBUTE, SVG, aria/data) lives in the browser adapter.

import { getAdapter, REACTIVE } from "../core/types.ts";
import { isUse, use } from "../core/signal.ts";
import { isNil, isObject, isRecord, isString } from "../utils/type-guards.ts";

// 匹配 JSX 事件属性：on + 大写字母（如 onClick、onClickOutside）
export const EVENT_RE = /^on[A-Z]/;

// ── Attribute Prefix ──────────────────────────────────

export const stripPrefix = (rawKey: string): { prefix: "attr" | "prop" | null; key: string } => {
  const prefix = rawKey.startsWith("attr:") ? "attr" : rawKey.startsWith("prop:") ? "prop" : null;
  return { prefix, key: prefix ? rawKey.slice(5) : rawKey };
};

// ── setProp ────────────────────────────────────────────

export function setProp(el: any, rawKey: string, value: any): void {
  if (isNil(value)) return;

  const adapter = getAdapter();

  // style（不考虑前缀，prefix 只在 adapter 层处理）
  if (rawKey === "style" || rawKey === "attr:style" || rawKey === "prop:style") {
    if (isString(value)) {
      adapter.setProp(el, rawKey, value);
    } else if (isObject(value)) {
      const cssText = Object.entries(value)
        .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v}`)
        .join("; ");
      adapter.setProp(el, rawKey, cssText);
    }
    return;
  }

  // 事件
  if (EVENT_RE.test(rawKey)) {
    const eventName = rawKey.slice(2).toLowerCase();
    adapter.addEventListener(el, eventName, value);
    return;
  }

  // 全部委托给 adapter（attr:/prop: 前缀由 adapter 内部处理）
  adapter.setProp(el, rawKey, value);
}

// ── setProps ───────────────────────────────────────────

export function setProps(
  el: any,
  props: Record<string, any> | null | undefined,
  cleanups?: (() => void)[],
): void {
  if (!isRecord(props)) return;

  for (const key of Object.keys(props)) {
    if (key === "children") continue;

    const value = props[key];

    if (EVENT_RE.test(key)) {
      setProp(el, key, value);
    } else if (isUse(value)) {
      const [derived] = use(value, () => {
        setProp(el, key, value());
      });
      const stop = (derived as any)[REACTIVE]?.stop;
      if (stop) {
        if (cleanups) cleanups.push(stop);
      }
    } else {
      setProp(el, key, value);
    }
  }
}
