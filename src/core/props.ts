// kiaao — Property/attribute/event handling (platform-agnostic)
// Iterates props, handles reactive bindings, delegates platform-specific
// setProp/event binding to adapter.

import { getAdapter } from "../adapter/index.ts";
import { isUse, use } from "./signal.ts";
import { isRecord } from "./type-guards.ts";
import { getSignalState, type HostNode, type NullableProps, type CleanupFn } from "./types.ts";

// 匹配 JSX 事件属性：on + 大写字母（如 onClick、onClickOutside）
export const EVENT_RE = /^on[A-Z]/;

// ── setProps ───────────────────────────────────────────

export function setProps(el: HostNode, props: NullableProps = {}, cleanups?: CleanupFn[]): void {
  if (!isRecord(props)) return;

  const adapter = getAdapter();

  for (const key of Object.keys(props)) {
    if (key === "children") continue;

    const value = props[key];

    if (EVENT_RE.test(key)) {
      // 事件绑定——adapter.addEventListener 在 SSR 下是空操作
      const eventName = key.slice(2).toLowerCase();
      adapter.addEventListener(el, eventName, value);
    } else if (isUse(value)) {
      // 信号值——创建响应式绑定，值变化时自动更新
      const derived = use(value, () => {
        adapter.setProp(el, key, value());
      });
      const stop = getSignalState(derived)?.stop;
      if (stop && cleanups) {
        cleanups.push(stop);
      }
    } else {
      // 静态值——直接设值
      adapter.setProp(el, key, value);
    }
  }
}
