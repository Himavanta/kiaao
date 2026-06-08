// kiaao — Local effect registration and cleanup

import { LOCAL_EFFECTS } from "./types.ts";

/** 在节点上注册一个 effect stop，节点移除时自动清理 */
export function addLocalEffect(node: Node, stop: () => void): void {
  let stops = (node as any)[LOCAL_EFFECTS] as Set<() => void> | undefined;
  if (!stops) {
    stops = new Set();
    (node as any)[LOCAL_EFFECTS] = stops;
  }
  stops.add(stop);
}

/** 从节点上移除一个已注册的 stop，防止 LOCAL_EFFECTS 集合无限增长 */
export function removeLocalEffect(node: Node, stop: () => void): void {
  const stops = (node as any)[LOCAL_EFFECTS] as Set<() => void> | undefined;
  if (stops) {
    stops.delete(stop);
    if (stops.size === 0) {
      delete (node as any)[LOCAL_EFFECTS];
    }
  }
}
