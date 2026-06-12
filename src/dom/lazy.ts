// kiaao v4 — lazy (async component loader)
// Returns a component that loads asynchronously and renders via the framework's
// built-in async component mechanism (h() detects Promise return values).

import type { ComponentFunction } from "./h.ts";
import { h } from "./h.ts";

export function lazy<T extends ComponentFunction<any>>(
  loader: () => Promise<{ default: T } | T>,
): T {
  const LazyComponent: ComponentFunction<any> = (props) => {
    return loader()
      .then((mod) => {
        const Comp = (mod as any).default || mod;
        return h(Comp, props);
      })
      .catch((err: Error) => {
        console.error("[kiaao] lazy loading error:", err);
        if (typeof document !== "undefined") {
          return document.createTextNode(String(err));
        }
        throw err;
      });
  };

  return LazyComponent as unknown as T;
}
