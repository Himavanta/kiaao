# Control Flow / 控制流

In kiaao, conditional rendering and list rendering are achieved through the built-in components `<Show>`, `<Case>`, and `<Each>`. They are framework primitives that integrate with the Owner tree for automatic lifecycle management — no wrapper elements, no manual cleanup. Branches are **lazy**: component functions are only called when their branch becomes active.

在 kiaao 中，条件渲染和列表渲染通过内置组件 `<Show>`、`<Case>` 和 `<Each>` 实现。它们是框架原语，与 Owner 树集成以实现自动生命周期管理——无需包裹元素，无需手动清理。分支是**惰性的**：只有当分支变为活动状态时，组件函数才会被调用。

---

## `<Show>` — Conditional Rendering / 条件渲染

`<Show>` conditionally renders one of two branches based on a signal value. `value` accepts `MaybeSignal<T>` — it does **not** accept a thunk `() => T`. Children must be functions that return components — the function is only called when that branch is active.

`<Show>` 根据一个信号值来条件渲染两个分支中的一个。`value` 接收 `MaybeSignal<T>`——**不接受** thunk `() => T`。子元素必须是返回组件的函数——只有当该分支处于活动状态时，函数才会被调用。

```jsx
function App() {
  const loggedIn = use(false);

  return (
    <div>
      <button onClick={() => loggedIn(!loggedIn())}>Toggle</button>
      <Show value={loggedIn}>
        {() => <Dashboard />}
        {() => <Login />}
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

`<Case>` renders one of several branches based on a key. `value` accepts `MaybeSignal<string>`. The first child is a mapping table (object), where each value is a **function that returns a component**. The second child (optional) is a fallback function.

`<Case>` 基于一个 key 来渲染多个分支中的一个。`value` 接收 `MaybeSignal<string>`。第一个子元素是一个映射表（对象），其中每个值是一个**返回组件的函数**。第二个子元素（可选）是 fallback 函数。

```jsx
function App() {
  const tab = use("overview");

  return (
    <div>
      <nav>
        <button onClick={() => tab("overview")}>Overview</button>
        <button onClick={() => tab("settings")}>Settings</button>
        <button onClick={() => tab("billing")}>Billing</button>
      </nav>

      <Case value={tab}>
        {{
          overview: () => <OverviewTab />,
          settings: () => <SettingsTab />,
          billing: () => <BillingTab />,
        }}
        {() => <NotFound />}
      </Case>
    </div>
  );
}
```

Keys must be strings. The value is converted to a string and looked up in the table. If no key matches, the fallback function is called (if provided). Each branch function is called only when its key is matched.

键必须是字符串。值被转换为字符串并在表中查找。如果没有匹配的键，则调用 fallback 函数（如果提供）。每个分支函数仅在其 key 匹配时被调用。

---

## `<Each>` — List Rendering / 列表渲染

`<Each>` renders a list of items from a signal. `value` accepts `MaybeSignal<T[]>`. The first child is a render function `(item: Signal<T>, index: number) => HResult`. The second child (optional) is an empty-state fallback **function**.

`<Each>` 从信号渲染一个列表。`value` 接收 `MaybeSignal<T[]>`。第一个子元素是渲染函数 `(item: Signal<T>, index: number) => HResult`。第二个子元素（可选）是空状态 fallback **函数**。

```jsx
function App() {
  const items = use(["apple", "banana", "cherry"]);

  return (
    <ul>
      <Each value={items}>
        {(item, index) => (
          <li>
            {index}: {item}
          </li>
        )}
      </Each>
    </ul>
  );
}
```

For empty state, provide a fallback function:

对于空状态，提供一个 fallback 函数：

```jsx
<Each value={items}>
  {(item) => <TodoItem data={item} />}
  {() => <EmptyList />}
</Each>
```

### `keyed` — Stable Identity / 稳定身份标识

An optional `keyed` function provides a stable identity for each item. When the array changes, `<Each>` diffs items by key — existing DOM nodes for matching keys are preserved and repositioned, while only added or removed items create or destroy nodes.

可选的 `keyed` 函数为每个条目提供稳定标识。当数组变化时，`<Each>` 通过 key 进行 diff——匹配 key 的现有 DOM 节点被保留并移动位置，仅增删条目创建或销毁节点。

`keyed` receives the raw item value `T` (the same type as the array elements), **not** `Signal<T>`. This is different from the render function, whose first parameter is `Signal<T>`.

`keyed` 接收原始值 `T`（与数组元素类型一致），**不是** `Signal<T>`。这与渲染函数不同——渲染函数的第一个参数是 `Signal<T>`。

```jsx
const users = use([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
]);

<Each value={users} keyed={(user) => user.id}>
  {/*       keyed: user is { id, name } — access .id directly */}
  {/*       keyed: user 是 { id, name } —— 直接 .id */}
  {(user) => <UserCard data={user} />}
  {/* render: user is Signal<{ id, name }> — use user() or {user} */}
  {/* render: user 是 Signal<{ id, name }> —— 用 user() 或 {user} */}
</Each>;
```

**`keyed` 函数接收原始条目值，不是信号。如需读取信号，使用 `toValue`。**

---

## Why Functions? / 为什么需要函数？

Control flow children must be functions so that component code is only executed when the branch becomes active. This means:

- Signals and lifecycle hooks inside a branch are only created when the branch is first rendered.
- When switching away from a branch, the branch's Owner is disposed, cleaning up all its resources.
- When switching back, the function is called again, creating a fresh instance.

控制流子元素必须是函数，这样组件代码只会在分支变为活动状态时执行。这意味着：

- 分支内的信号和生命周期钩子只在分支首次渲染时创建。
- 当切换离开某个分支时，该分支的 Owner 被销毁，清理所有资源。
- 当切换回来时，函数再次被调用，创建全新实例。

---

## Comparison / 对比

control flow was achieved through `when` and `each` attributes on native HTML elements. These have been replaced by `<Show>`, `<Case>`, and `<Each>` components. The new components:

控制流通过原生 HTML 元素上的 `when` 和 `each` 属性实现。这些已被 `<Show>`、`<Case>` 和 `<Each>` 组件取代。新组件：

- Have their own persistent Owner for self-contained lifecycle management.
- Work correctly in SSR without special handling.
- Produce no extra DOM wrapper nodes.

- 拥有自己的持久 Owner，实现自包含的生命周期管理。
- 在 SSR 中正确输出，无需特殊处理。
- 不产生额外的 DOM 包裹节点。

---

Now that you understand control flow, learn about component lifecycle. / 现在你了解了控制流，继续学习组件生命周期。

- [Lifecycle / 生命周期](./lifecycle.md)
- [SSR / 服务端渲染](./ssr.md)
- [Router / 路由](./router.md)
