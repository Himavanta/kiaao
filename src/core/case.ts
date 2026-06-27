// kiaao — Case: multi-branch conditional rendering component
// Replaces the old `when` mapping-mode directive.
// Selects a branch component from a mapping table based on `value`.

import { getAdapter } from "../adapter/index.ts";
import type { ComponentFunction, Context } from "./component.ts";
import { h } from "./h.ts";
import { disposeOwner } from "./owner.ts";
import { use, isUse, toValue } from "./signal.ts";
import { isNotNil, isString } from "./type-guards.ts";
import { getSignalState, type HostNode, type HResult } from "./types.ts";

// ── Case ──────────────────────────────────────────────

export function Case(
  props: {
    value: any;
    children: [Record<string, ComponentFunction>, ComponentFunction?];
  },
  context: Context,
): HostNode[] {
  const adapter = getAdapter();
  const anchor = adapter.createComment("case");
  context.owner.elements.add(anchor);

  let result: HResult | null = null;
  let prevKey: unknown = undefined;

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

  // Resolve the component to render from value + mapping table
  const resolveComponent = (rawValue: unknown): ComponentFunction | undefined => {
    const key = isString(rawValue) ? rawValue : String(rawValue);
    return props.children[0][key] ?? props.children[1];
  };

  // Initial render
  const initialComponent = resolveComponent(toValue(props.value));
  if (isNotNil(initialComponent)) {
    result = branch(initialComponent);
    prevKey = toValue(props.value);
  }

  // Subscribe to signal changes
  if (isUse(props.value)) {
    const derived = use(props.value, () => {
      const newValue = toValue(props.value);
      if (newValue === prevKey) return; // 同 key 复用，不触发更新
      prevKey = newValue;

      if (isNotNil(result)) {
        disposeOwner(result.owner!);
        result = null;
      }

      const Component = resolveComponent(newValue);
      if (isNotNil(Component)) {
        result = branch(Component);
      }
    });
    const state = getSignalState(derived);
    if (state?.stop) context.owner.cleanups.push(state.stop);
  }

  return [anchor];
}
