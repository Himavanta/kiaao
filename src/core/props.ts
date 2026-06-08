// kiaao — DOM property handling utilities

import { IS_REACTIVE } from "./types.ts";
import { effect } from "./runtime.ts";
import { addLocalEffect } from "./local-effect.ts";

// 匹配 JSX 事件属性：on + 大写字母（如 onClick、onClickOutside）
// 排除 only、onto 等以 on 开头的非事件属性
export const EVENT_RE = /^on[A-Z]/;

export function setProp(el: HTMLElement, key: string, value: any): void {
  if (value == null) return;

  if (EVENT_RE.test(key)) {
    const eventName = key.slice(2).toLowerCase();
    el.addEventListener(eventName, value);
    return;
  }

  switch (key) {
    case "class":
    case "className":
      el.className = value;
      break;
    case "style":
      if (typeof value === "string") {
        el.style.cssText = value;
      } else if (typeof value === "object" && value !== null) {
        el.removeAttribute("style");
        Object.assign(el.style, value);
      }
      break;
    default:
      if (typeof value === "boolean") {
        if (value) {
          el.setAttribute(key, "");
        } else {
          el.removeAttribute(key);
        }
      } else {
        el.setAttribute(key, String(value));
      }
      break;
  }
}

/** 在元素上设置一组属性（事件/响应式/静态），effect 注册到 LOCAL_EFFECTS */
export function setProps(el: HTMLElement, props: Record<string, any> | null | undefined): void {
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
