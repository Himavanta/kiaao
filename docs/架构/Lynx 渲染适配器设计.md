# Kiaao Lynx 渲染适配器设计文档

**状态**：设计调研  
**版本**：1.0  
**日期**：2026-07-01

---

## 1. 参考：SolidJS Lynx 适配器源码

来自 `@lynx-js/solid` 包，位于 `examples/with-solidjs/packages/solid/src/index.ts`：

```ts
import type { MainThread } from "@lynx-js/types";
import type { Component, JSX as _JSX } from "solid-js";
import { createRenderer } from "solid-js/universal";
import type { JSX } from "../jsx-runtime";

declare module "@lynx-js/types" {
  export interface StandardProps {
    children?: JSX.Element;
  }

  interface Lynx {
    querySelector: (selector: string) => MainThread.Element | null;
    querySelectorAll: (selector: string) => MainThread.Element[];
  }
}

let page: FiberElement;
let pageId: number;
let code: () => FiberElement;

globalThis.renderPage = function () {
  page = __CreatePage("0", 0);
  pageId = __GetElementUniqueID(page);
  _render(code, page);
};

globalThis.updatePage = function () {};
globalThis.processData = function () {};
globalThis.runWorklet = function (value, params) {
  if (typeof value === "function") {
    value(...params);
  }
};

export const setRootComponent = (c: () => _JSX.Element) => {
  code = () => createComponent(c, {});
};

const eventRegExp = /^(bind|catch|capture-bind|capture-catch|global-bind)([A-Za-z]+)$/;
const eventTypeMap: Record<string, string> = {
  bind: "bindEvent",
  catch: "catchEvent",
  "capture-bind": "capture-bind",
  "capture-catch": "capture-catch",
  "global-bind": "global-bindEvent",
};

export const {
  render: _render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
} = createRenderer({
  createElement(tag) {
    return __CreateElement(tag, pageId!);
  },
  createTextNode(value) {
    return __CreateRawText(value);
  },
  replaceText(textNode, value) {
    __SetAttribute(textNode, "text", value);
    __FlushElementTree(textNode);
  },
  setProperty(node, name, value, _prev) {
    let hasMainThreadPrefix = false;
    if (name.startsWith("main-thread:")) {
      hasMainThreadPrefix = true;
      name = name.slice(12);
    }
    let match: RegExpMatchArray | null = null;
    if (name === "style") {
      __SetInlineStyles(node, value as string);
    } else if (name === "class" || name === "className") {
      __SetClasses(node, value as string);
    } else if (name === "id") {
      __SetID(node, value as string);
    } else if (name.startsWith("data-")) {
      __AddDataset(node, name.slice(5), value);
    } else if ((match = name.match(eventRegExp))) {
      const eventType = eventTypeMap[match[1]!]!;
      const eventName = match[2]!;
      if (hasMainThreadPrefix) {
        __AddEvent(node, eventType, eventName, {
          type: "worklet",
          value,
        });
      } else {
        lynx.reportError("Event binding is only supported with main-thread prefix");
      }
    } else {
      __SetAttribute(node, name, value);
    }
    __FlushElementTree(node);
  },
  insertNode(parent, node, anchor) {
    __InsertElementBefore(parent, node, anchor);
    __FlushElementTree(parent);
  },
  isTextNode(node) {
    return __GetTag(node) === "raw-text";
  },
  removeNode(parent, node) {
    __RemoveElement(parent, node);
    __FlushElementTree(parent);
  },
  getParentNode(node) {
    return __GetParent(node);
  },
  getFirstChild(node) {
    return __FirstElement(node);
  },
  getNextSibling(node) {
    return __NextElement(node);
  },
});

export { ErrorBoundary, For, Index, Match, Show, Suspense, SuspenseList, Switch } from "solid-js";
export * from "solid-js";
```

---

## 2. 参考：Lynx 能力 API

### 2.1 节点创建

| API                                               | 用途                                   | 来源         |
| ------------------------------------------------- | -------------------------------------- | ------------ |
| `__CreatePage(componentId, cssId)`                | 创建页面根节点                         | [types.d.ts] |
| `__CreateElement(tag, parentComponentUniqueId)`   | 创建指定标签元素（view/text/image 等） | [types.d.ts] |
| `__CreateWrapperElement(parentComponentUniqueId)` | 创建包装器元素（不可见容器）           | [types.d.ts] |
| `__CreateRawText(s)`                              | 创建纯文本节点                         | [types.d.ts] |

### 2.2 节点操作

| API                                          | 用途                   | 来源         |
| -------------------------------------------- | ---------------------- | ------------ |
| `__InsertElementBefore(parent, child, ref?)` | 在 ref 前插入 child    | [types.d.ts] |
| `__RemoveElement(parent, child)`             | 从 parent 移除 child   | [types.d.ts] |
| `__ReplaceElement(a, b)`                     | 替换节点               | [types.d.ts] |
| `__FlushElementTree(element?)`               | 刷新元素变更到 UI 线程 | [types.d.ts] |

### 2.3 属性/样式/事件

| API                                               | 用途              | 来源         |
| ------------------------------------------------- | ----------------- | ------------ |
| `__SetAttribute(e, key, value)`                   | 设置属性          | [types.d.ts] |
| `__SetClasses(e, c)`                              | 设置 class        | [types.d.ts] |
| `__SetInlineStyles(e, style)`                     | 设置 inline style | [types.d.ts] |
| `__SetID(e, id)`                                  | 设置 id           | [types.d.ts] |
| `__AddDataset(e, key, value)`                     | 设置 data-\* 属性 | [types.d.ts] |
| `__AddEvent(e, eventType, eventName, eventValue)` | 绑定事件          | [types.d.ts] |

### 2.4 节点遍历

| API                      | 用途               | 来源         |
| ------------------------ | ------------------ | ------------ |
| `__GetParent(node)`      | 获取父节点         | [types.d.ts] |
| `__FirstElement(parent)` | 获取第一个子节点   | [types.d.ts] |
| `__LastElement(parent)`  | 获取最后一个子节点 | [types.d.ts] |
| `__NextElement(node)`    | 获取下一个兄弟节点 | [types.d.ts] |
| `__GetTag(node)`         | 获取节点标签名     | [types.d.ts] |

### 2.5 内置元素

| 标签            | 用途                        | 文档                                                                      |
| --------------- | --------------------------- | ------------------------------------------------------------------------- |
| `<view>`        | 通用容器，类似 HTML `<div>` | [view.md](https://lynxjs.org/api/elements/built-in/view.md)               |
| `<text>`        | 文本容器                    | [text.md](https://lynxjs.org/api/elements/built-in/text.md)               |
| `<image>`       | 图片                        | [image.md](https://lynxjs.org/api/elements/built-in/image.md)             |
| `<scroll-view>` | 可滚动容器                  | [scroll-view.md](https://lynxjs.org/api/elements/built-in/scroll-view.md) |
| `<list>`        | 高性能虚拟列表              | [list.md](https://lynxjs.org/api/elements/built-in/list.md)               |
| `<page>`        | 页面根节点                  | [page.md](https://lynxjs.org/api/elements/built-in/page.md)               |
| `<input>`       | 输入框                      | [input.md](https://lynxjs.org/api/elements/built-in/input.md)             |

---

## 3. 关键设计决策

### 3.1 Comment 替代方案

**结论**：`__CreateWrapperElement` 在 SDK 1.4.0 不可用（`ReferenceError`），改用 `__CreateElement("view", pageId)` + 零尺寸样式。

```ts
comment(text: string): HostNode {
  const w = __CreateElement("view", pageId());
  __SetInlineStyles(w, "width:0;height:0;opacity:0;pointer-events:none");
  return w;
}
```

已验证在 1.4.0 和 3.9.0 上可用。

### 3.2 `remove` 需要 parent

**问题**：DOM 的 `removeChild` 只需传入 child 节点，Lynx 的 `__RemoveElement` 需要 parent。

**方案**：维护 `parentMap: WeakMap<HostNode, HostNode>`，在每次 `append`/`before` 时记录父子关系。

```ts
const parentMap = new WeakMap<HostNode, HostNode>();

append(parent, child) { parentMap.set(child, parent); ... }
before(ref, child)  { parentMap.set(child, parentMap.get(ref)); ... }
remove(node) {
  const parent = parentMap.get(node);
  if (parent) __RemoveElement(parent, node);
}
```

### 3.3 `prev` 实现

**问题**：Lynx 有 `__NextElement` 但没有 `__PrevElement`。

**方案**：通过 parent → firstChild → nextSibling 链式遍历实现：

```ts
prev(node: HostNode): HostNode | null {
  const parent = __GetParent(node);
  if (!parent) return null;
  let child = __FirstElement(parent);
  while (child && __NextElement(child) !== node) child = __NextElement(child);
  return child; // 可能为 null（node 是第一个子节点）
}
```

见 [`docs/架构/Each 位置判断：\`prev\` 可选方法方案.md`](../架构/Each%20位置判断：%60prevSibling%60%20替代方案.md)

### 3.4 事件前缀

**结论**：kiaao 使用 Lynx 原生事件前缀（`bindtap`/`catchtap` 等），adapter 的 `tryBindEvent` 通过正则匹配自动包装为 worklet。**不需要** `main-thread:` 前缀。

```tsx
<view bindtap={onTap}>...</view> // ✅ 正确
```

### 3.5 `__FlushElementTree` 管理

**结论**：主线程模式下，`__FlushElementTree` 需要在每次修改后调用。但**这不是闪退的根因**——即使只在最后 flush 一次仍然崩溃。

真正的解决方案是避 destroy+create（用 `display:none` 切换），或者采用后台线程架构（类似 vue-lynx）。

新 SDK 支持 `__FlushElementTree(element, options)` 的 `FlushOptions` 参数，其中 `pipelineOptions` 可能提供操作分组能力，待验证。

### 3.6 Each 与 Lynx `<list>` 的关系

**待决定**：kiaao 的 Each（基于 diff 的通用列表渲染）与 Lynx 原生 `<list>`（高性能虚拟列表）的策略选择。

- Each 适合通用场景，但 diff 开销在原生列表中可能不必要
- `<list>` 性能更好，但需要适配 kiaao 的控制流模型

初步方案：先实现通用的 Each（用 `view` 容器模拟），后续再考虑 `<list>` 映射。

---

## 4. 参考资料

- [Lynx LLM 文档入口](https://lynxjs.org/llms.txt) — 本文档主要信息来源
- [Lynx 元素与组件](https://lynxjs.org/guide/ui/elements-components.md) — 内置元素列表
- [`<view>` 元素 API](https://lynxjs.org/api/elements/built-in/view.md) — 容器元素的完整 API
- [`<page>` 元素 API](https://lynxjs.org/api/elements/built-in/page.md) — 页面根节点
- [Lynx 事件传播](https://lynxjs.org/guide/interaction/event-handling/event-propagation.md) — 事件命名规则
- [Lynx 直接操作节点](https://lynxjs.org/guide/interaction/event-handling/manipulating-element.react.md) — 节点操作方法
- [SolidJS Universal Renderer](https://www.solidjs.com/docs/latest/api#createrenderer) — SolidJS 跨端渲染器 API
- [各平台类型定义 `@lynx-js/types`](https://lynxjs.org/api/lynx-api/lynx-types.md) — TypeScript 类型

---

## 5. 当前状态

### 已解决

1. ✅ Comment 替代方案 — `__CreateElement("view")` 替代 `__CreateWrapperElement`
2. ✅ 事件前缀 — `bindtap` 直接使用，无需 `main-thread:` 前缀或 `on`→`bind` 映射
3. ✅ `pageId` 获取 — `__CreatePage` 后通过 `__GetElementUniqueID` 保存
4. ✅ `__ReplaceElement` 参数顺序 — `(newElement, oldElement)`，非 `(oldElement, newElement)`
5. ✅ API 可用性 — `__CreateImage`、`__CreateView`、`__CreateText`、`__AppendElement`、`__SetCSSId` 均在 3.9.0 上确认可用

### 未解决

1. 🔴 **元素 destroy+create 闪退** — SDK 3.9.0 仍存在。详见 `docs/lynx/元素 destroy-create 闪退问题.md`
2. 🟡 **后台线程 vs 主线程架构** — 当前为主线程模式，vue-lynx 的后台线程模式能避免闪退，是否值得迁移？
3. 🟡 **`display:none` 方案落地** — 为 Lynx 平台写专用 Show 组件，用 display:none 切换替代 dispose+insert
4. 🟢 **`FlushOptions.pipelineOptions` 可行性** — 新 SDK 的 pipeline 机制是否能实现操作原子化？
5. 🟢 **Each 与 Lynx `<list>` 的集成** — 后续考虑
