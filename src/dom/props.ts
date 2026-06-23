// kiaao — DOM property/attribute/event handling via RenderAdapter
// Replaces the old src/dom/props.ts. Uses the RenderAdapter for DOM operations
// and registers reactive bindings to the current Owner (via currentOwner).

import { getAdapter } from "../core/types.ts";
import { currentOwner } from "../core/owner.ts";
import { isUse, use } from "../core/signal.ts";
import { REACTIVE } from "../core/types.ts";
import { isBoolean, isNil, isObject, isRecord, isString } from "../utils/type-guards.ts";
import { FORCE_ATTRIBUTE } from "./adapter.ts";

// 匹配 JSX 事件属性：on + 大写字母（如 onClick、onClickOutside）
export const EVENT_RE = /^on[A-Z]/;

// ── Attribute Prefix ──────────────────────────────────

export const stripPrefix = (rawKey: string): { prefix: "attr" | "prop" | null; key: string } => {
  const prefix = rawKey.startsWith("attr:") ? "attr" : rawKey.startsWith("prop:") ? "prop" : null;
  return { prefix, key: prefix ? rawKey.slice(5) : rawKey };
};

// ── setProp ────────────────────────────────────────────

/**
 * 在元素上设置单个属性。
 * 通过 RenderAdapter 执行实际的 DOM 操作。
 */
export function setProp(el: any, rawKey: string, value: any): void {
  if (isNil(value)) return;

  const adapter = getAdapter();
  const { prefix, key } = stripPrefix(rawKey);

  // prop:/attr: 前缀强制属性
  if (prefix === "prop") {
    adapter.setProperty(el, key, value);
    return;
  }
  if (prefix === "attr") {
    adapter.setAttribute(el, key, String(value));
    return;
  }

  // style
  if (key === "style") {
    if (isString(value)) {
      adapter.setAttribute(el, "style", value);
    } else if (isObject(value)) {
      // 将对象转换为 CSS 字符串，兼容浏览器和 SSR
      const cssText = Object.entries(value)
        .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v}`)
        .join("; ");
      adapter.setAttribute(el, "style", cssText);
    }
    return;
  }

  // 事件
  if (EVENT_RE.test(key)) {
    const eventName = key.slice(2).toLowerCase();
    adapter.addEventListener(el, eventName, value);
    return;
  }

  // SVG → setAttribute
  if (el instanceof SVGElement) {
    adapter.setAttribute(el, key, String(value));
    return;
  }

  // aria-* / data-*
  if (key.startsWith("aria-") || key.startsWith("data-")) {
    adapter.setAttribute(el, key, String(value));
    return;
  }

  // FORCE_ATTRIBUTE
  if (FORCE_ATTRIBUTE.has(key)) {
    if (isBoolean(value)) {
      if (value) adapter.setAttribute(el, key, "");
      else adapter.removeAttribute(el, key);
    } else {
      adapter.setAttribute(el, key, String(value));
    }
    return;
  }

  // 默认：property
  adapter.setProperty(el, key, value);
}

// ── setProps ───────────────────────────────────────────

/**
 * 在元素上设置一组属性。
 * 响应式属性（信号）自动创建派生绑定，
 * 清理函数注册到当前 Owner。
 */
export function setProps(el: any, props: Record<string, any> | null | undefined): void {
  if (!isRecord(props)) return;

  for (const key of Object.keys(props)) {
    if (key === "children") continue;

    const value = props[key];

    if (EVENT_RE.test(key)) {
      setProp(el, key, value);
    } else if (isUse(value)) {
      const [derived] = use(value, () => {
        const currentVal = value();
        setProp(el, key, currentVal);
      });
      const stop = (derived as any)[REACTIVE]?.stop;
      if (stop) {
        const owner = currentOwner.get();
        if (owner) owner.cleanups.push(stop);
      }
    } else {
      setProp(el, key, value);
    }
  }
}
