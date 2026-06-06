// kiaao — Control flow components: Show, List, Teleport, lazy

import { SSR_COMPONENT, type ReactiveFunction } from "./types.ts";

import { effect, define } from "./runtime.ts";

import { h } from "./dom.ts";
import { onUnmount, disposeNode, triggerMount } from "./lifecycle.ts";
import { hSSR, ssr, isSSRSafe, renderSSRChild } from "./ssr-helpers.ts";

// ── Show ──────────────────────────────────────────────────

export function Show(props: {
  when: (() => any) | ReactiveFunction;
  fallback?: () => any;
  children?: () => any;
}): Node {
  const anchor = document.createComment("show");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(anchor);

  let branchNodes: Node[] = [];
  let isFirstRun = true;

  function removeBranch() {
    for (const node of branchNodes) {
      disposeNode(node);
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
    branchNodes = [];
  }

  function collectNodes(result: any): Node[] {
    if (result instanceof DocumentFragment) {
      return Array.from(result.childNodes);
    }
    if (result instanceof Node) {
      return [result];
    }
    if (result != null) {
      return [document.createTextNode(String(result))];
    }
    return [];
  }

  effect(() => {
    const show = Boolean(props.when());

    if (!isFirstRun) {
      removeBranch();
    }

    const renderFn = show ? props.children : props.fallback;
    if (renderFn) {
      const result = renderFn();
      const nodes = collectNodes(result);
      const parent = anchor.parentNode ?? fragment;

      for (const node of nodes) {
        parent.insertBefore(node, anchor.nextSibling);
      }
      branchNodes = nodes;

      if (!isFirstRun && anchor.parentNode) {
        for (const node of nodes) {
          triggerMount(node);
        }
      }
    }

    isFirstRun = false;
  });

  return fragment;
}

// ── List ──────────────────────────────────────────────────

export function List<T>(props: {
  each: () => T[];
  key: (item: T, index: number) => any;
  children?: (item: T, index: number) => any;
}): Node {
  const anchor = document.createComment("list");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(anchor);

  const children = props.children!;

  effect(() => {
    const list = props.each();
    const parent = anchor.parentNode ?? fragment;

    while (anchor.nextSibling) {
      const old = anchor.nextSibling;
      disposeNode(old);
      old.parentNode?.removeChild(old);
    }

    let prevNode: Node = anchor;
    for (let i = 0; i < list.length; i++) {
      const node = children(list[i], i);
      parent.insertBefore(node, prevNode.nextSibling);
      if (parent !== fragment) {
        triggerMount(node);
      }
      prevNode = node;
    }
  });

  return fragment;
}

// ── Teleport ───────────────────────────────────────────────

export function Teleport(props: { to: string | HTMLElement; children: () => any }): Node {
  const target =
    typeof props.to === "string" ? document.querySelector<HTMLElement>(props.to) : props.to;
  if (!target) return document.createComment("teleport-missing-target");

  const content = props.children();
  if (content instanceof Node) {
    target.appendChild(content);
    triggerMount(content);
  }

  onUnmount(() => {
    if (content instanceof Node) {
      disposeNode(content);
      if (content.parentNode) {
        content.parentNode.removeChild(content);
      }
    }
  });

  return document.createComment("teleport");
}

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
      setError(() => err);
      options?.onError?.(err);
    });

  const LazyComponent = ((props: any) => {
    const err = error();
    if (err) throw err;

    return h(Show, {
      when: () => Component() !== null,
      fallback: () => document.createComment("lazy-loading"),
      children: () => h(Component()!, props),
    });
  }) as any;

  (LazyComponent as any)[SSR_COMPONENT] = () => ssr("<!-- lazy placeholder -->");

  return LazyComponent as T;
}

// ── SSR variants ─────────────────────────────────────────

(Show as any)[SSR_COMPONENT] = (props: any) => {
  const show = Boolean(props.when());
  const renderFn = show ? props.children : props.fallback;
  if (renderFn) {
    return hSSR("div", null, [renderFn()]);
  }
  return ssr("");
};

(List as any)[SSR_COMPONENT] = (props: any) => {
  const items = props.each();
  let html = "";
  for (let i = 0; i < items.length; i++) {
    const child = props.children(items[i], i);
    html += isSSRSafe(child) ? child.html : renderSSRChild(child);
  }
  return ssr(html);
};

(Teleport as any)[SSR_COMPONENT] = () => ssr("<!-- teleport placeholder -->");
