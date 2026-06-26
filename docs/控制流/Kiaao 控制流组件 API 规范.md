# Kiaao 控制流组件 API 规范

**状态**：草案
**关联**：[控制流组件设计原则](./控制流组件设计原则.md)
**日期**：2026年6月26日
**版本**：1.4

> **类型说明**：本文档中的 `HostNode` 是平台无关的宿主节点类型（在浏览器环境下为 DOM `Node`，在 SSR 环境下为 `SSRNode`，在其它平台下为对应渲染元素类型）。`HostElement` 特指宿主元素类型（浏览器中为 `Element`）。

## 一、概述

Kiaao 提供三个控制流组件：`Show`、`Case`、`Each`。它们替代了原有的 `when`/`each` 属性指令，统一通过 Owner 树管理生命周期。当前 `when`/`each` 属性指令在 `handleDomMode` 中实现，组件形式将在后续版本中逐步迁移。属性指令可保留作为兼容层，内部委托给对应的组件实现。

三个组件的共同约定：

- **`fallback` 统一位置**：所有 fallback 都放在 children 的最后一个函数位置，且均为可选。
- **惰性渲染**：所有分支内容均为函数形式，保证内容在需要时才被创建。
- **注释占位符**：仅当组件没有渲染任何内容时（如条件为 false 且无 fallback，或列表为空且无 fallback），才返回注释占位符以保留 DOM 位置。占位符的所有权归属到对应的分支 Owner 或 Each 自身 Owner 的 `elements` 中。有内容时，活跃分支 Owner 的 `elements` 中的节点本身就是锚点。
- **`keyed` 属性**：`Each` 使用 `keyed` prop 作为身份标识函数，避免与 JSX 编译器的 `key` 属性冲突。
- **分支独立 Owner**：Show 和 Case 为每个活跃分支创建独立的 Owner，Each 为每个条目创建独立的 Owner。这与 `handleComponent` 为每个组件函数创建 Owner 的模式一致——**一个逻辑作用域，一个 Owner**。切换分支或移除条目时，只需 `disposeOwner` 销毁旧 Owner，无需手动清理 `elements` 或 `cleanups`。
- **`context.owner`**：组件通过 `context.owner` 访问自己的 Owner 引用。控制流组件使用它来管理子 Owner 的挂载和卸载。
- **`adoptHResult`**：公开的所有权管理函数，封装了将 `HResult` 中的子 Owner 挂载到目标 Owner 下、合并 `cleanups`、将节点加入目标 Owner 的 `elements` 的逻辑。返回节点数组供调用方进行 DOM 操作。

## 二、`Show` — 条件显隐

### 2.1 用途

根据 `value` 的 truthiness 决定渲染主内容还是 fallback。

### 2.2 导入

```ts
import { Show } from "kiaao";
```

### 2.3 签名

```ts
function Show(props: {
  value: any;
  children: [() => HostNode[] | HostNode, (() => HostNode[] | HostNode)?];
}): HostNode[];
```

### 2.4 属性

- **`value`**：任意值。truthy 时渲染主内容，falsy 时渲染 fallback。通常传入一个布尔信号。
- **`children`**：长度为 1 或 2 的元组。第一个元素是主内容函数（`value` 为 truthy 时调用），第二个元素是 fallback 函数（可选，`value` 为 falsy 时调用）。两个函数均为惰性求值——仅在需要时被调用。如果未提供 fallback，条件为 false 时返回一个注释占位符以保留 DOM 位置。

### 2.5 返回值

返回当前渲染的节点数组。条件为 true 时返回主内容函数的调用结果，条件为 false 且提供了 fallback 时返回 fallback 函数的调用结果，否则返回注释占位符。

### 2.6 行为

- **初始渲染**：根据 `value` 的初始值决定调用哪个函数，创建对应的分支 Owner，通过 `adoptHResult` 将渲染结果的所有权归属到分支 Owner 下。如果为 falsy 且没有提供 fallback，返回注释占位符（归属到分支 Owner 的 `elements`）。
- **条件切换**：当 `value` 变化时，Show 通过 `use(value, () => ...)` 订阅信号。回调中：
  1. 调用 `disposeOwner(activeBranchOwner)` 销毁旧分支 Owner，自动清理该分支内的所有子 Owner、`elements`、`cleanups` 和 DOM 节点。
  2. 调用 `createOwner()` 创建新的分支 Owner。
  3. 调用对应的 children 函数（主内容或 fallback），得到新的 `HResult`。
  4. 调用 `adoptHResult(branchOwner, newHResult)` 将新内容的所有权归属到分支 Owner 下。
  5. 将分支 Owner 挂载到 Show 的 Owner 的 `children` 下。
  6. 通过 adapter 移除旧 DOM、插入新 DOM。
  7. 更新 `activeBranchOwner` 引用。
- **内部机制**：Show 自身作为一个普通组件，由 `h()` 在组件模式下处理——Owner 自动创建，`onMount`/`onUnmount` 正常触发。Show 自身的 Owner 在整个生命周期中是稳定的，它只持有 `children` 引用，不直接持有内容节点的 `elements`。

### 2.7 示例

```tsx
function Comp() {
  const visible = use(true);

  return (
    <div>
      <button onClick={() => visible(!visible())}>Toggle</button>
      <Show value={visible}>
        {() => <div>主内容</div>}
        {() => <div>备选内容</div>}
      </Show>
    </div>
  );
}
```

省略 fallback 时：

```tsx
<Show value={visible}>{() => <div>仅在可见时渲染</div>}</Show>
```

## 三、`Case` — 多分支选择

### 3.1 用途

根据 `value` 的值在映射表中选择对应的分支进行渲染。未匹配时渲染 fallback。

### 3.2 导入

```ts
import { Case } from "kiaao";
```

### 3.3 签名

```ts
function Case(props: {
  value: any;
  children: [Record<string, () => HostNode[] | HostNode>, (() => HostNode[] | HostNode)?];
}): HostNode[];
```

### 3.4 属性

- **`value`**：任意值。作为 key 在映射表中查找对应的分支函数。
- **`children`**：长度为 1 或 2 的元组。第一个元素是映射表对象 `{ [key]: () => VNode }`，第二个元素是 fallback 函数（可选，key 未命中时调用）。映射表中的每个值都是惰性函数——仅在首次匹配或 key 切换时才调用。如果未提供 fallback，key 未命中时返回注释占位符以保留 DOM 位置。

### 3.5 返回值

返回当前渲染的节点数组。匹配成功时返回对应分支函数的调用结果，未匹配且提供 fallback 时返回 fallback 函数的调用结果，否则返回注释占位符。

### 3.6 行为

- **初始渲染**：根据 `value` 的初始值查找映射表，匹配成功则创建分支 Owner 并调用对应函数，否则调用 fallback 或返回注释占位符。
- **分支切换**：当 `value` 变化时，通过 `use(value, () => ...)` 订阅信号。如果新 key 与旧 key 不同：
  1. 调用 `disposeOwner(activeBranchOwner)` 销毁旧分支 Owner。
  2. 创建新分支 Owner，查找对应分支函数（或 fallback），调用得到新 `HResult`。
  3. 调用 `adoptHResult(branchOwner, newHResult)` 挂载新内容。
  4. 替换 DOM，更新引用。
     如果新 key 与旧 key 相同，不触发任何更新（复用已渲染的 DOM）。
- **fallback 触发**：当 key 未命中任何映射表条目且提供了 fallback 时，调用 fallback 函数，流程与分支切换相同。

### 3.7 示例

```tsx
function Comp() {
  const status = use("loading");

  return (
    <Case value={status}>
      {{
        loading: () => <Spinner />,
        error: () => <ErrorMessage />,
        success: () => <Content />,
      }}
      {() => <div>未知状态</div>}
    </Case>
  );
}
```

## 四、`Each` — 列表渲染

### 4.1 用途

根据 `value` 数组遍历渲染每个条目。支持 `keyed` 进行增量更新，支持 fallback 在列表为空时显示。

### 4.2 导入

```ts
import { Each } from "kiaao";
```

### 4.3 签名

```ts
function Each(props: {
  value: any[];
  keyed?: (item: any, index: number) => any;
  children: [
    (item: () => any, index: number) => HostNode[] | HostNode,
    (() => HostNode[] | HostNode)?,
  ];
}): HostNode[];
```

### 4.4 属性

- **`value`**：数组。通常传入一个数组信号。
- **`keyed`**（可选）：身份标识函数 `(item, index) => any`。用于 diff 时识别每个条目的唯一身份。如果不传，则走全量重建逻辑（每次数据变化时，旧条目全部退出，新条目全部重新创建）。
- **`children`**：长度为 1 或 2 的元组。第一个元素是渲染函数 `(item, index) => HostNode`（`item` 是当前条目的信号 getter，`index` 是条目的**创建索引**，在条目首次渲染时确定，之后不会随列表重排而更新），第二个元素是 fallback 函数（可选，数组为空时调用）。如果未提供 fallback，数组为空时返回注释占位符以保留 DOM 位置。

### 4.5 返回值

返回当前渲染的节点数组。数组非空时返回所有条目的渲染结果，数组为空且提供 fallback 时返回 fallback 函数的调用结果，否则返回注释占位符。

### 4.6 行为

- **初始渲染**：遍历 `value` 数组，为每个条目创建条目 Owner，调用渲染函数，通过 `adoptHResult` 将节点所有权归属到条目 Owner 下，插入 DOM。Each 自身的 `elements` 仅包含锚点注释节点和可能的 fallback 节点。
- **增量更新（有 `keyed`）**：当 `value` 变化时，通过 `use(value, () => ...)` 订阅信号。回调中通过 `keyed` 计算新旧 key 集合，进行 diff：
  - **保留的条目**：复用已有条目 Owner。如果位置变化，从 `item.owner.elements` 获取当前节点集合，通过 adapter 批量移动到新位置。
  - **新增的条目**：创建条目 Owner，调用渲染函数，通过 `adoptHResult` 挂载节点到条目 Owner 下，插入 DOM。
  - **移除的条目**：调用 `disposeOwner(item.owner)` 销毁条目 Owner，自动清理该条目内部所有资源并移除 DOM。
- **全量重建（无 `keyed`）**：当 `value` 变化时，所有旧条目的 Owner 被销毁，所有新条目重新创建。这是默认行为，原因是索引 identity 在列表中间插入或删除时会导致所有后续条目的身份错位，可能引发微妙的 UI 状态错乱。全量重建牺牲了性能，但保证了绝对的正确性。用户如需高效增量更新，应提供 `keyed`。
- **fallback 触发**：当 `value` 数组为空且提供了 fallback 时，调用 fallback 函数，流程类似分支切换。

### 4.7 实现要点

- **条目 Owner 的节点管理**：条目渲染函数返回的节点通过 `owner.elements` 动态获取。Each 不维护额外的 `itemNodeMap`——当需要移动或移除条目时，直接从 `item.owner.elements` 中读取当前节点集合。`owner.elements` 是 `Set<unknown>` 类型，在浏览器环境下其元素为 DOM `Node`，可通过 adapter 操作。
- **异步条目的处理**：如果条目的渲染函数返回异步组件（注释占位符），当异步组件 resolve 后，占位符被替换为真实节点，条目 Owner 的 `elements` 自动更新。如果条目在异步组件 resolve 前被移除，`disposeOwner` 会清理占位符，异步组件的 Promise 回调会检查 `owner.disposed` 而跳过。
- **多根条目的处理**：条目的渲染函数可能返回多个节点（如 Fragment），这些节点全部注册到同一个条目 Owner 的 `elements` 中。移动或移除条目时，操作整个节点集合。
- **锚点管理**：Each 自身维护一个注释锚点用于定位列表的起始位置。锚点归属于 Each 的 Owner 的 `elements`。条目节点通过 adapter 的 `before` 方法插入在锚点之前。当所有条目被移除且没有 fallback 时，锚点保留在 DOM 中。
- **关于 `index` 参数**：渲染函数的 `index` 参数是条目的**创建索引**，在条目首次渲染时确定，之后不会随列表重排而更新。如果用户需要显示实时序号，应在渲染函数中根据 `item` 自行查找或计算。

### 4.8 示例

```tsx
function Comp() {
  const items = use([
    { id: 1, text: "A" },
    { id: 2, text: "B" },
  ]);

  return (
    <ul>
      <Each value={items} keyed={(item) => item.id}>
        {(item, index) => (
          <li>
            {index}: {item().text}
          </li>
        )}
        {() => <li>暂无数据</li>}
      </Each>
    </ul>
  );
}
```

省略 fallback 时：

```tsx
<Each value={items} keyed={(item) => item.id}>
  {(item, index) => <li>{item().text}</li>}
</Each>
```

## 五、与 `Fault` 和 `Loading` 的关系

`Fault`（错误边界）和 `Loading`（异步边界）是两个规划中的控制流组件。它们的 API 应与 `Show`/`Case`/`Each` 保持一致：

- fallback 放在 children 的最后一个函数位置，且为可选。
- 所有分支内容均为惰性函数。
- 内部通过 Owner 树管理生命周期，为分支创建独立 Owner。

当前 `Fault` 和 `Loading` 尚未实现，将在后续版本中引入。设计结论已记录在[控制流组件设计原则](./控制流组件设计原则.md)中。

## 六、迁移指南

### 6.1 从 `when` 迁移到 `Show`

**旧写法**：

```tsx
<div when={visible}>
  <span>主内容</span>
</div>
<div when={visible} else={() => <Fallback />}>
  <span>主内容</span>
</div>
```

**新写法**：

```tsx
<Show value={visible}>
  {() => <span>主内容</span>}
  {() => <Fallback />}
</Show>
```

### 6.2 从 `when` 映射表模式迁移到 `Case`

**旧写法**：

```tsx
<div when={status} else={() => <div>未知状态</div>}>
  {{
    loading: () => <Spinner />,
    error: () => <ErrorMessage />,
  }}
</div>
```

**新写法**：

```tsx
<Case value={status}>
  {{
    loading: () => <Spinner />,
    error: () => <ErrorMessage />,
  }}
  {() => <div>未知状态</div>}
</Case>
```

### 6.3 从 `each` 迁移到 `Each`

**旧写法**：

```tsx
<ul each={items} key={(item) => item.id}>
  {(item) => <li>{item().text}</li>}
</ul>
```

**新写法**：

```tsx
<ul>
  <Each value={items} keyed={(item) => item.id}>
    {(item, index) => <li>{item().text}</li>}
  </Each>
</ul>
```

### 6.4 主要变化

| 旧                      | 新                                |
| ----------------------- | --------------------------------- |
| 属性指令，依赖宿主元素  | 独立组件，不产生包裹节点          |
| `when={visible}`        | `<Show value={visible}>`          |
| `else={...}` 属性       | children 第二个函数（可选）       |
| `when` 映射表模式       | `<Case value={...}>`              |
| `each={items} key={fn}` | `<Each value={items} keyed={fn}>` |
| 无空状态处理            | `<Each>` 支持可选的 fallback      |
| index 为创建索引        | 一致（均非响应式）                |

## 七、性能注意事项

- **分支 Owner 创建开销**：Show 和 Case 在每次分支切换时创建新分支 Owner，Each 为每个条目创建条目 Owner。每个 Owner 对象约 200-300 字节，对于大列表（10000+）存在一定的内存开销。`disposeOwner` 在切换时销毁旧 Owner，避免内存持续增长。
- **与现有实现的关系**：当前 `each` 属性指令在 `renderEachOnElement` 中维护了 `itemNodeMap`，用于追踪条目节点。组件形式的 Each 直接从 `owner.elements` 获取节点，不需要额外的映射表。迁移后可以减少一层冗余数据结构。
- **全量重建（无 `keyed`）**：不传 `keyed` 时 Each 默认全量重建，每次数据变化销毁所有旧条目 Owner 并创建新条目 Owner。对于频繁变化的大列表，建议提供 `keyed` 以启用增量更新。
- **异步条目**：条目渲染函数返回异步组件时，Each 在初始渲染时插入的是注释占位符。当异步组件 resolve 后，占位符被替换为真实 DOM。`owner.elements` 会自动更新。这不需要 Each 做任何特殊处理。
