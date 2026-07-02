// kiaao — Lynx RenderAdapter 实现
// 使用: import { lynxAdapter } from "kiaao/lynx"

import type { CleanupFn, HostNode, RenderAdapter } from "../core/index.ts";
import { tryBindEvent } from "./events.ts";
import "./types.ts";

// ── Page ID ──────────────────────────────────────────

let _pageId: number | undefined;

function pageId(): number {
  // 主线程 renderPage 已创建页面，后台线程直接用 pageId=1
  return _pageId ?? 1;
}

export function initLynxPage(page?: FiberElement): number {
  if (page) {
    _pageId = __GetElementUniqueID(page);
  }
  return _pageId ?? 1;
}

// ── 类型转换 ─────────────────────────────────────────

const asF = (el: HostNode): FiberElement => el as unknown as FiberElement;

// ── Lynx Adapter ─────────────────────────────────────

export const lynxAdapter: RenderAdapter = {
  el(tag: string): HostNode {
    return __CreateElement(tag, pageId());
  },

  text(text: string): HostNode {
    return __CreateRawText(text);
  },

  comment(): HostNode {
    const w = __CreateWrapperElement(pageId());
    __SetInlineStyles(w, "width:0;height:0;opacity:0;pointer-events:none");
    return w;
  },

  before(ref: HostNode, child: HostNode): void {
    const p = __GetParent(asF(ref));
    if (!p) return;
    __InsertElementBefore(p, asF(child), asF(ref));
    __FlushElementTree(p);
  },

  append(parent: HostNode, child: HostNode): void {
    __InsertElementBefore(asF(parent), asF(child), null as any);
    __FlushElementTree(asF(parent));
  },

  remove(node: HostNode): void {
    const p = __GetParent(asF(node));
    if (!p) return;
    __RemoveElement(p, asF(node));
    __FlushElementTree(p);
  },

  clear(parent: HostNode): void {
    const p = asF(parent);
    let c = __FirstElement(p);
    while (c) {
      const n = __NextElement(c);
      __RemoveElement(p, c);
      c = n;
    }
    __FlushElementTree(p);
  },

  setText(node: HostNode, value: string): void {
    __SetAttribute(asF(node), "text", value);
    __FlushElementTree(asF(node));
  },

  replace(oldNode: HostNode, ...newNodes: HostNode[]): void {
    const p = __GetParent(asF(oldNode));
    if (!p) return;
    for (const n of newNodes) {
      __InsertElementBefore(p, asF(n), asF(oldNode));
    }
    __FlushElementTree(p);
    __RemoveElement(p, asF(oldNode));
    __FlushElementTree(p);
  },

  setProp(el: HostNode, key: string, value: unknown, _cleanups?: CleanupFn[]): void {
    const node = asF(el);
    let k = key;
    if (k === "style") {
      if (typeof value === "string") __SetInlineStyles(node, value);
    } else if (k === "class" || k === "className") {
      if (typeof value === "string") __SetClasses(node, value);
    } else if (k === "id") {
      __SetID(node, value as string);
    } else if (k.startsWith("data-")) {
      __AddDataset(node, k.slice(5), value);
    } else if (!tryBindEvent(node, k, value)) {
      __SetAttribute(node, k, value);
    }
    __FlushElementTree(node);
  },

  isNode(value: unknown): value is HostNode {
    return (
      value !== null &&
      value !== undefined &&
      typeof value === "object" &&
      "$$typeof" in (value as any)
    );
  },

  isElement(value: unknown): value is HostNode {
    return this.isNode(value);
  },
};
