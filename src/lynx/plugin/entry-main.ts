// kiaao/lynx — 主线程入口
// 创建页面，后台线程渲染到该页面上

import "../types.ts";

Object.assign(globalThis, {
  processData(data: unknown, _processorName?: string): unknown {
    return data ?? {};
  },

  updatePage(): void {
    // 无操作
  },

  updateGlobalProps(): void {
    // 无操作
  },

  renderPage(): void {
    __CreatePage("0", 0);
    __FlushElementTree();
  },
});
