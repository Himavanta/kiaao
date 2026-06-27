# Kiaao 控制流组件 API 规范

**状态**：草案
**关联**：[控制流组件设计原则](./控制流组件设计原则.md)
**日期**：2026年6月27日
**版本**：2.0

> **类型说明**：本文档中的 `HostNode` 是平台无关的宿主节点类型（在浏览器环境下为 DOM `Node`，在 SSR 环境下为 `SSRNode`，在其它平台下为对应渲染元素类型）。`HostElement` 特指宿主元素类型（浏览器中为 `Element`）。

## 一、概述

Kiaao 提供三个控制流组件：`Show`、`Case`、`Each`。它们替代了原有的 `when`/`each` 属性指令，统一通过 Owner 树管理生命周期。当前 `when`/`each` 属性指令在 `handleDomMode` 中实现，组件形式将在后续版本中逐步迁移。属性指令可保留作为兼容层，内部委托给对应的组件实现。

三个组件的共同约定：

- **`fallback` 统一位置**：所有 fallback 都放在 children 的最后一个函数位置，且均为可选。
- **惰性渲染**：所有分支内容均为函数形式，保证内容在需要时才被创建。
- **统一锚点**：每个组件始终维护一个注释锚点，作为组件 Owner 的 `elements` 的唯一节点。组件返回 `[anchor]` 给父级。所有内容节点通过 `adapter.before(anchor, node)` 插入在锚点之前。锚点永远留在 DOM 中，确保定位稳定。
- **`keyed` 属性**：`Each` 使用 `keyed` prop 作为身份标识函数，避免与 JSX 编译器的 `key` 属性冲突。
- **`ScopedOwner` 管理**：组件通过 `createScopedOwner(parent, fn)` 为每个分支或条目创建独立的作用域。分支切换或条目移除时，调用 `scope.dispose()` 一键销毁所有资源。
- **`context.owner`**：组件通过 `context.owner` 访问自己的 Owner 引用。控制流组件使用它来管理子作用域的挂载和卸载。

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
    children: [() => HostNode[] | HostNode, (() => HostNode[] | HostNode)?];
  },
  context: Context,
): HostNode[];
```

### 2.4 属性

- **`value`**：任意值。truthy 时渲染主内容，falsy 时渲染 fallback。通常传入一个布尔信号。
- **`children`**：长度为 1 或 2 的元组。第一个元素是主内容函数（`value` 为 truthy 时调用），第二个元素是 fallback 函数（可选，`value` 为 falsy 时调用）。两个函数均为惰性求值——仅在需要时被调用。如果未提供 fallback，条件为 false 时锚点独自留在 DOM 中。

### 2.5 返回值

返回 `[anchor]`（注释锚点节点数组）。内容节点通过 `adapter.before(anchor, ...)` 插入在锚点之前，不包含在返回值中。

### 2.6 行为

- **初始渲染**：创建锚点，根据 `value` 的初始值决定是否执行分支函数。如果为 truthy，调用 `createScopedOwner(showOwner, () => primaryFn())` 创建主内容作用域；如果为 falsy 且提供了 fallback，则创建 fallback 作用域；否则不创建任何作用域，仅锚点存在。
- **条件切换**：当 `value` 变化时，Show 通过 `use(value, () => ...)` 订阅信号。回调中：
  1. 调用 `activeScope?.dispose()` 销毁旧分支作用域。
  2. 根据新的 `value` 确定要执行的分支函数。
  3. 如果分支函数存在，调用 `createScopedOwner(showOwner, branchFn)` 创建新的作用域，执行分支函数并自动将内容所有权归属到该作用域下。
  4. 更新 `activeScope` 引用。
     `createScopedOwner` 内部已处理子 Owner 的创建、挂载、内容执行和所有权归属。内容节点自动插入在锚点之前（由 `adoptHResult` 内部调用 `adapter.before` 完成，或由 `createScopedOwner` 封装处理）。
- **内部机制**：Show 自身作为一个普通组件，由 `h()` 在组件模式下处理——Owner 自动创建，`onMount`/`onUnmount` 正常触发。Show 自身的 Owner 在整个生命周期中是稳定的，其 `elements` 仅包含锚点。

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
function Case(
  props: {
    value: any;
    children: [Record<string, () => HostNode[] | HostNode>, (() => HostNode[] | HostNode)?];
  },
  context: Context,
): HostNode[];
```

### 3.4 属性

- **`value`**：任意值。作为 key 在映射表中查找对应的分支函数。
- **`children`**：长度为 1 或 2 的元组。第一个元素是映射表对象 `{ [key]: () => VNode }`，第二个元素是 fallback 函数（可选，key 未命中时调用）。映射表中的每个值都是惰性函数——仅在首次匹配或 key 切换时才调用。如果未提供 fallback，key 未命中时锚点独自留在 DOM 中。

### 3.5 返回值

返回 `[anchor]`（注释锚点节点数组）。内容节点不包含在返回值中。

### 3.6 行为

- **初始渲染**：根据 `value` 的初始值查找映射表。匹配成功则调用 `createScopedOwner(caseOwner, () => matchedFn())`；未匹配且提供了 fallback 则调用 `createScopedOwner(caseOwner, fallbackFn)`；否则不创建作用域。
- **分支切换**：当 `value` 变化时，通过 `use(value, () => ...)` 订阅信号。如果新 key 与旧 key 不同：
  1. `activeScope?.dispose()` 销毁旧作用域。
  2. 查找新 key 对应的分支函数（或 fallback），调用 `createScopedOwner(caseOwner, branchFn)` 创建新作用域。
  3. 更新 `activeScope` 引用。
     如果新 key 与旧 key 相同，不触发任何更新。

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
function Each(
  props: {
    value: any[];
    keyed?: (item: any, index: number) => any;
    children: [
      (item: () => any, index: number) => HostNode[] | HostNode,
      (() => HostNode[] | HostNode)?,
    ];
  },
  context: Context,
): HostNode[];
```

### 4.4 属性

- **`value`**：数组。通常传入一个数组信号。
- **`keyed`**（可选）：身份标识函数 `(item, index) => any`。用于 diff 时识别每个条目的唯一身份。如果不传，则走全量重建逻辑（每次数据变化时，旧条目全部退出，新条目全部重新创建）。
- **`children`**：长度为 1 或 2 的元组。第一个元素是渲染函数 `(item, index) => HostNode`（`item` 是当前条目的信号 getter，`index` 是条目的**创建索引**，在条目首次渲染时确定，之后不会随列表重排而更新），第二个元素是 fallback 函数（可选，数组为空时调用）。如果未提供 fallback，数组为空时锚点独自留在 DOM 中。

### 4.5 返回值

返回 `[anchor]`（注释锚点节点数组）。条目节点不包含在返回值中。

### 4.6 行为

- **初始渲染**：遍历 `value` 数组，为每个条目调用 `createScopedOwner(eachOwner, () => renderFn(itemSignal, index))` 创建条目作用域。条目节点自动插入在锚点之前。
- **增量更新（有 `keyed`）**：当 `value` 变化时，通过 `use(value, () => ...)` 订阅信号。回调中通过 `keyed` 计算新旧 key 集合，进行 diff：
  - **保留的条目**：复用已有的 `ScopedOwner`。如果位置变化，从 `scope.elements()` 获取当前节点集合，通过 adapter 批量移动到新位置。
  - **新增的条目**：调用 `createScopedOwner(eachOwner, () => renderFn(itemSignal, index))` 创建新条目作用域。
  - **移除的条目**：调用 `item.scope.dispose()` 销毁旧条目作用域，自动清理内部所有资源并移除 DOM。
- **全量重建（无 `keyed`）**：当 `value` 变化时，所有旧条目作用域被销毁，所有新条目重新创建。这是默认行为，原因是索引 identity 在列表中间插入或删除时会导致所有后续条目的身份错位。全量重建牺牲了性能，但保证了绝对的正确性。用户如需高效增量更新，应提供 `keyed`。
- **fallback 触发**：当 `value` 数组为空且提供了 fallback 时，调用 `createScopedOwner(eachOwner, fallbackFn)` 创建 fallback 作用域。

### 4.7 实现要点

- **锚点管理**：Each 自身的 `elements` 仅包含锚点注释节点。条目节点归属于各自的条目作用域。
- **异步条目的处理**：如果条目的渲染函数返回异步组件，条目作用域的 `elements` 会在异步组件 resolve 后自动更新。如果条目在异步组件 resolve 前被移除，`dispose()` 会清理占位符，异步组件的 Promise 回调会检查 `owner.disposed` 而跳过。
- **多根条目的处理**：条目的渲染函数可能返回多个节点，这些节点全部注册到同一个条目作用域的 `elements` 中。移动或移除条目时，操作整个节点集合。

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

`Fault`（错误边界）和 `Loading`（异步边界）是两个规划中的控制流组件。它们的 API 应与 `Show`/`Case`/`Each` 保持一致：fallback 放在 children 的最后一个函数位置且可选，所有分支内容均为惰性函数，内部通过 `createScopedOwner` 管理作用域，使用统一锚点。当前暂不实现，将在后续版本中引入。

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

## 七、性能注意事项

- **作用域创建开销**：`createScopedOwner` 为每个分支或条目创建一个 Owner 对象（约 200-300 字节）。对于大列表，建议提供 `keyed` 以启用增量更新，避免全量重建带来的开销。
- **全量重建（无 `keyed`）**：不传 `keyed` 时 Each 默认全量重建，每次数据变化销毁所有旧作用域并创建新作用域。对于频繁变化的大列表，推荐使用 `keyed`。
- **与现有实现的关系**：当前 `each` 属性指令在 `renderEachOnElement` 中维护了 `itemNodeMap`。组件形式的 Each 直接从 `scope.elements()` 获取节点，不需要额外的映射表。迁移后可以减少一层冗余数据结构。
- **异步条目**：条目渲染函数返回异步组件时，Each 在初始渲染时插入的是注释占位符。当异步组件 resolve 后，占位符被替换为真实 DOM。`scope.elements()` 会自动更新。这不需要 Each 做任何特殊处理。
