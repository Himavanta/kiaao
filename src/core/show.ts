// kiaao — Show: conditional rendering component
// Renders Primary component when value is truthy, Fallback when falsy.

import type { ComponentFunction, Context } from "./component.ts";
import { initAnchor, adoptBranch, normalizeChildList, subscribeSignal } from "./flow-shared.ts";
import { disposeOwner } from "./owner.ts";
import { toValue } from "./signal.ts";
import { isNotNil } from "./type-guards.ts";
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
  const anchor = initAnchor(context.owner, "show");
  const [primary, fallback] = normalizeChildList(props.children) as [
    ComponentFunction,
    ComponentFunction?,
  ];
  let result: HResult | null = null;

  const renderBranch = () => {
    if (isNotNil(result)) {
      disposeOwner(result.owner!);
      result = null;
    }
    if (toValue(props.value)) {
      result = adoptBranch({ parentOwner: context.owner, anchor, Component: primary });
    } else if (isNotNil(fallback)) {
      result = adoptBranch({ parentOwner: context.owner, anchor, Component: fallback });
    }
  };

  // Initial render: anchor is in DOM when onMount fires, so before() works
  context.onMount(renderBranch);

  // Subsequent changes via signal
  subscribeSignal(context.owner, props.value, renderBranch);

  return createHResult(null, [anchor]);
}
