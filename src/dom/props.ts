// kiaao v4 — DOM property/attribute/event handling

import { isUse, use } from "../reactive/core.ts";
import { REACTIVE } from "../reactive/types.ts";
import { addLocalEffect } from "./local-effect.ts";
import { addEvent, setAttr, removeAttr, FORCE_ATTRIBUTE, stripPrefix } from "./dom-utils.ts";

// 匹配 JSX 事件属性：on + 大写字母（如 onClick、onClickOutside）
export const EVENT_RE = /^on[A-Z]/;

// ── Prefix Property ───────────────────────────────────

/** 处理 prop:/attr: 前缀强制属性 */
function setPropByPrefix(el: Element, prefix: string | null, key: string, value: any): boolean {
  if (prefix === "prop") {
    (el as any)[key] = value;
    return true;
  }
  if (prefix === "attr") {
    setAttr(el, key, String(value));
    return true;
  }
  return false;
}

// ── Style ──────────────────────────────────────────────

/** 处理 style 属性：字符串或对象 */
function setStyleProp(el: Element, value: any): boolean {
  if (typeof value === "string") {
    setAttr(el, "style", value);
    return true;
  }
  if (value && typeof value === "object") {
    removeAttr(el, "style");
    Object.assign((el as HTMLElement).style, value);
    return true;
  }
  return false;
}

// ── Event ──────────────────────────────────────────────

/** 处理事件绑定：onXxx → addEventListener */
function setEventProp(el: Element, key: string, value: any): boolean {
  if (EVENT_RE.test(key)) {
    const eventName = key.slice(2).toLowerCase();
    addEvent(el, eventName, value);
    return true;
  }
  return false;
}

// ── Attribute Property ─────────────────────────────────

/** 处理需要走 setAttribute 的属性：SVG、aria/data、FORCE_ATTRIBUTE */
function setAttributeProp(el: Element, key: string, value: any): boolean {
  // SVG → setAttribute
  if (el instanceof SVGElement) {
    setAttr(el, key, String(value));
    return true;
  }

  // aria-* / data-*
  if (key.startsWith("aria-") || key.startsWith("data-")) {
    setAttr(el, key, String(value));
    return true;
  }

  // FORCE_ATTRIBUTE
  if (FORCE_ATTRIBUTE.has(key)) {
    if (typeof value === "boolean") {
      if (value) setAttr(el, key, "");
      else removeAttr(el, key);
    } else {
      setAttr(el, key, String(value));
    }
    return true;
  }

  return false;
}

// ── setProp ────────────────────────────────────────────

export function setProp(el: Element, rawKey: string, value: any): void {
  if (value == null) return;

  const { prefix, key } = stripPrefix(rawKey);

  // prop:/attr: 前缀
  if (setPropByPrefix(el, prefix, key, value)) return;

  // style
  if (key === "style") {
    setStyleProp(el, value);
    return;
  }

  // 事件
  if (setEventProp(el, key, value)) return;

  // SVG / aria / data / FORCE_ATTRIBUTE
  if (setAttributeProp(el, key, value)) return;

  // 默认：property
  (el as any)[key] = value;
}

/** 在元素上设置一组属性（事件/响应式/静态），effect 注册到 LOCAL_EFFECTS */
export function setProps(el: Element, props: Record<string, any> | null | undefined): void {
  if (!props || typeof props !== "object") return;

  for (const key of Object.keys(props)) {
    if (key === "children") continue;

    const value = props[key];

    if (EVENT_RE.test(key)) {
      setProp(el, key, value);
    } else if (isUse(value)) {
      const [derived] = use(value, () => {
        setProp(el, key, value());
      });
      addLocalEffect(el, (derived as any)[REACTIVE].stop);
    } else {
      setProp(el, key, value);
    }
  }
}
