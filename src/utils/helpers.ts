// kiaao — Shared helper utilities

/** 单元素数组展开：`[el]` → `el`，多元素保持数组 */
export const normalizeChildren = <T>(children: T[]): T | T[] =>
  children.length === 1 ? children[0] : children;
