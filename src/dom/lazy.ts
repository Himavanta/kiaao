// kiaao — lazy (async component loader)
// Returns a component that loads asynchronously and renders via the framework's
// built-in async component mechanism (h() detects Promise return values).

import { getRenderMode } from "../adapter/index.ts";
import type { ComponentFunction } from "../core/index.ts";
import { h } from "../core/index.ts";

export function lazy<T extends ComponentFunction<any>>(
  loader: () => Promise<{ default: T } | T>,
): T {
  const LazyComponent: ComponentFunction<any> = (props) => {
    if (getRenderMode() === "ssr") {
      throw new Error("[kiaao] Async components are not supported in SSR.");
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
