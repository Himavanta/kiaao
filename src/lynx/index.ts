// kiaao — Lynx 平台入口（主线程模式）

import { setAdapter } from "../adapter/index.ts";
import { triggerMount, type HResult } from "../core/index.ts";
import { lynxAdapter, initLynxPage } from "./adapter.ts";

setAdapter(lynxAdapter);

// ── Lynx 运行时需要的全局钩子 ──────────────────────

Object.assign(globalThis, {
  processData(data: unknown, _caller?: string): unknown {
    return data ?? {};
  },
  updatePage(): void {},
  renderPage(): void {
    // 由 render() 处理
  },
});

// ── render ────────────────────────────────────────────

export function render(appComponent: () => HResult): void {
  const page = __CreatePage("0", 0);
  initLynxPage(page);

  const hr = appComponent();
  for (const node of hr.nodes) {
    lynxAdapter.append(page, node);
  }

  if (hr.owner) {
    triggerMount(hr.owner);
  }
}

export * from "../core/index.ts";
export { lynxAdapter, initLynxPage } from "./adapter.ts";
