# Kiaao 控制流组件 API 规范

**状态**：草案
**关联**：[控制流组件设计原则](./控制流组件设计原则.md)
**日期**：2026年6月27日
**版本**：2.3

> **类型说明**：本文档中的 `HostNode` 是平台无关的宿主节点类型（在浏览器环境下为 DOM `Node`，在 SSR 环境下为 `SSRNode`，在其它平台下为对应渲染元素类型）。`HostElement` 特指宿主元素类型（浏览器中为 `Element`）。`Component` 指 Kiaao 的组件函数（即接收 `(props, context)` 并返回 `HResult` 或 `Node[]` 的函数）。

## 一、概述

Kiaao 提供三个控制流组件：`Show`、`Case`、`Each`。它们替代了原有的 `when`/`each` 属性指令，统一通过 `h()` 的组件渲染管道管理生命周期。

三个组件的共同约定：

- **`fallback` 统一位置**：所有 fallback 都放在 children 的最后一个位置（组件引用），且均为可选。
- **惰性渲染**：通过 `h()` 保证——控制流组件在条件不满足时不会调用 `h(Component)`，因此组件函数不会执行，其内部的所有资源都不会被创建。
- **统一锚点**：每个组件始终维护一个注释锚点，它是组件 Owner 的 `elements` 中的**唯一节点**。组件初始渲染时只返回 `[anchor]` 给父级，内容节点不包含在返回值中。所有内容节点通过 `adapter.before(anchor, node)` 插入在锚点之前。锚点永远留在 DOM 中，确保定位稳定。
- **初始渲染推迟到 `onMount`**：初始内容的渲染放在 `onMount` 回调中。此时锚点已通过返回值被父级插入 DOM，`adapter.before(anchor, node)` 可正常工作。内容节点不经过 `result.nodes`，因此不会进入组件的 `elements` 以及所有上级 Owner 的 `elements`。
- **`keyed` 属性**：`Each` 使用 `keyed` prop 作为身份标识函数，避免与 JSX 编译器的 `key` 属性冲突。
- **`context.owner`**：组件通过 `context.owner` 访问自己的 Owner 引用。控制流组件使用它来管理锚点和调用 `disposeOwner` 清理旧分支/条目。

**关于手动 Owner 链接**：无论是在 `onMount` 中的初始渲染，还是后续信号回调中的分支切换，都需要手动将 `h()` 返回的 `HResult.owner` 链接到控制流组件的 Owner 下（设置 `parent` 引用、加入 `children` 数组），并将节点通过 `adapter.before(anchor, node)` 插入在锚点之前。这是所有在异步回调中动态调用 `h()` 的组件都必须遵循的通用模式。

## 二、`Show` — 条件显隐

### 2.1 用途

根据 `value` 的 truthiness 决定渲染主内容还是 fallback。

### 2.2 导入

```ts
import { Show } from "kiaao";
```

### 2.3 签名

```ts
function Show(
  props: {
    value: any;
    children: [Component, Component?];
  },
  context: Context,
): HostNode[];
```

### 2.4 属性

- **`value`**：任意值。truthy 时渲染主内容，falsy 时渲染 fallback。通常传入一个布尔信号。
- **`children`**：长度为 1 或 2 的元组。第一个元素是主内容组件，第二个元素是 fallback 组件（可选）。两个组件均为无 props 组件。如果未提供 fallback，条件为 false 时锚点独自留在 DOM 中。

### 2.5 返回值

返回 `[anchor]`（注释锚点节点数组）。**内容节点不包含在返回值中**，而是通过 `adapter.before(anchor, ...)` 在 `onMount` 或信号回调中插入。

### 2.6 行为

- **初始渲染**：创建锚点并返回 `[anchor]`。在 `onMount` 回调中根据 `value` 的初始值决定渲染哪个组件：
  - 若为 truthy，调用 `h(Primary)` 渲染主内容组件。
  - 若为 falsy 且提供了 fallback，调用 `h(Fallback)` 渲染 fallback 组件。
  - 若为 falsy 且未提供 fallback，不渲染任何组件，仅锚点存在。
  - 将 `h()` 返回的 `HResult.owner` 链接到 Show 的 Owner 下，将 `HResult.nodes` 中的节点通过 `adapter.before(anchor, node)` 插入在锚点之前。
  - 保存 `h()` 返回的 `HResult` 引用（`currentResult`），供后续切换时清理。
- **条件切换**：当 `value` 变化时，Show 通过 `use(value, () => ...)` 订阅信号。回调中：
  1. 调用 `disposeOwner(currentResult.owner)` 销毁旧分支内容的所有资源。
  2. 根据新的 `value` 确定要渲染的组件（`Primary` 或 `Fallback`）。
  3. 如果组件存在，调用 `h(Component)` 渲染新分支内容，拿到新的 `HResult`。
  4. 将新 `HResult.owner` 链接到 Show 的 Owner 下，将节点通过 `adapter.before(anchor, node)` 插入在锚点之前。
  5. 更新 `currentResult` 引用。
- **内部机制**：Show 自身作为一个普通组件，由 `h()` 在组件模式下处理——Owner 自动创建，`onMount`/`onUnmount` 正常触发。Show 自身的 Owner 在整个生命周期中是稳定的，其 `elements` 仅包含锚点。内容节点归属于各自的分支 Owner，不在 Show 的 `elements` 中。

### 2.7 示例

```tsx
function Primary() {
  return <div>主内容</div>;
}
function Fallback() {
  return <div>备选内容</div>;
}

function Comp() {
  const visible = use(true);

  return (
    <div>
      <button onClick={() => visible(!visible())}>Toggle</button>
      <Show value={visible}>
        {Primary}
        {Fallback}
      </Show>
    </div>
  );
}
```

省略 fallback 时：

```tsx
<Show value={visible}>{Primary}</Show>
```

也可以内联组件：

```tsx
<Show value={visible}>
  {() => <div>主内容</div>}
  {() => <div>备选内容</div>}
</Show>
```

注：内联时传递的是组件函数（返回 JSX 的函数），这是 Kiaao 组件的标准写法。

## 三、`Case` — 多分支选择

### 3.1 用途

根据 `value` 的值在映射表中选择对应的分支进行渲染。未匹配时渲染 fallback。

### 3.2 导入

```ts
import { Case } from "kiaao";
```

### 3.3 签名

```ts
function Case(
  props: {
    value: any;
    children: [Record<string, Component>, Component?];
  },
  context: Context,
): HostNode[];
```

### 3.4 属性

- **`value`**：任意值。作为 key 在映射表中查找对应的分支组件。
- **`children`**：长度为 1 或 2 的元组。第一个元素是映射表对象 `{ [key]: Component }`，第二个元素是 fallback 组件（可选，key 未命中时渲染）。如果未提供 fallback，key 未命中时锚点独自留在 DOM 中。

### 3.5 返回值

返回 `[anchor]`（注释锚点节点数组）。内容节点不包含在返回值中。

### 3.6 行为

- **初始渲染**：创建锚点并返回 `[anchor]`。在 `onMount` 回调中根据 `value` 的初始值查找映射表。匹配成功则调用 `h(MatchedComponent)` 渲染对应组件；未匹配且提供了 fallback 则调用 `h(Fallback)`；否则不渲染任何组件。将 `HResult.owner` 链接到 Case 的 Owner 下，将节点插入在锚点之前。保存 `currentResult` 引用。
- **分支切换**：当 `value` 变化时，通过 `use(value, () => ...)` 订阅信号。如果新 key 与旧 key 不同：
  1. `disposeOwner(currentResult.owner)` 销毁旧分支内容。
  2. 查找新 key 对应的分支组件（或 fallback），调用 `h(Component)` 渲染新分支，拿到新的 `HResult`。
  3. 将新 `HResult.owner` 链接到 Case 的 Owner 下，将节点插入在锚点之前。
  4. 更新 `currentResult` 引用。
     如果新 key 与旧 key 相同，不触发任何更新。

### 3.7 示例

```tsx
function Spinner() {
  return <div>Loading...</div>;
}
function ErrorMsg() {
  return <div>Error!</div>;
}
function Content() {
  return <div>Content</div>;
}
function Unknown() {
  return <div>未知状态</div>;
}

function Comp() {
  const status = use("loading");

  return (
    <Case value={status}>
      {{
        loading: Spinner,
        error: ErrorMsg,
        success: Content,
      }}
      {Unknown}
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
function Each(
  props: {
    value: any[];
    keyed?: (item: any, index: number) => any;
    children: [Component<{ item: () => any; index: number }>, Component?];
  },
  context: Context,
): HostNode[];
```

### 4.4 属性

- **`value`**：数组。通常传入一个数组信号。
- **`keyed`**（可选）：身份标识函数 `(item, index) => any`。用于 diff 时识别每个条目的唯一身份。如果不传，则走全量重建逻辑（每次数据变化时，旧条目全部退出，新条目全部重新创建）。
- **`children`**：长度为 1 或 2 的元组。第一个元素是条目渲染组件，接收 `{ item, index }` props（`item` 是当前条目的信号 getter，`index` 是条目的**创建索引**，在条目首次渲染时确定，之后不会随列表重排而更新）。第二个元素是 fallback 组件（可选，数组为空时渲染）。如果未提供 fallback，数组为空时锚点独自留在 DOM 中。

### 4.5 返回值

返回 `[anchor]`（注释锚点节点数组）。条目节点不包含在返回值中。

### 4.6 行为

- **初始渲染**：创建锚点并返回 `[anchor]`。在 `onMount` 回调中遍历 `value` 数组，为每个条目调用 `h(ItemComponent, { item, index })` 渲染条目组件。将每个 `HResult.owner` 链接到 Each 的 Owner 下，将节点插入在锚点之前。保存每个条目的 `HResult` 到条目数组（`itemResults`）。
- **增量更新（有 `keyed`）**：当 `value` 变化时，通过 `use(value, () => ...)` 订阅信号。回调中通过 `keyed` 计算新旧 key 集合，进行 diff：
  - **保留的条目**：复用已有的条目结果（`itemResult`）。如果位置变化，从 `itemResult.owner.elements` 获取当前节点集合，通过 adapter 批量移动到新位置。
  - **新增的条目**：调用 `h(ItemComponent, { item, index })` 渲染新条目，链接 Owner、插入 DOM，保存结果到条目数组。
  - **移除的条目**：调用 `disposeOwner(itemResult.owner)` 销毁旧条目的所有资源。
- **全量重建（无 `keyed`）**：当 `value` 变化时，所有旧条目被销毁（`disposeOwner`），所有新条目重新渲染。这是默认行为，原因是索引 identity 在列表中间插入或删除时会导致所有后续条目的身份错位。全量重建牺牲了性能，但保证了绝对的正确性。用户如需高效增量更新，应提供 `keyed`。
- **fallback 触发**：当 `value` 数组为空且提供了 fallback 组件时，调用 `h(FallbackComponent, {})` 渲染 fallback，链接 Owner、插入 DOM。

### 4.7 实现要点

- **锚点管理**：Each 自身的 `elements` 仅包含锚点注释节点。条目节点归属于各自的条目 Owner。
- **异步条目的处理**：如果条目渲染组件内部返回异步组件，条目 Owner 的 `elements` 会在异步组件 resolve 后自动更新。如果条目在异步组件 resolve 前被移除，`disposeOwner` 会清理占位符，异步组件的 Promise 回调会检查 `owner.disposed` 而跳过。
- **多根条目的处理**：条目渲染组件可能返回多个节点（如 Fragment），这些节点全部注册到同一个条目 Owner 的 `elements` 中。移动或移除条目时，操作整个节点集合。

### 4.8 示例

```tsx
function ItemRow({ item, index }: { item: () => any; index: number }) {
  return (
    <li>
      {index}: {item().text}
    </li>
  );
}
function EmptyState() {
  return <li>暂无数据</li>;
}

function Comp() {
  const items = use([
    { id: 1, text: "A" },
    { id: 2, text: "B" },
  ]);

  return (
    <ul>
      <Each value={items} keyed={(item) => item.id}>
        {ItemRow}
        {EmptyState}
      </Each>
    </ul>
  );
}
```

省略 fallback 时：

```tsx
<Each value={items} keyed={(item) => item.id}>
  {ItemRow}
</Each>
```

也可以内联条目组件：

```tsx
<Each value={items} keyed={(item) => item.id}>
  {({ item, index }) => (
    <li>
      {index}: {item().text}
    </li>
  )}
</Each>
```

## 五、与 `Error` 组件的关系

`Error` 组件（错误边界）是规划中的控制流组件。它的 API 应与 `Show`/`Case`/`Each` 保持一致：fallback 放在 children 的最后一个位置且可选，内部通过 `h()` 渲染子组件，使用统一锚点，初始渲染推迟到 `onMount`。fallback 接收 `{ error, reset }` props。当前暂不实现，将在后续版本中引入。

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
    {({ item, index }) => <li>{item().text}</li>}
  </Each>
</ul>
```

### 6.4 主要变化

| 旧                      | 新                                |
| ----------------------- | --------------------------------- |
| 属性指令，依赖宿主元素  | 独立组件，不产生包裹节点          |
| `when={visible}`        | `<Show value={visible}>`          |
| `else={...}` 属性       | children 第二个组件（可选）       |
| `when` 映射表模式       | `<Case value={...}>`              |
| `each={items} key={fn}` | `<Each value={items} keyed={fn}>` |
| 无空状态处理            | `<Each>` 支持可选的 fallback      |

## 七、性能注意事项

- **条目创建开销**：Each 为每个条目调用 `h()` 创建独立的组件实例和 Owner。对于大列表，建议提供 `keyed` 以启用增量更新，避免全量重建带来的开销。
- **全量重建（无 `keyed`）**：不传 `keyed` 时 Each 默认全量重建，每次数据变化销毁所有旧条目并重新渲染。对于频繁变化的大列表，推荐使用 `keyed`。
- **与现有实现的关系**：当前 `each` 属性指令在 `renderEachOnElement` 中维护了 `itemNodeMap`。组件形式的 Each 直接从 `itemResult.owner.elements` 获取节点，不需要额外的映射表。迁移后可以减少一层冗余数据结构。
- **异步条目**：条目渲染组件内部返回异步组件时，Each 在初始渲染时插入的是注释占位符。当异步组件 resolve 后，占位符被替换为真实 DOM。`owner.elements` 会自动更新。这不需要 Each 做任何特殊处理。
- **`elements` 清洁性**：由于初始渲染推迟到 `onMount`，内容节点不经过 `result.nodes`，因此不会进入 Show/Each 的 `elements` 以及所有上级 Owner 的 `elements`。每个 Owner 的 `elements` 只包含它自己负责的节点，保持清洁。
