// kiaao — Each: list rendering component
// Renders an ItemComponent for each item in the array.
// Supports keyed incremental updates and fallback for empty state.

import { getAdapter } from "../adapter/index.ts";
import type { ComponentFunction, Context } from "./component.ts";
import { initAnchor, adoptBranch, normalizeChildList, subscribeSignal } from "./flow-shared.ts";
import { disposeOwner } from "./owner.ts";
import { toValue, definitionMode } from "./signal.ts";
import { isArray, isNotEmpty, isEmpty, isNil, isNotNil } from "./type-guards.ts";
import type { HostNode, HResult, Signal } from "./types.ts";

// ── Types ─────────────────────────────────────────────

interface Entry {
  key: any;
  result: HResult;
}

// ── Each ──────────────────────────────────────────────

export function Each(
  props: {
    value: any[];
    keyed?: (item: any, index: number) => any;
    children: [ComponentFunction<{ item: () => any; index: number }>, ComponentFunction?];
  },
  context: Context,
): HostNode[] {
  const anchor = initAnchor(context.owner, "each");
  const childList = normalizeChildList(props.children);
  const [itemComponent, fallbackComponent] = childList;

  const entries: Entry[] = [];
  const itemSignalMap = new Map<any, Signal<any>>();
  let fallbackResult: HResult | null = null;

  // Helper: render a single item entry
  const renderEntry = (rawValue: any, identity: any, index: number): HResult => {
    const itemSignal = definitionMode(rawValue);
    itemSignalMap.set(identity, itemSignal);
    return adoptBranch({
      parentOwner: context.owner,
      anchor,
      Component: itemComponent!,
      componentProps: { item: itemSignal, index },
    });
  };

  // Helper: clear all entries and optionally render fallback
  const clearAllEntries = () => {
    for (const entry of entries) {
      disposeOwner(entry.result.owner!);
      itemSignalMap.delete(entry.key);
    }
    entries.length = 0;
    if (isNotNil(fallbackComponent)) {
      fallbackResult = adoptBranch({
        parentOwner: context.owner,
        anchor,
        Component: fallbackComponent!,
      });
    }
  };

  // Helper: full rebuild without keyed (dispose all, recreate all)
  const rebuildAll = (items: any[]) => {
    for (const entry of entries) disposeOwner(entry.result.owner!);
    itemSignalMap.clear();
    entries.length = 0;
    for (const [i, rawValue] of items.entries()) {
      const result = renderEntry(rawValue, i, i);
      entries.push({ key: i, result });
    }
  };

  // Helper: diff-based update with keyed
  const diffEntries = (items: any[], keyFn: (item: any, i: number) => any) => {
    const newKeys = new Set<any>();
    const newEntries: Entry[] = [];
    let prevNode: any = null;

    for (const [i, rawValue] of items.entries()) {
      const identity = keyFn(rawValue, i);
      newKeys.add(identity);

      const existingIdx = entries.findIndex((e) => e.key === identity);
      if (existingIdx !== -1) {
        // Retained entry: update signal + reposition
        const existing = entries[existingIdx];
        const sig = itemSignalMap.get(identity);
        if (isNotNil(sig)) sig(rawValue);
        prevNode = repositionEntry(existing, prevNode);
        newEntries.push(existing);
        continue;
      }

      // New item
      const result = renderEntry(rawValue, identity, i);
      newEntries.push({ key: identity, result });
      const itemNodes = result.nodes;
      if (isNotEmpty(itemNodes)) {
        prevNode = itemNodes[itemNodes.length - 1];
      }
    }

    // Dispose removed entries
    for (const entry of entries) {
      if (!newKeys.has(entry.key)) {
        disposeOwner(entry.result.owner!);
        itemSignalMap.delete(entry.key);
      }
    }

    // Swap entry list
    entries.length = 0;
    entries.push(...newEntries);
  };

  // Helper: reposition an entry's nodes before the anchor if out of order
  const repositionEntry = (entry: Entry, prevNode: any): any => {
    const existingNodes = [...entry.result.owner!.elements];
    if (isEmpty(existingNodes)) return prevNode;

    const needsMove =
      isNotNil(prevNode) && getAdapter().getPreviousSibling(existingNodes[0]) !== prevNode;
    if (needsMove) {
      for (const n of [...existingNodes].reverse()) {
        getAdapter().before(anchor, n);
      }
    }
    return existingNodes[existingNodes.length - 1];
  };

  // Core sync function: full rebuild or diff-based update
  const sync = () => {
    const source = toValue(props.value);
    const items = isArray(source) ? source : [];

    // ── Empty + fallback case ──
    if (isEmpty(items)) {
      clearAllEntries();
      return;
    }

    // ── Non-empty: ensure fallback is cleaned ──
    if (isNotNil(fallbackResult)) {
      disposeOwner(fallbackResult.owner!);
      fallbackResult = null;
    }

    // ── Without keyed: full rebuild ──
    if (isNil(props.keyed)) {
      rebuildAll(items);
      return;
    }

    // ── With keyed: diff ──
    diffEntries(items, props.keyed);
  };

  // Initial render: anchor is in DOM when onMount fires
  context.onMount(sync);

  // Subsequent changes via signal
  subscribeSignal(context.owner, props.value, sync);

  return [anchor];
}
