// kiaao v4 — lazy (async component)

import { use } from "../reactive/core.ts";
import { h } from "./h.ts";

export function lazy<T extends (...args: any[]) => any>(
  loader: () => Promise<{ default: T } | T>,
  options?: { onError?: (err: Error) => void },
): T {
  const [Component, setComponent] = use<T | null>(null);
  const [error, setError] = use<Error | null>(null);

  loader()
    .then((mod) => {
      setComponent(() => (mod as any).default || mod);
    })
    .catch((err) => {
      setError(err);
      options?.onError?.(err);
    });

  const [isLoaded] = use(Component, () => Component() !== null);

  const LazyComponent = ((props: any) => {
    const err = error();
    if (err) throw err;

    return h(
      "div",
      {
        when: isLoaded,
        style: { display: "contents" },
      },
      () => h(Component()!, props),
    );
  }) as any;

  return LazyComponent as T;
}
