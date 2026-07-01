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

**问题**：Lynx 没有 HTML comment 节点，但 kiaao 的 Show/Case/Each 依赖 `adapter.comment()` 创建锚点。

**方案**：使用 `__CreateWrapperElement(pageId)` 创建不可见的包装器元素作为 anchor。

```ts
comment(text: string): HostNode {
  // Lynx 无 comment 节点，用零尺寸 wrapper 替代
  const el = __CreateWrapperElement(pageId);
  // 设零尺寸使其不影响布局（需验证）
  __SetInlineStyles(el, "width: 0; height: 0; opacity: 0;");
  return el;
}
```

**不确定点**：

- `__CreateWrapperElement` 创建的元素是否真正零尺寸/透明？
- 多个 wrapper 元素是否影响布局性能？
- 是否需要特殊属性来确保它不参与布局？

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

### 3.4 事件名前缀映射

**问题**：Lynx 使用 `bind`/`catch` 前缀，kiaao 使用 `on` 前缀。

**方案**：在 `setProp` 中做映射：

| kiaao 事件          | Lynx 事件属性      | Lynx 事件类型 |
| ------------------- | ------------------ | ------------- |
| `onClick` / `onTap` | `bindtap`          | `bindEvent`   |
| `onInput`           | `bindinput`        | `bindEvent`   |
| `onFocus`           | `bindfocus`        | `bindEvent`   |
| `onBlur`            | `bindblur`         | `bindEvent`   |
| `onTouchStart`      | `bindtouchstart`   | `bindEvent`   |
| `onTouchMove`       | `bindtouchmove`    | `bindEvent`   |
| `onTouchEnd`        | `bindtouchend`     | `bindEvent`   |
| `onScroll`          | `bindscroll`       | `bindEvent`   |
| `onLayoutChange`    | `bindlayoutchange` | `bindEvent`   |

```ts
const EVENT_MAP: Record<string, string> = {
  onClick: "bindtap",
  onTap: "bindtap",
  onInput: "bindinput",
  onFocus: "bindfocus",
  onBlur: "bindblur",
  onTouchStart: "bindtouchstart",
  onTouchMove: "bindtouchmove",
  onTouchEnd: "bindtouchend",
  onChange: "bindchange",
  onSubmit: "bindsubmit",
  onScroll: "bindscroll",
  onLayoutChange: "bindlayoutchange",
};
```

### 3.5 `__FlushElementTree` 管理

**问题**：Lynx 每次修改节点后需要调用 `__FlushElementTree` 才能反映到 UI。

**方案**：直接在每个 adapter 操作后立即 flush（简单期），后续可优化为 batch。

```ts
setProp(el, key, value, cleanups) {
  // ... 处理属性/事件 ...
  __FlushElementTree(el);
}
```

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

## 5. 未解决问题（待讨论）

1. **`__CreateWrapperElement` 的行为验证** — 是否真正零尺寸、透明、不参与布局？需要在 Lynx 环境中实验。
2. **`pageId` 的获取** — 当前 SolidJS 适配器在 `renderPage` 时获取 pageId，kiaao 的启动流程是否需要类似机制？
3. **双线程模型的影响** — Lynx 有主线程和后台线程之分。kiaao 的响应式系统在哪个线程运行？
4. **`__FlushElementTree` 的粒度和性能** — 每次操作都 flush 是否可接受？是否需要批处理优化？
5. **`list` 元素的集成策略** — Each 的 diff 逻辑 vs Lynx 原生的高性能列表？
6. **`__ReplaceElement` 的语义** — 是否只支持单节点替换？与 kiaao 的 `replace` 方法语义是否一致？
