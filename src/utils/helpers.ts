// kiaao — Shared helper utilities

import { isSingle } from "./type-guards.ts";

/** 单元素数组展开：`[el]` → `el`，多元素保持数组 */
export const normalizeChildren = <T>(children: T[]): T | T[] =>
  isSingle(children) ? children[0] : children;
