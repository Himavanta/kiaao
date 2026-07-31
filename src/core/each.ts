// kiaao — Each: list rendering component
// Renders an ItemComponent for each item in the array.
// Supports keyed incremental updates and fallback for empty state.
// First render is synchronous (skipInsert), subsequent updates via signal.

import { getAdapter } from "../adapter/index.ts";
import type { ComponentFunction, Context } from "./component.ts";
import { adoptBranch, normalizeChildList, subscribeSignal } from "./flow-shared.ts";
import { disposeOwner } from "./owner.ts";
import { toValue } from "./signal.ts";
import { isArray, isEmpty, isNotNil } from "./type-guards.ts";
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
  context: Context;
}

// ── Internal Helpers ──────────────────────────────────

function renderEachEntry(options: {
  state: EachState;
  rawValue: any;
  identity: any;
  index: number;
  skipInsert: boolean;
}): HResult {
  const { state, rawValue, identity, index, skipInsert } = options;
  const bridge = state.context.use(rawValue);
  const item = state.context.use(bridge, () => bridge());
  state.itemSignalMap.set(identity, bridge);
  return adoptBranch({
    parentOwner: state.owner,
    anchor: state.anchor,
    Component: state.itemComponent,
    componentProps: { item, index },
    skipInsert,
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

/** 构建 diff 后的新条目列表 */
function buildDiffEntries(
  state: EachState,
  items: any[],
  keyFn: (item: any, i: number) => any,
): { newKeys: Set<any>; newEntries: Entry[] } {
  const newKeys = new Set<any>();
  const newEntries: Entry[] = [];
  let prevEntry: Entry | null = null;

  for (const [i, rawValue] of items.entries()) {
    const identity = keyFn(rawValue, i);
    newKeys.add(identity);

    const existingIdx = state.entries.findIndex((e) => e.key === identity);
    if (existingIdx !== -1) {
      const existing = state.entries[existingIdx];
      const sig = state.itemSignalMap.get(identity);
      if (isNotNil(sig)) sig(rawValue);
      repositionEntry(state.anchor, existing, prevEntry);
      newEntries.push(existing);
      prevEntry = existing;
      continue;
    }

    const result = renderEachEntry({ state, rawValue, identity, index: i, skipInsert: false });
    const entry: Entry = { key: identity, result };
    newEntries.push(entry);
    prevEntry = entry;
  }
  return { newKeys, newEntries };
}

/** dispose 已移除的条目 */
function disposeRemovedEntries(state: EachState, newKeys: Set<any>): void {
  for (const entry of state.entries) {
    if (!newKeys.has(entry.key)) {
      disposeOwner(entry.result.owner!);
      state.itemSignalMap.delete(entry.key);
    }
  }
}

function rebuildAllItems(state: EachState, items: any[]): void {
  for (const entry of state.entries) disposeOwner(entry.result.owner!);
  state.itemSignalMap.clear();
  state.entries.length = 0;
  for (const [i, rawValue] of items.entries()) {
    const result = renderEachEntry({ state, rawValue, identity: i, index: i, skipInsert: false });
    state.entries.push({ key: i, result });
  }
}

function repositionEntry(anchor: HostNode, entry: Entry, prevEntry: Entry | null): void {
  const existingNodes = [...entry.result.owner!.elements];
  if (isEmpty(existingNodes)) return;

  const [firstExisting] = existingNodes;
  const adapter = getAdapter();

  let needsMove = true;
  if (!prevEntry) {
    // 无前驱——应为第一条。检查第一个节点是否已在父容器开头。
    if (adapter.prev) {
      needsMove = isNotNil(adapter.prev(firstExisting));
    }
  } else {
    const prevNodes = [...prevEntry.result.owner!.elements];
    const lastPrevNode = prevNodes[prevNodes.length - 1];
    if (adapter.prev) {
      needsMove = adapter.prev(firstExisting) !== lastPrevNode;
    }
  }

  if (needsMove) {
    for (const n of [...existingNodes].reverse()) {
      adapter.before(anchor, n);
    }
  }
}

function diffEntries(state: EachState, items: any[], keyFn: (item: any, i: number) => any): void {
  const { newKeys, newEntries } = buildDiffEntries(state, items, keyFn);
  disposeRemovedEntries(state, newKeys);
  state.entries.length = 0;
  state.entries.push(...newEntries);
}

/** 首次渲染：构建条目或 fallback */
function syncInitial(
  state: EachState,
  items: any[],
  keyed: ((item: any, i: number) => any) | undefined,
): HResult | null {
  if (isEmpty(items)) {
    if (state.fallbackComponent) {
      return adoptBranch({
        parentOwner: state.owner,
        anchor: state.anchor,
        Component: state.fallbackComponent,
        skipInsert: true,
      });
    }
    return null;
  }
  for (const [i, rawValue] of items.entries()) {
    const identity = keyed ? keyed(rawValue, i) : i;
    const result = renderEachEntry({ state, rawValue, identity, index: i, skipInsert: true });
    state.entries.push({ key: identity, result });
  }
  return null;
}

/** 后续更新：完整 diff/rebuild 路径 */
function syncUpdate(
  state: EachState,
  items: any[],
  keyed: ((item: any, i: number) => any) | undefined,
  currentFallback: HResult | null,
): HResult | null {
  if (isEmpty(items)) {
    return clearAllEntries(state);
  }
  if (currentFallback) {
    disposeOwner(currentFallback.owner!);
  }
  if (keyed) {
    diffEntries(state, items, keyed);
  } else {
    rebuildAllItems(state, items);
  }
  return null;
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
  const adapter = getAdapter();
  const anchor = adapter.comment("each");
  context.owner.elements.add(anchor);

  const [itemComponent, fallbackComponent] = normalizeChildList(props.children);

  const state: EachState = {
    owner: context.owner,
    anchor,
    itemComponent: itemComponent!,
    fallbackComponent,
    entries: [],
    itemSignalMap: new Map(),
    context,
  };

  let fallbackResult: HResult | null = null;

  const sync = (isInitial: boolean) => {
    const items = isArray(toValue(props.value)) ? toValue(props.value) : [];
    if (isInitial) {
      fallbackResult = syncInitial(state, items, props.keyed);
      return;
    }
    fallbackResult = syncUpdate(state, items, props.keyed, fallbackResult);
  };

  // First render: synchronous
  sync(true);

  // Subsequent changes via signal
  subscribeSignal(context.owner, props.value, () => sync(false));

  const allNodes = fallbackResult
    ? (fallbackResult as HResult).nodes
    : state.entries.flatMap((e) => e.result.nodes);

  return createHResult({ owner: context.owner, nodes: [...allNodes, anchor] });
}
