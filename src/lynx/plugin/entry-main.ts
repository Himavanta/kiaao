// kiaao/lynx — 主线程入口
// 由 Rspeedy 插件注入到主线程 bundle 中。

import "../types.ts";
// 设置 Lynx 运行时需要的全局钩子，创建页面根节点。

Object.assign(globalThis, {
  processData(data: unknown, _processorName?: string): unknown {
    return data ?? {};
  },

  updatePage(): void {
    // 无操作——kiaao 的响应式系统自动更新
  },

  updateGlobalProps(): void {
    // 无操作
  },

  renderPage(): void {
    const page = __CreatePage("0", 0);
    __FlushElementTree(page);
  },
});
