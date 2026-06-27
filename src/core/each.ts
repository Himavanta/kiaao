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
    return adoptBranch(context.owner, anchor, itemComponent!, {
      item: itemSignal,
      index,
    });
  };

  // Core sync function: full rebuild or diff-based update
  const sync = () => {
    const source = toValue(props.value);
    const items = isArray(source) ? source : [];
    const keyFn = props.keyed;
    const newEntries: Entry[] = [];

    // ── Empty + fallback case ──
    if (isEmpty(items)) {
      for (const entry of entries) {
        disposeOwner(entry.result.owner!);
        itemSignalMap.delete(entry.key);
      }
      entries.length = 0;

      if (isNotNil(fallbackComponent)) {
        fallbackResult = adoptBranch(context.owner, anchor, fallbackComponent!);
      }
      return;
    }

    // ── Non-empty: ensure fallback is cleaned ──
    if (isNotNil(fallbackResult)) {
      disposeOwner(fallbackResult.owner!);
      fallbackResult = null;
    }

    // ── Without keyed: full rebuild ──
    if (isNil(keyFn)) {
      for (const entry of entries) disposeOwner(entry.result.owner!);
      itemSignalMap.clear();
      entries.length = 0;

      for (const [i, rawValue] of items.entries()) {
        const result = renderEntry(rawValue, i, i);
        newEntries.push({ key: i, result });
      }
      entries.push(...newEntries);
      return;
    }

    // ── With keyed: diff ──
    const newKeys = new Set<any>();
    let prevNode: any = null;

    for (const [i, rawValue] of items.entries()) {
      const identity = keyFn(rawValue, i);
      newKeys.add(identity);

      const existingIdx = entries.findIndex((e) => e.key === identity);
      if (existingIdx !== -1) {
        // Retained entry
        const existing = entries[existingIdx];
        const sig = itemSignalMap.get(identity);
        if (isNotNil(sig)) sig(rawValue);

        // Reposition if needed
        const existingNodes = [...existing.result.owner!.elements];
        if (isNotEmpty(existingNodes)) {
          const needsMove =
            isNotNil(prevNode) && getAdapter().getPreviousSibling(existingNodes[0]) !== prevNode;
          if (needsMove) {
            for (const n of [...existingNodes].reverse()) {
              getAdapter().before(anchor, n);
            }
          }
          prevNode = existingNodes[existingNodes.length - 1];
        }
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

    // Update entries
    entries.length = 0;
    entries.push(...newEntries);
  };

  // Initial render: anchor is in DOM when onMount fires
  context.onMount(sync);

  // Subsequent changes via signal
  subscribeSignal(context.owner, props.value, sync);

  return [anchor];
}
