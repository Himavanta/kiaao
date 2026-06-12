# Async Components / 异步组件

An async component is a component function that returns a Promise. The framework detects this and automatically handles the loading state — no additional API, no wrapper function, no special decorator. Just return a Promise from your component.

异步组件是返回 Promise 的组件函数。框架自动检测并处理加载状态——无需额外的 API、包装函数或特殊装饰器。只需从组件中返回 Promise。

```jsx
async function UserProfile({ userId }, { onMount, onUnmount }) {
  const res = await fetch(`/api/users/${userId}`);
  const user = await res.json();

  onMount(() => {
    console.log("UserProfile mounted with data");
  });

  return (
    <div class="profile">
      <h1>{user.name}</h1>
      <p>{user.bio}</p>
    </div>
  );
}
```

This is distinct from `lazy`, which is for code splitting — loading the component's JavaScript module. An async component already has its code loaded; it's waiting for data before it can render.

这与 `lazy` 不同——`lazy` 用于代码拆分，加载组件的 JavaScript 模块。异步组件的代码已经加载完毕，它在等待数据才能渲染。

---

## How It Works / 工作原理

When `h()` encounters a component function that returns a Promise, it creates a wrapper element — a `<div style="display: contents">` — and returns it immediately. The wrapper is inserted into the DOM right away during `mount()`. When the Promise resolves, the real DOM is appended as a child of the wrapper, and `onMount` callbacks are triggered.

当 `h()` 遇到返回 Promise 的组件函数时，它创建一个 wrapper 元素——`<div style="display: contents">`——并立即返回。该 wrapper 在 `mount()` 期间立即插入 DOM。当 Promise resolve 时，真实 DOM 作为 wrapper 的子节点追加，然后触发 `onMount` 回调。

```
Time: ─── mount() ─── wrapper in DOM ─── ... await ... ─── real DOM appended ─── onMount fires
时间: ─── mount() ─── wrapper 在 DOM 中 ─── ... await ... ─── 真实 DOM 追加 ─── onMount 触发
```

The wrapper is the component's root node for its entire lifetime. It holds the `DISPOSE_KEY` for cleanup. The real DOM is just a child — it does not carry any component-level metadata. This means the wrapper is always the target for `disposeNode` during unmount, regardless of when the component is destroyed.

wrapper 在其整个生命周期中都是组件的根节点。它持有 `DISPOSE_KEY` 用于清理。真实 DOM 只是一个子节点——不携带任何组件级别的元数据。这意味着在卸载期间，`disposeNode` 始终以 wrapper 为目标，无论组件何时被销毁。

The wrapper has `display: contents`, so it is invisible in layout. Its children behave as if they were direct children of the wrapper's parent. The cost is one extra node in the DOM tree, which affects CSS selectors like `:nth-child` and `>` direct child combinators.

wrapper 具有 `display: contents`，因此在布局中不可见。其子节点在布局上表现得如同 wrapper 父元素的直接子节点。代价是 DOM 树中多了一个节点，这会影响 CSS 选择器，如 `:nth-child` 和 `>` 直接子代选择器。

---

## Lifecycle / 生命周期

### `onMount`

`onMount` callbacks in an async component are deferred until the Promise resolves and the real DOM is appended. This is different from sync components, where `onMount` fires immediately during `mount()`'s recursive traversal.

异步组件中的 `onMount` 回调延迟到 Promise resolve 且真实 DOM 追加后才触发。这与同步组件不同——同步组件的 `onMount` 在 `mount()` 递归遍历期间立即触发。

```jsx
async function DelayedGreeting(props, { onMount }) {
  // This runs during component creation, before mount
  // 这在组件创建期间运行，挂载之前
  const [message, setMessage] = use("Loading...");

  onMount(() => {
    // This runs after the Promise resolves and DOM is appended
    // 这在 Promise resolve 且 DOM 追加后运行
    console.log("Ready!");
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));
  setMessage("Hello, world!");

  return <h1>{message}</h1>;
}
```

If `onMount` is called after mount has already completed (e.g., inside another `onMount` callback), it runs immediately. If called after the component is disposed, a warning is emitted in development mode.

如果 `onMount` 在挂载完成后调用（例如在另一个 `onMount` 回调内部），它会立即执行。如果在组件销毁后调用，开发模式下会发出警告。

### `onUnmount`

`onUnmount` works exactly the same as in sync components. It can be called anywhere — including inside `onMount` callbacks and async functions — as long as the component has not been disposed. If the component unmounts before the Promise resolves, the registered `onUnmount` callbacks still fire during `disposeNode(wrapper)`.

`onUnmount` 与同步组件中的行为完全一致。它可以在任何地方调用——包括 `onMount` 回调和异步函数内部——只要组件尚未被销毁。如果组件在 Promise resolve 之前卸载，已注册的 `onUnmount` 回调仍会在 `disposeNode(wrapper)` 期间触发。

```jsx
async function DataStream(props, { onMount, onUnmount }) {
  onMount(() => {
    const ws = new WebSocket("wss://...");
    onUnmount(() => ws.close());
  });

  const data = await fetchInitialData();
  return <div>{data}</div>;
}
```

---

## Mount Order / 挂载顺序

Async components have a different `onMount` firing order compared to sync components. This is intentional and stems from the nature of async rendering.

异步组件的 `onMount` 触发顺序与同步组件不同。这是有意为之，源自异步渲染的本质。

**Sync components:** During `triggerMount`, the DOM tree is traversed depth-first, pre-order. Parent `onMount` fires before children.

**同步组件：** 在 `triggerMount` 期间，DOM 树以深度优先、前序方式遍历。父组件的 `onMount` 先于子组件触发。

**Async components:** When the Promise resolves, the framework first appends the real DOM, then calls `triggerMount(realDOM)` to recursively mount all sync children in the subtree. Only after that does it fire the async component's own `onMount` callbacks. Children fire before the async parent.

**异步组件：** 当 Promise resolve 时，框架首先追加真实 DOM，然后调用 `triggerMount(realDOM)` 递归挂载子树中的所有同步子组件。之后才触发异步组件自身的 `onMount` 回调。子组件先于异步父组件触发。

The invariant that matters: **when a parent's `onMount` runs, all _ready_ children in its subtree have already mounted.** For an async parent, children that haven't resolved yet are not "ready", so the parent does not wait for them.

重要的不变量是：**当父组件的 `onMount` 执行时，其子树中所有*已就位*的子组件都已挂载完毕。** 对于异步父组件，尚未 resolve 的子组件不算"已就位"，因此父组件不等待它们。

```jsx
async function Parent(props, { onMount }) {
  onMount(() => console.log("Parent mounted"));

  return (
    <div>
      <SyncChild /> {/* onMount already fired by now */}
      <AsyncChild /> {/* may not have resolved yet */}
    </div>
  );
}
// Log output (if AsyncChild hasn't resolved):
// SyncChild mounted
// Parent mounted
// ... later: AsyncChild mounted
```

---

## Unmount Scenarios / 卸载场景

An async component can be unmounted at any point in its lifecycle. The framework handles all cases correctly.

异步组件可以在其生命周期的任何时刻被卸载。框架正确处理所有情况。

### Before Promise resolves / Promise resolve 之前

The wrapper is already in the DOM. `disposeNode(wrapper)` triggers the `DISPOSE_KEY`, which runs all registered `onUnmount` callbacks and stops all effects. A `disposed` flag prevents the Promise's `.then()` from doing anything when it eventually resolves.

wrapper 已在 DOM 中。`disposeNode(wrapper)` 触发 `DISPOSE_KEY`，执行所有已注册的 `onUnmount` 回调并停止所有 effect。`disposed` 标志位阻止 Promise 的 `.then()` 在最终 resolve 时执行任何操作。

### After Promise resolves / Promise resolve 之后

The real DOM is a child of the wrapper. `disposeNode(wrapper)` recursively cleans up the real DOM's subtree (stopping `LOCAL_EFFECTS`), then fires the `DISPOSE_KEY` on the wrapper to clean up the component instance.

真实 DOM 是 wrapper 的子节点。`disposeNode(wrapper)` 递归清理真实 DOM 的子树（停止 `LOCAL_EFFECTS`），然后触发 wrapper 上的 `DISPOSE_KEY` 清理组件实例。

### Parent unmount / 父组件卸载

The parent's `disposeNode` recursion naturally reaches the wrapper and handles it as above.

父组件的 `disposeNode` 递归自然到达 wrapper，并按上述方式处理。

---

## Error Handling / 错误处理

If the Promise rejects, the framework logs the error to the console and leaves the wrapper empty. No error is thrown — the rest of the application continues to work.

如果 Promise 被拒绝，框架将错误打印到控制台，并保留空的 wrapper。不会抛出错误——应用程序的其余部分继续工作。

```jsx
async function BrokenComponent() {
  throw new Error("Something went wrong");
  return <div>Never rendered</div>;
}
// Console: [kiaao] async component error: Error: Something went wrong
// DOM: <div style="display: contents"></div>
```

If the Promise resolves with a non-Node value, it is downgraded to a comment node with a warning in development mode.

如果 Promise resolve 为非 Node 值，则在开发模式下发出警告并降级为注释节点。

```jsx
async function WrongReturn() {
  return "not a node";
}
// Dev console: [kiaao] async component resolved with non-Node value: "not a node"
// DOM: <div style="display: contents"><!-- async component resolved with invalid value --></div>
```

---

## SSR / 服务端渲染

Async components are **not supported in SSR**. `renderToString` is synchronous and cannot wait for Promises. If an async component is encountered during SSR, the framework throws an error.

异步组件**不支持 SSR**。`renderToString` 是同步的，无法等待 Promise。如果在 SSR 期间遇到异步组件，框架会抛出错误。

```
[kiaao] Async components are not supported in SSR.
```

For data-fetching scenarios in SSR, fetch the data outside the component and pass it via props to a synchronous component.

对于 SSR 中的数据获取场景，应在组件外部获取数据，通过 props 传入同步组件。

---

## Comparison with `lazy` / 与 lazy 的对比

|                                 | `lazy`                                                    | Async Component                                                                       |
| ------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Purpose / 用途                  | Code splitting / 代码拆分                                 | Data fetching / 数据获取                                                              |
| What loads / 加载什么           | The component's JS module / 组件的 JS 模块                | Data needed for rendering / 渲染所需的数据                                            |
| Component function / 组件函数   | Synchronous / 同步                                        | Async (`async function` or returns Promise) / 异步（`async function` 或返回 Promise） |
| During loading / 加载期间       | Comment placeholder / 注释占位符                          | Transparent wrapper `<div style="display: contents">` / 透明 wrapper                  |
| `onMount` timing / onMount 时机 | Fires when the real component mounts / 真实组件挂载时触发 | Fires after Promise resolves and DOM is appended / Promise resolve 且 DOM 追加后触发  |
| SSR                             | Supported (renders placeholder) / 支持（渲染占位符）      | Not supported / 不支持                                                                |

They can be combined: a `lazy`-loaded module can export an async component. The `lazy` proxy handles the code loading, and when the real component runs, the framework handles the async rendering.

它们可以组合使用：`lazy` 加载的模块可以导出一个异步组件。`lazy` 代理处理代码加载，当真实组件运行时，框架处理异步渲染。

```jsx
const Dashboard = lazy(() => import("./Dashboard"));

// Dashboard.tsx
export default async function Dashboard(props, { onMount }) {
  const stats = await fetch("/api/stats").then((r) => r.json());
  onMount(() => console.log("Dashboard ready"));
  return <StatsPanel data={stats} />;
}
```

---

Now that you understand async components, learn about control flow or lifecycle. / 现在你了解了异步组件，继续了解控制流或生命周期。

- [Components / 组件](./components.md)
- [Control Flow / 控制流](./control-flow.md)
- [Lifecycle / 生命周期](./lifecycle.md)
