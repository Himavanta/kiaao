// kiaao — Lynx Rspeedy 插件
// 处理 Lynx 双线程架构：主线程入口 + 后台线程入口

import { LAYERS } from "./layers.ts";

const PLUGIN_NAME = "plugin-kiaao-lynx";

export function pluginKiaaoLynx(): any {
  return {
    name: PLUGIN_NAME,

    setup(api: any) {
      api.modifyBundlerChain((chain: any, { environment }: any) => {
        const isLynx = environment.name === "lynx" || environment.name.startsWith("lynx-");
        if (!isLynx) return;

        // 解析 entry-main 的绝对路径（用 import.meta.url 避免 node:* 依赖）
        const entryMainPath = new URL("./entry-main.js", import.meta.url).pathname;

        // 收集用户入口
        const entries = chain.entryPoints.entries() ?? {};
        chain.entryPoints.clear();

        for (const [entryName, entryPoint] of Object.entries(entries)) {
          const imports: string[] = [];
          for (const val of (entryPoint as any).values()) {
            if (typeof val === "string") imports.push(val);
            else if (typeof val === "object" && val !== null) {
              const imp = (val as { import?: string | string[] }).import;
              if (Array.isArray(imp)) imports.push(...imp);
              else if (imp) imports.push(imp);
            }
          }

          // ── 主线程入口 ──────────────────────────────────
          chain
            .entry(`${entryName}__main-thread`)
            .add({
              layer: LAYERS.MAIN_THREAD,
              import: [entryMainPath],
            })
            .end();

          // ── 后台线程入口 ─────────────────────────────────
          chain
            .entry(entryName)
            .add({
              layer: LAYERS.BACKGROUND,
              import: imports,
            })
            .end();
        }
      });
    },
  };
}
