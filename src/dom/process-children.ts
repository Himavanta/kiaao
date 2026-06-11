// kiaao v4 — Child node processing for h()

import { isUse, use } from "../reactive/core.ts";
import { REACTIVE } from "../reactive/types.ts";
import { addLocalEffect } from "./local-effect.ts";
import { createTextNode } from "./dom-utils.ts";

export function processChildren(children: any[]): Node[] {
  const result: Node[] = [];

  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...processChildren(child));
      continue;
    }

    if (child == null || typeof child === "boolean") continue;

    if (isUse(child)) {
      const textNode = createTextNode("");
      const [derived] = use(child, () => {
        textNode.textContent = String(child());
      });
      addLocalEffect(textNode, (derived as any)[REACTIVE].stop);
      result.push(textNode);
      continue;
    }

    if (child instanceof Node) {
      result.push(child);
      continue;
    }

    result.push(createTextNode(String(child)));
  }

  return result;
}
