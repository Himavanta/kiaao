// kiaao — Property/attribute/event handling (platform-agnostic)
// Iterates props, handles reactive bindings, delegates platform-specific
// setProp/event binding to adapter.

import { getAdapter } from "../adapter/index.ts";
import { isUse, use } from "./signal.ts";
import { isRecord } from "./type-guards.ts";
import { getSignalState, type HostNode, type NullableProps, type CleanupFn } from "./types.ts";

// ── setProps ───────────────────────────────────────────

/**
 * 遍历 props 并设置到宿主节点。
 * 所有属性（含事件）统一走 `adapter.setProp`，由各平台 adaper 内部分发。
 * 事件不需要响应式绑定——`onClick={fn}` 是一次性绑定的函数。
 */
export function setProps(el: HostNode, props: NullableProps = {}, cleanups?: CleanupFn[]): void {
  if (!isRecord(props)) return;

  const adapter = getAdapter();

  for (const key of Object.keys(props)) {
    if (key === "children") continue;

    const value = props[key];

    if (isUse(value)) {
      // 信号值——创建响应式绑定，值变化时自动更新
      const derived = use(value, () => {
        adapter.setProp(el, key, value());
      });
      const stop = getSignalState(derived)?.stop;
      if (stop && cleanups) {
        cleanups.push(stop);
      }
    } else {
      // 静态值（含事件处理函数）——统一走 adapter.setProp
      adapter.setProp(el, key, value);
    }
  }
}
