// kiaao v4 — DOM property/attribute/event handling

import { isUse, use } from "../reactive/core.ts";
import { REACTIVE } from "../reactive/types.ts";
import { addLocalEffect } from "./local-effect.ts";
import { addEvent, setAttr, removeAttr, FORCE_ATTRIBUTE, stripPrefix } from "./dom-utils.ts";

// 匹配 JSX 事件属性：on + 大写字母（如 onClick、onClickOutside）
export const EVENT_RE = /^on[A-Z]/;

export function setProp(el: Element, rawKey: string, value: any): void {
  if (value == null) return;

  const { prefix, key } = stripPrefix(rawKey);

  // prop: 前缀 → 强制 property
  if (prefix === "prop") {
    (el as any)[key] = value;
    return;
  }

  // attr: 前缀 → 强制 setAttribute
  if (prefix === "attr") {
    setAttr(el, key, String(value));
    return;
  }

  // style
  if (key === "style") {
    if (typeof value === "string") {
      setAttr(el, "style", value);
    } else if (value && typeof value === "object") {
      removeAttr(el, "style");
      Object.assign((el as HTMLElement).style, value);
    }
    return;
  }

  // 事件
  if (EVENT_RE.test(key)) {
    const eventName = key.slice(2).toLowerCase();
    addEvent(el, eventName, value);
    return;
  }

  // SVG → setAttribute
  if (el instanceof SVGElement) {
    setAttr(el, key, String(value));
    return;
  }

  // aria-* / data-*
  if (key.startsWith("aria-") || key.startsWith("data-")) {
    setAttr(el, key, String(value));
    return;
  }

  // FORCE_ATTRIBUTE
  if (FORCE_ATTRIBUTE.has(key)) {
    if (typeof value === "boolean") {
      if (value) setAttr(el, key, "");
      else removeAttr(el, key);
    } else {
      setAttr(el, key, String(value));
    }
    return;
  }

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
