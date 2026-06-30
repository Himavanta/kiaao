// kiaao — Show: conditional rendering component
// Renders Primary component when value is truthy, Fallback when falsy.
// First render is synchronous (skipInsert), subsequent updates via signal.

import { getAdapter } from "../adapter/index.ts";
import type { ComponentFunction, Context } from "./component.ts";
import { adoptBranch, normalizeChildList, subscribeSignal } from "./flow-shared.ts";
import { disposeOwner } from "./owner.ts";
import { toValue } from "./signal.ts";
import { type HResult, type ControlFlowChildren, type MaybeSignal } from "./types.ts";
import { createHResult } from "./types.ts";

// ── Show ──────────────────────────────────────────────

export function Show(
  props: {
    value: MaybeSignal<boolean>;
    children: ControlFlowChildren<ComponentFunction, ComponentFunction>;
  },
  context: Context,
): HResult {
  const adapter = getAdapter();
  const anchor = adapter.comment("show");
  context.owner.elements.add(anchor);

  const [primary, fallback] = normalizeChildList(props.children) as [
    ComponentFunction,
    ComponentFunction?,
  ];
  let currentResult: HResult | null = null;

  const renderBranch = (isInitial: boolean) => {
    if (currentResult?.owner) disposeOwner(currentResult.owner);
    const value = toValue(props.value);
    const Component = value ? primary : fallback;
    if (Component) {
      currentResult = adoptBranch({
        parentOwner: context.owner,
        anchor,
        Component,
        skipInsert: isInitial,
      });
    } else {
      currentResult = null;
    }
  };

  // First render: synchronous, nodes returned via HResult
  renderBranch(true);

  // Subsequent changes via signal
  subscribeSignal(context.owner, props.value, () => renderBranch(false));

  const nodes = currentResult ? [...(currentResult as HResult).nodes, anchor] : [anchor];
  return createHResult(context.owner, nodes, [], []);
}
