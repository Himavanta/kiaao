// kiaao — Each: list rendering component
// Renders an ItemComponent for each item in the array.
// Supports keyed incremental updates and fallback for empty state.

import { getAdapter } from "../adapter/index.ts";
import type { ComponentFunction, Context } from "./component.ts";
import { adoptBranch, initAnchor, normalizeChildList, subscribeSignal } from "./flow-shared.ts";
import { createOwner, disposeOwner } from "./owner.ts";
import { definitionMode, toValue } from "./signal.ts";
import { isArray, isEmpty, isNil, isNotEmpty, isNotNil } from "./type-guards.ts";
import type {
  ControlFlowChildren,
  HostNode,
  HResult,
  MaybeSignal,
  Owner,
  Signal,
} from "./types.ts";
import { createHResult } from "./types.ts";

// ── Types ─────────────────────────────────────────────

interface Entry {
  key: any;
  result: HResult;
}

interface EachState {
  owner: Owner;
  anchor: HostNode;
  itemComponent: ComponentFunction;
  fallbackComponent: ComponentFunction | undefined;
  entries: Entry[];
  itemSignalMap: Map<any, Signal<any>>;
}

// ── Internal Helpers (module-level, ≤50 lines each) ────

function renderEachEntry(state: EachState, rawValue: any, identity: any, index: number): HResult {
  const itemSignal = definitionMode(rawValue);
  state.itemSignalMap.set(identity, itemSignal);
  return adoptBranch({
    parentOwner: state.owner,
    anchor: state.anchor,
    Component: state.itemComponent,
    componentProps: { item: itemSignal, index },
  });
}

function clearAllEntries(state: EachState): HResult | null {
  for (const entry of state.entries) {
    disposeOwner(entry.result.owner!);
    state.itemSignalMap.delete(entry.key);
  }
  state.entries.length = 0;
  if (isNotNil(state.fallbackComponent)) {
    return adoptBranch({
      parentOwner: state.owner,
      anchor: state.anchor,
      Component: state.fallbackComponent,
    });
  }
  return null;
}

function rebuildAllItems(state: EachState, items: any[]): void {
  for (const entry of state.entries) disposeOwner(entry.result.owner!);
  state.itemSignalMap.clear();
  state.entries.length = 0;
  for (const [i, rawValue] of items.entries()) {
    const result = renderEachEntry(state, rawValue, i, i);
    state.entries.push({ key: i, result });
  }
}

function repositionEntry(anchor: HostNode, entry: Entry, prevNode: any): any {
  const existingNodes = [...entry.result.owner!.elements];
  if (isEmpty(existingNodes)) return prevNode;

  const needsMove = isNotNil(prevNode) && getAdapter().prevSibling(existingNodes[0]) !== prevNode;
  if (needsMove) {
    for (const n of [...existingNodes].reverse()) {
      getAdapter().before(anchor, n);
    }
  }
  return existingNodes[existingNodes.length - 1];
}

function diffEntries(state: EachState, items: any[], keyFn: (item: any, i: number) => any): void {
  const newKeys = new Set<any>();
  const newEntries: Entry[] = [];
  let prevNode: any = null;

  for (const [i, rawValue] of items.entries()) {
    const identity = keyFn(rawValue, i);
    newKeys.add(identity);

    const existingIdx = state.entries.findIndex((e) => e.key === identity);
    if (existingIdx !== -1) {
      const existing = state.entries[existingIdx];
      const sig = state.itemSignalMap.get(identity);
      if (isNotNil(sig)) sig(rawValue);
      prevNode = repositionEntry(state.anchor, existing, prevNode);
      newEntries.push(existing);
      continue;
    }

    // New item
    const result = renderEachEntry(state, rawValue, identity, i);
    newEntries.push({ key: identity, result });
    const itemNodes = result.nodes;
    if (isNotEmpty(itemNodes)) {
      prevNode = itemNodes[itemNodes.length - 1];
    }
  }

  // Dispose removed entries
  for (const entry of state.entries) {
    if (!newKeys.has(entry.key)) {
      disposeOwner(entry.result.owner!);
      state.itemSignalMap.delete(entry.key);
    }
  }

  // Swap entry list
  state.entries.length = 0;
  state.entries.push(...newEntries);
}

// ── Each ──────────────────────────────────────────────

export function Each<T = any>(
  props: {
    value: MaybeSignal<T[]>;
    keyed?: (item: T, index: number) => any;
    children: ControlFlowChildren<
      ComponentFunction<{ item: Signal<T>; index: number }>,
      ComponentFunction
    >;
  },
  context: Context,
): HResult {
  const anchor = initAnchor(context.owner, "each");
  const [itemComponent, fallbackComponent] = normalizeChildList(props.children);

  const state: EachState = {
    owner: context.owner,
    anchor,
    itemComponent: itemComponent!,
    fallbackComponent,
    entries: [],
    itemSignalMap: new Map(),
  };

  let fallbackResult: HResult | null = null;

  const sync = () => {
    const items = isArray(toValue(props.value)) ? toValue(props.value) : [];

    if (isEmpty(items)) {
      fallbackResult = clearAllEntries(state);
      return;
    }

    if (isNotNil(fallbackResult)) {
      disposeOwner(fallbackResult.owner!);
      fallbackResult = null;
    }

    if (isNil(props.keyed)) {
      rebuildAllItems(state, items);
      return;
    }

    diffEntries(state, items, props.keyed);
  };

  context.onMount(sync);
  subscribeSignal(context.owner, props.value, sync);
  const anchorOwner = createOwner({ lightweight: true });
  anchorOwner.elements.add(anchor);
  return createHResult(anchorOwner, [anchor], [], []);
}
