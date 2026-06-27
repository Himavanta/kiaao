// kiaao — Show: conditional rendering component
// Replaces the old `when` boolean-mode directive.
// Renders Primary component when value is truthy, Fallback when falsy.

import { getAdapter } from "../adapter/index.ts";
import type { ComponentFunction, Context } from "./component.ts";
import { h } from "./h.ts";
import { disposeOwner } from "./owner.ts";
import { use, isUse, toValue } from "./signal.ts";
import { isNotNil } from "./type-guards.ts";
import { getSignalState } from "./types.ts";
import type { HostNode, HResult } from "./types.ts";

// ── Show ──────────────────────────────────────────────

export function Show(
  props: {
    value: any;
    children: [ComponentFunction, ComponentFunction?];
  },
  context: Context,
): HostNode[] {
  const adapter = getAdapter();
  const anchor = adapter.createComment("show");
  context.owner.elements.add(anchor);

  let result: HResult | null = null;

  // Render a branch component and link it under our Owner
  const branch = (Component: ComponentFunction): HResult => {
    const r = h(Component);
    const owner = r.owner!;
    owner.parent = context.owner;
    context.owner.children.push(owner);
    for (const node of r.nodes) {
      adapter.before(anchor, node);
    }
    return r;
  };

  // Initial render
  if (toValue(props.value)) {
    result = branch(props.children[0]);
  } else if (isNotNil(props.children[1])) {
    result = branch(props.children[1]);
  }

  // Subscribe to signal changes
  if (isUse(props.value)) {
    const derived = use(props.value, () => {
      if (isNotNil(result)) {
        disposeOwner(result.owner!);
        result = null;
      }
      if (toValue(props.value)) {
        result = branch(props.children[0]);
      } else if (isNotNil(props.children[1])) {
        result = branch(props.children[1]);
      }
    });
    const state = getSignalState(derived);
    if (state?.stop) context.owner.cleanups.push(state.stop);
  }

  return [anchor];
}
