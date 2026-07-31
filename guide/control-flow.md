# Control Flow / 控制流

In kiaao, conditional rendering and list rendering are achieved through the built-in components `<Show>`, `<Case>`, and `<Each>`. They are framework primitives that integrate with the Owner tree for automatic lifecycle management — no wrapper elements, no manual cleanup. Branches are **lazy**: each child function is a full component, receiving `(props, context)` like any other component, and is only called when its branch becomes active.

在 kiaao 中，条件渲染和列表渲染通过内置组件 `<Show>`、`<Case>` 和 `<Each>` 实现。它们是框架原语，与 Owner 树集成以实现自动生命周期管理——无需包裹元素，无需手动清理。分支是**惰性的**：每个子函数都是一个完整的组件，像其他组件一样接收 `(props, context)` 两个参数，仅在其分支变为活动状态时被调用。

---

## `<Show>` — Conditional Rendering / 条件渲染

`<Show>` conditionally renders one of two branches based on a signal value. `value` accepts `MaybeSignal<T>` — it does **not** accept a thunk `() => T`. Pass component functions directly, or wrap in an arrow to pass extra props.

`<Show>` 根据一个信号值来条件渲染两个分支中的一个。`value` 接收 `MaybeSignal<T>`——**不接受** thunk `() => T`。直接传入组件函数，或用箭头包装传递额外 props。

```jsx
function Dashboard(_, { onMount }: Context) {
  onMount(() => console.log("dashboard mounted"));
  return <div>Dashboard</div>;
}

function Login() {
  return <div>Please log in</div>;
}

function App() {
  const loggedIn = use(false);

  return (
    <div>
      <button onClick={() => loggedIn(!loggedIn())}>Toggle</button>
      <Show value={loggedIn}>
        {Dashboard}
        {Login}
      </Show>
    </div>
  );
}
```

- The first child function renders when `value` is truthy.
- The second child function (optional) renders when `value` is falsy.

- 第一个子函数在 `value` 为 truthy 时渲染。
- 第二个子函数（可选）在 `value` 为 falsy 时渲染。

**How it works / 工作原理**：On first render, the active branch's function is called immediately, and its DOM nodes are placed before an internal anchor comment. When the signal changes, the old branch is unmounted (`onUnmount` fires, DOM is removed) and the new branch's function is called and inserted at the same position.

\*\*首次渲染时，活动分支的函数立即被调用，其 DOM 节点被放置在内部锚点注释之前。当信号变化时，旧分支被卸载（`onUnmount` 触发，DOM 被移除），新分支的函数被调用并插入到相同位置。

---

## `<Case>` — Multi-Branch Matching / 多分支匹配

`<Case>` renders one of several branches based on a key. `value` accepts `MaybeSignal<string>`. The first child is a mapping table (object) whose values are components. The second child (optional) is a fallback component.

`<Case>` 基于一个 key 来渲染多个分支中的一个。`value` 接收 `MaybeSignal<string>`。第一个子元素是一个映射表（对象），其值都是组件。第二个子元素（可选）是 fallback 组件。

```jsx
function OverviewTab() {
  return <div>Overview</div>;
}

function NotFound() {
  return <div>Tab not found</div>;
}

function App() {
  const tab = use("overview");

  return (
    <div>
      <nav>
        <button onClick={() => tab("overview")}>Overview</button>
        <button onClick={() => tab("settings")}>Settings</button>
      </nav>

      <Case value={tab}>
        {{
          overview: OverviewTab,
          settings: (props, ctx) => <SettingsTab />,
        }}
        {NotFound}
      </Case>
    </div>
  );
}
```

Keys must be strings. The value is converted to a string and looked up in the table. If no key matches, the fallback function is called (if provided). Each branch function is called only when its key is matched.

键必须是字符串。值被转换为字符串并在表中查找。如果没有匹配的键，则调用 fallback 函数（如果提供）。每个分支函数仅在其 key 匹配时被调用。

---

## `<Each>` — List Rendering / 列表渲染

`<Each>` renders a list from `MaybeSignal<T[]>`. The render component receives `{ item: Signal<T>, index: number }` as props. The second child (optional) is an empty-state fallback component.

`<Each>` 从 `MaybeSignal<T[]>` 渲染列表。渲染组件接收 `{ item: Signal<T>, index: number }` 作为 props。第二个子元素（可选）是空状态 fallback 组件。

`item` is a logically read-only derivation — it always reflects the latest value at that position in the source array. Writing to it is a no-op. To change data, update the source array signal. For local UI state, create your own signal inside the component.

`item` 是逻辑只读派生——始终反映源数组该位置的最新值。写入是空操作。更改数据请更新源数组信号。局部 UI 状态在组件内自行创建信号。

```jsx
function ItemRow({ item, index }: { item: Signal<string>; index: number }) {
  return <li>{index}: {item()}</li>;
}

function App() {
  const items = use(["apple", "banana", "cherry"]);

  return (
    <ul>
      <Each value={items}>
        {ItemRow}
      </Each>
    </ul>
  );
}
```

Or destructure inline when you don't need a separate component:

或者不需要独立组件时在内联解构：

```jsx
<Each value={items}>
  {({ item, index }) => (
    <li>
      {index}: {item}
    </li>
  )}
</Each>
```

For empty state, provide a fallback component:

对于空状态，提供一个 fallback 组件：

```jsx
function EmptyList() {
  return <p>No items</p>;
}

<Each value={items}>
  {ItemRow}
  {EmptyList}
</Each>;
```

Each time `items` changes to an empty array, the fallback component is recreated. This follows kiaao's `===` rule — a new empty array is a new reference, so `<Each>` treats it as a change. If your fallback has side effects（animations, fetch, etc.），keep the array reference stable by caching and returning the same `[]` when items are genuinely unchanged. See reactivity.md for the reference stability pattern.

每次 `items` 变为空数组时，fallback 组件会被重建。这遵循 kiaao 的 `===` 规则——新的空数组是新引用，`<Each>` 将其视为变化。如果 fallback 有副作用（动画、fetch 等），在条目确实未变时缓存并返回同一个 `[]` 引用以保持稳定。参见 reactivity.md 的引用稳定性模式。

### `keyed` — Stable Identity / 稳定身份标识

An optional `keyed` function provides a stable identity for each item. When the array changes, `<Each>` diffs items by key — existing DOM nodes for matching keys are preserved and repositioned, while only added or removed items create or destroy nodes.

可选的 `keyed` 函数为每个条目提供稳定标识。当数组变化时，`<Each>` 通过 key 进行 diff——匹配 key 的现有 DOM 节点被保留并移动位置，仅增删条目创建或销毁节点。

`keyed` receives the raw item value `T`, **not** `Signal<T>`. This is different from the render component which receives `{ item: Signal<T>, index: number }`.

`keyed` 接收原始值 `T`，**不是** `Signal<T>`。这与渲染组件不同。

```jsx
const users = use([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
]);

<Each value={users} keyed={(user) => user.id}>
  {/*       keyed: user is { id, name } — access .id directly */}
  {/*       keyed: user 是 { id, name } —— 直接 .id */}
  {({ item: user }) => <UserCard data={user} />}
  {/* render: user is Signal<{ id, name }> — use user() */}
  {/* render: user 是 Signal<{ id, name }> —— 用 user() */}
</Each>;
```

---

## Why Components? / 为什么是组件？

Control flow children are components, not plain functions. This means each branch gets its own Owner and Context — just like any `<Foo />` tag. When a branch becomes inactive, its Owner is disposed, cleaning up all signals and lifecycle hooks created inside it. When it becomes active again, the component is called fresh.

控制流子元素是组件，不是普通函数。这意味着每个分支拥有自己的 Owner 和 Context——就像任何 `<Foo />` 标签一样。当分支变为非活动状态时，其 Owner 被销毁，清理内部创建的所有信号和生命周期钩子。当它再次变为活动状态时，组件被全新调用。

---

Now that you understand control flow, learn about component lifecycle. / 现在你了解了控制流，继续学习组件生命周期。

- [Lifecycle / 生命周期](./lifecycle.md)
- [SSR / 服务端渲染](./ssr.md)
- [Router / 路由](./router.md)
