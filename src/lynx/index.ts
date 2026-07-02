// kiaao — Lynx 平台入口
// 使用: import { use, h, Show, render } from "kiaao/lynx"

import { setAdapter } from "../adapter/index.ts";
import { triggerMount, type HResult } from "../core/index.ts";
import { lynxAdapter, initLynxPage } from "./adapter.ts";

// ── 自动注册 Lynx 适配器 ─────────────────────────────

setAdapter(lynxAdapter);

// ── Lynx 运行时全局钩子 ───────────────────────────────

let _appComponent: (() => HResult) | null = null;

Object.assign(globalThis, {
  renderPage(): void {
    if (!_appComponent) return;
    const page = __CreatePage("0", 0);
    initLynxPage(page);

    const hr = _appComponent();
    const adapter = lynxAdapter;
    for (const node of hr.nodes) {
      adapter.append(page, node);
    }

    if (hr.owner) {
      triggerMount(hr.owner);
    }
  },

  processData(): void {
    // Lynx 运行时需要的空钩子
  },

  updatePage(): void {
    // Lynx 运行时需要的空钩子
  },

  runWorklet(value: unknown, params: unknown[]): void {
    if (typeof value === "function") {
      (value as (...args: unknown[]) => void)(...params);
    }
  },
});

// ── render ────────────────────────────────────────────

export function render(appComponent: () => HResult): void {
  _appComponent = appComponent;
}

// ── 重新导出核心 API ─────────────────────────────────

export * from "../core/index.ts";

// ── Lynx 特有导出 ────────────────────────────────────

export { lynxAdapter, initLynxPage } from "./adapter.ts";
