// kiaao — Case: multi-branch conditional rendering component
// Selects a branch component from a mapping table based on `value`.

import type { ComponentFunction, Context } from "./component.ts";
import { initAnchor, adoptBranch, normalizeChildList, subscribeSignal } from "./flow-shared.ts";
import { disposeOwner, createOwner } from "./owner.ts";
import { toValue } from "./signal.ts";
import { isNotNil, isString } from "./type-guards.ts";
import type { HResult, ControlFlowChildren, MaybeSignal } from "./types.ts";
import { createHResult } from "./types.ts";

// ── Case ──────────────────────────────────────────────

export function Case(
  props: {
    value: MaybeSignal<string>;
    children: ControlFlowChildren<Record<string, ComponentFunction>, ComponentFunction>;
  },
  context: Context,
): HResult {
  const anchor = initAnchor(context.owner, "case");
  const childList = normalizeChildList(props.children);
  const [mappingTable, fallbackComponent] = childList as [
    Record<string, ComponentFunction>,
    ComponentFunction?,
  ];

  let result: HResult | null = null;
  let prevKey: unknown = undefined;

  const resolveComponent = (rawValue: unknown): ComponentFunction | undefined => {
    const key = isString(rawValue) ? rawValue : String(rawValue);
    return mappingTable[key] ?? fallbackComponent;
  };

  const renderBranch = () => {
    const newValue = toValue(props.value);
    if (newValue === prevKey) return;
    prevKey = newValue;

    if (isNotNil(result)) {
      disposeOwner(result.owner!);
      result = null;
    }

    const Component = resolveComponent(newValue);
    if (isNotNil(Component)) {
      result = adoptBranch({ parentOwner: context.owner, anchor, Component });
    }
  };

  // Initial render: anchor is in DOM when onMount fires
  context.onMount(renderBranch);

  // Subsequent changes via signal
  subscribeSignal(context.owner, props.value, renderBranch);

  const anchorOwner = createOwner({ lightweight: true });
  anchorOwner.elements.add(anchor);
  return createHResult(anchorOwner, [anchor]);
}
