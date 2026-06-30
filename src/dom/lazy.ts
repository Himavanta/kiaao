// kiaao — lazy (async component loader)
// Returns a component that loads asynchronously and renders via the framework's
// built-in async component mechanism (h() detects Promise return values).

import { getAdapter, getRenderMode } from "../adapter/index.ts";
import type { ComponentFunction } from "../core/index.ts";
import { h, createHResult } from "../core/index.ts";

export function lazy<T extends ComponentFunction<any>>(
  loader: () => Promise<{ default: T } | T>,
): T {
  const LazyComponent: ComponentFunction<any> = (props) => {
    if (getRenderMode() === "ssr") {
      // SSR: 异步组件无法加载，返回占位注释
      const adapter = getAdapter();
      return createHResult({ owner: null, nodes: [adapter.comment("lazy-ssr")] });
    }

    return loader()
      .then((mod) => {
        const Comp = (mod as any).default || mod;
        return h(Comp, props);
      })
      .catch((err: Error) => {
        console.error("[kiaao] lazy loading error:", err);
        return h("span", null, String(err));
      });
  };

  return LazyComponent as unknown as T;
}
