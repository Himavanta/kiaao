// kiaao — Child node processing for h()

import { IS_REACTIVE, type ReactiveFunction } from "./types.ts";
import { effect } from "./runtime.ts";
import { addLocalEffect } from "./local-effect.ts";

export function processChildren(children: any[]): Node[] {
  const result: Node[] = [];

  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...processChildren(child));
      continue;
    }

    if (child == null || typeof child === "boolean") continue;

    if ((child as ReactiveFunction)[IS_REACTIVE]) {
      const textNode = document.createTextNode("");
      const stop = effect(() => {
        textNode.textContent = String(child());
      });
      addLocalEffect(textNode, stop);
      result.push(textNode);
      continue;
    }

    if (child instanceof Node) {
      result.push(child);
      continue;
    }

    result.push(document.createTextNode(String(child)));
  }

  return result;
}
