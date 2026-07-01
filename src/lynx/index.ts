// kiaao — Lynx 平台入口
// 使用: import { use, h, Show, render } from "kiaao/lynx"

import { setAdapter } from "../adapter/index.ts";
import { triggerMount, type HResult } from "../core/index.ts";
import { lynxAdapter, initLynxPage } from "./adapter.ts";

// ── 自动注册 Lynx 适配器 ─────────────────────────────

setAdapter(lynxAdapter);

// ── render ────────────────────────────────────────────

/**
 * 将应用渲染到 Lynx 页面。
 * 自动创建 page、挂载节点、触发 onMount。
 */
export function render(hr: HResult): void {
  const page = __CreatePage("0", 0);
  initLynxPage(page);

  const adapter = lynxAdapter;
  for (const node of hr.nodes) {
    adapter.append(page, node);
  }

  if (hr.owner) {
    triggerMount(hr.owner);
  }
}

// ── 重新导出核心 API ─────────────────────────────────

export * from "../core/index.ts";

// ── Lynx 特有导出 ────────────────────────────────────

export { lynxAdapter, initLynxPage } from "./adapter.ts";
