// kiaao — DOM property handling utilities

import { IS_REACTIVE } from "./types.ts";
import { effect } from "./runtime.ts";
import { addLocalEffect } from "./local-effect.ts";
import { addEvent, setAttr, removeAttr, FORCE_ATTRIBUTE, stripPrefix } from "./dom-utils.ts";

// 匹配 JSX 事件属性：on + 大写字母（如 onClick、onClickOutside）
// 排除 only、onto 等以 on 开头的非事件属性
export const EVENT_RE = /^on[A-Z]/;

export function setProp(el: Element, rawKey: string, value: any): void {
  if (value == null) return;

  // 1. 剥离前缀
  const { prefix, key } = stripPrefix(rawKey);

  // 2. prop: 前缀 → 强制 property（SVG 忽略前缀，回退到 setAttribute）
  if (prefix === "prop") {
    if (el instanceof SVGElement) {
      setAttr(el, key, String(value));
    } else {
      (el as any)[key] = value;
    }
    return;
  }

  // 3. attr: 前缀 → 强制 setAttribute
  if (prefix === "attr") {
    setAttr(el, key, String(value));
    return;
  }

  // 以下均为无前缀路径

  // 4. style（值类型决定路径，与 SVG/HTML 无关）
  if (key === "style") {
    if (typeof value === "string") {
      setAttr(el, "style", value);
    } else if (value && typeof value === "object") {
      removeAttr(el, "style");
      Object.assign((el as HTMLElement).style, value);
    }
    return;
  }

  // 5. 事件
  if (EVENT_RE.test(key)) {
    const eventName = key.slice(2).toLowerCase();
    addEvent(el, eventName, value);
    return;
  }

  // 6. SVG 元素 → 剩余属性一律 setAttribute
  if (el instanceof SVGElement) {
    setAttr(el, key, String(value));
    return;
  }

  // 7. aria-* / data-*
  if (key.startsWith("aria-") || key.startsWith("data-")) {
    setAttr(el, key, String(value));
    return;
  }

  // 8. FORCE_ATTRIBUTE
  if (FORCE_ATTRIBUTE.has(key)) {
    if (typeof value === "boolean") {
      if (value) setAttr(el, key, "");
      else removeAttr(el, key);
    } else {
      setAttr(el, key, String(value));
    }
    return;
  }

  // 9. 默认：property 赋值
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
    } else if ((value as any)?.[IS_REACTIVE]) {
      const stop = effect(() => {
        setProp(el, key, value());
      });
      addLocalEffect(el, stop);
    } else {
      setProp(el, key, value);
    }
  }
}
