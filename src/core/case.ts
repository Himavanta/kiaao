// kiaao — Case: multi-branch conditional rendering component
// Selects a branch component from a mapping table based on `value`.
// First render is synchronous (skipInsert), subsequent updates via signal.

import { getAdapter } from "../adapter/index.ts";
import type { ComponentFunction, Context } from "./component.ts";
import { adoptBranch, normalizeChildList, subscribeSignal } from "./flow-shared.ts";
import { disposeOwner } from "./owner.ts";
import { toValue } from "./signal.ts";
import { isNotNil, isString } from "./type-guards.ts";
import type { ControlFlowChildren, HResult, MaybeSignal } from "./types.ts";
import { createHResult } from "./types.ts";

// ── Case ──────────────────────────────────────────────

export function Case(
  props: {
    value: MaybeSignal<string>;
    children: ControlFlowChildren<Record<string, ComponentFunction>, ComponentFunction>;
  },
  context: Context,
): HResult {
  const adapter = getAdapter();
  const anchor = adapter.comment("case");
  context.owner.elements.add(anchor);

  const childList = normalizeChildList(props.children);
  const [mappingTable, fallbackComponent] = childList as [
    Record<string, ComponentFunction>,
    ComponentFunction?,
  ];

  let currentResult: HResult | null = null;
  let prevKey: unknown = undefined;

  const resolveComponent = (rawValue: unknown): ComponentFunction | undefined => {
    const key = isString(rawValue) ? rawValue : String(rawValue);
    return mappingTable[key] ?? fallbackComponent;
  };

  const renderBranch = (isInitial: boolean) => {
    const newValue = toValue(props.value);
    if (newValue === prevKey) return;
    prevKey = newValue;

    if (currentResult?.owner) disposeOwner(currentResult.owner);

    const Component = resolveComponent(newValue);
    if (isNotNil(Component)) {
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

  // First render: synchronous
  renderBranch(true);

  // Subsequent changes via signal
  subscribeSignal(context.owner, props.value, () => renderBranch(false));

  const nodes = currentResult ? [...(currentResult as HResult).nodes, anchor] : [anchor];
  return createHResult({ owner: context.owner, nodes });
}
