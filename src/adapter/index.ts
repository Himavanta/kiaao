// kiaao — Global adapter management
// Platform-agnostic. No DOM dependencies.
// Provides setAdapter/getAdapter for RenderAdapter registration,
// setRenderMode/getRenderMode for platform mode (dom/ssr/hydrate).

import type { RenderAdapter } from "../core/index.ts";
import { isNil } from "../core/index.ts";

/** 空格分隔字符串 → Set，用于元素/属性查找表 */
export const splitSet = (str: string): Set<string> => new Set(str.trim().split(/\s+/));

// ── RenderAdapter ─────────────────────────────────────

let _adapter: RenderAdapter | null = null;

export function setAdapter(adapter: RenderAdapter): void {
  _adapter = adapter;
}

export function getAdapter(): RenderAdapter {
  if (!_adapter) {
    throw new Error(
      "[kiaao] No RenderAdapter registered. " +
        "Import from 'kiaao' (auto-registers browser adapter) or call setAdapter() before use.",
    );
  }
  return _adapter;
}

/** 内部使用的 element 移除函数，无 adapter 或节点为空时静默跳过 */
export function removeNode(node: unknown): void {
  if (isNil(node)) return;
  _adapter?.remove(node);
}

// ── RenderMode ────────────────────────────────────────

export type RenderMode = "dom" | "ssr" | "hydrate";

let currentRenderMode: RenderMode = "dom";

export const setRenderMode = (mode: RenderMode): void => {
  currentRenderMode = mode;
};

export const getRenderMode = (): RenderMode => currentRenderMode;
