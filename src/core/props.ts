// kiaao — DOM property handling utilities

import { IS_REACTIVE } from "./types.ts";
import { effect } from "./runtime.ts";
import { addLocalEffect } from "./local-effect.ts";
import { addEvent, setClassName, setCssText, removeAttr, setAttr } from "./dom-utils.ts";

// 匹配 JSX 事件属性：on + 大写字母（如 onClick、onClickOutside）
// 排除 only、onto 等以 on 开头的非事件属性
export const EVENT_RE = /^on[A-Z]/;

export function setProp(el: HTMLElement, key: string, value: any): void {
  if (value == null) return;

  if (EVENT_RE.test(key)) {
    const eventName = key.slice(2).toLowerCase();
    addEvent(el, eventName, value);
    return;
  }

  switch (key) {
    case "class":
    case "className":
      setClassName(el, value);
      break;
    case "style":
      if (typeof value === "string") {
        setCssText(el, value);
      } else if (typeof value === "object" && value !== null) {
        removeAttr(el, "style");
        Object.assign(el.style, value);
      }
      break;
    default:
      if (typeof value === "boolean") {
        if (value) {
          setAttr(el, key, "");
        } else {
          removeAttr(el, key);
        }
      } else {
        setAttr(el, key, String(value));
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
