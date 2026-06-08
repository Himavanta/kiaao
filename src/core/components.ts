// kiaao — Built-in components: Teleport, lazy

import { SSR_COMPONENT, type ReactiveFunction } from "./types.ts";

import { define } from "./runtime.ts";

import { h } from "./h.ts";
import { onUnmount, disposeNode, triggerMount } from "./lifecycle.ts";
import { ssr } from "./ssr-helpers.ts";
import { createComment, qs } from "./dom-utils.ts";

// ── Teleport ───────────────────────────────────────────────

export function Teleport(props: {
  to: string | HTMLElement;
  children: (() => any) | ReactiveFunction;
}): Node {
  const target = typeof props.to === "string" ? qs<HTMLElement>(props.to) : props.to;
  if (!target) return createComment("teleport-missing-target");

  const content = props.children();
  if (content instanceof Node) {
    target.append(content);
    triggerMount(content);
  }

  onUnmount(() => {
    disposeNode(content);
    content.remove();
  });

  return createComment("teleport");
}

(Teleport as any)[SSR_COMPONENT] = () => ssr("<!-- teleport placeholder -->");

// ── lazy (async component) ───────────────────────────────────

export function lazy<T extends (...args: any[]) => any>(
  loader: () => Promise<{ default: T } | T>,
  options?: { onError?: (err: Error) => void },
): T {
  const [Component, setComponent] = define<T | null>(null);
  const [error, setError] = define<Error | null>(null);

  loader()
    .then((mod) => {
      setComponent(() => (mod as any).default || mod);
    })
    .catch((err) => {
      setError(err);
      options?.onError?.(err);
    });

  const LazyComponent = ((props: any) => {
    const err = error();
    if (err) throw err;

    // 使用 when 指令（而非 Show 组件）管理加载状态
    return h(
      "div",
      {
        when: () => Component() !== null,
        style: { display: "contents" },
      },
      () => h(Component()!, props),
    );
  }) as any;

  return LazyComponent as T;
}
