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

When `h()` encounters a component function that returns a Promise, it creates a placeholder comment node and returns it immediately. The placeholder is inserted into the DOM right away during mounting. When the Promise resolves, the real DOM nodes are created, the placeholder is replaced, and `onMount` callbacks are triggered.

当 `h()` 遇到返回 Promise 的组件函数时，它创建一个占位注释节点并立即返回。该占位符在挂载期间立即插入 DOM。当 Promise resolve 时，真实 DOM 节点被创建，占位符被替换，然后 `onMount` 回调被触发。

```
Time: ─── mount() ─── placeholder in DOM ─── ... await ... ─── real DOM replaces placeholder ─── onMount fires
时间: ─── mount() ─── 占位符在 DOM 中 ─── ... await ... ─── 真实 DOM 替换占位符 ─── onMount 触发
```

The placeholder is a comment node that marks the position. When the real content arrives, the comment is replaced with the actual DOM nodes. No extra wrapper element is added to the DOM.

占位符是一个注释节点，用于标记位置。当真实内容到达时，注释被替换为实际的 DOM 节点。DOM 中不会添加额外的包裹元素。

---

## Lifecycle / 生命周期

### `onMount`

`onMount` callbacks in an async component are deferred until the Promise resolves and the real DOM is inserted. This is different from sync components, where `onMount` fires immediately during `app.mount()`'s recursive traversal.

异步组件中的 `onMount` 回调延迟到 Promise resolve 且真实 DOM 插入后才触发。这与同步组件不同——同步组件的 `onMount` 在 `app.mount()` 递归遍历期间立即触发。

```jsx
async function DelayedGreeting(props, { onMount, use }) {
  const message = use("Loading...");

  onMount(() => {
    console.log("Ready!");
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));
  message("Hello, world!");

  return <h1>{message}</h1>;
}
```

If `onMount` is called after mount has already completed (e.g., inside another `onMount` callback), it runs immediately. If called after the component is disposed, a warning is emitted in development mode.

如果 `onMount` 在挂载完成后调用（例如在另一个 `onMount` 回调内部），它会立即执行。如果在组件销毁后调用，开发模式下会发出警告。

### `onUnmount`

`onUnmount` works exactly the same as in sync components. It can be called anywhere — including inside `onMount` callbacks and async functions — as long as the component has not been disposed. If the component unmounts before the Promise resolves, the registered `onUnmount` callbacks still fire during disposal.

`onUnmount` 与同步组件中的行为完全一致。它可以在任何地方调用——包括 `onMount` 回调和异步函数内部——只要组件尚未被销毁。如果组件在 Promise resolve 之前卸载，已注册的 `onUnmount` 回调仍会在销毁期间触发。

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

## Error Handling / 错误处理

Async components have two layers of error handling: developer-handled and framework-caught. They complement each other and can be used together.

异步组件有两层错误处理：开发者自行处理和框架捕获。两者互补，可以一起使用。

### Developer-Handled Errors / 开发者自行处理

Attach `.catch()` to the Promise before returning it. The caught error becomes a fallback UI — the framework sees a resolved Promise with a DOM node, and renders it normally. This is the recommended pattern for component-level error boundaries.

在返回 Promise 之前附加 `.catch()`。捕获的错误变成一个降级 UI——框架看到的是一个 resolve 为 DOM 节点的 Promise，并正常渲染。这是组件级错误边界的推荐模式。

```jsx
function SafeComponent(props) {
  return fetch("/api/data")
    .then((res) => res.json())
    .then((data) => <Dashboard data={data} />)
    .catch((err) => {
      console.error("Failed to load:", err);
      return <div class="error">Something went wrong. Please try again.</div>;
    });
}
```

You can also use `async/await` with `try/catch`:

也可以使用 `async/await` 配合 `try/catch`：

```jsx
async function SafeComponent(props) {
  try {
    const data = await fetch("/api/data").then((r) => r.json());
    return <Dashboard data={data} />;
  } catch (err) {
    return <div class="error">Something went wrong. Please try again.</div>;
  }
}
```

In both cases, the framework receives a resolved Promise. The error never reaches the framework's catch handler. This gives you full control over what the user sees when something fails.

两种情况下，框架收到的都是一个已 resolve 的 Promise。错误永远不会到达框架的 catch 处理器。这让你完全控制出错时用户看到的内容。

### Framework-Caught Errors / 框架捕获

If a Promise rejects and there is no `.catch()` attached by the developer, the framework catches it. It logs the error to the console and leaves the placeholder comment in the DOM. The rest of the application continues to work — no crash, no white screen.

如果 Promise 被拒绝且开发者没有附加 `.catch()`，框架会捕获它。框架将错误打印到控制台，并在 DOM 中保留占位注释。应用程序的其余部分继续工作——不会崩溃，不会白屏。

```jsx
async function BrokenComponent() {
  throw new Error("Something went wrong");
  return <div>Never rendered</div>;
}
// Console: [kiaao] async component error: Error: Something went wrong
// DOM: <!--async-->
```

### Non-Node Resolution / 非 Node 值

If the Promise resolves with a non-Node value, the placeholder stays in the DOM and a warning is emitted in development mode.

如果 Promise resolve 为非 Node 值，占位符保留在 DOM 中，开发模式下发出警告。

---

## Mount Order / 挂载顺序

Async components have a different `onMount` firing order compared to sync components. This is intentional and stems from the nature of async rendering.

异步组件的 `onMount` 触发顺序与同步组件不同。这是有意为之，源自异步渲染的本质。

**Sync components:** During `triggerMount`, the Owner tree is traversed depth-first. Parent `onMount` fires before children.

**同步组件：** 在 `triggerMount` 期间，Owner 树以深度优先方式遍历。父组件的 `onMount` 先于子组件触发。

**Async components:** When the Promise resolves, the framework first replaces the placeholder with the real DOM, then calls `triggerMount` on the component's Owner to recursively mount all sync children in the subtree. Only after that does it fire the async component's own `onMount` callbacks. Children fire before the async parent.

**异步组件：** 当 Promise resolve 时，框架首先用真实 DOM 替换占位符，然后对组件 Owner 调用 `triggerMount` 递归挂载子树中的所有同步子组件。之后才触发异步组件自身的 `onMount` 回调。子组件先于异步父组件触发。

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

The placeholder is already in the DOM. When the component is disposed, `disposeOwner` runs all registered `onUnmount` callbacks and stops all signals. A `disposed` flag on the Owner prevents the Promise's `.then()` from doing anything when it eventually resolves.

占位符已在 DOM 中。当组件被销毁时，`disposeOwner` 执行所有已注册的 `onUnmount` 回调并停止所有信号。Owner 上的 `disposed` 标志位阻止 Promise 的 `.then()` 在最终 resolve 时执行任何操作。

### After Promise resolves / Promise resolve 之后

The real DOM has already replaced the placeholder. `disposeOwner` removes the real DOM nodes and cleans up the component's resources.

真实 DOM 已替换占位符。`disposeOwner` 移除真实 DOM 节点并清理组件的资源。

### Parent unmount / 父组件卸载

The parent's `disposeOwner` recursion naturally reaches the async component's Owner and handles it as above.

父组件的 `disposeOwner` 递归自然到达异步组件的 Owner，并按上述方式处理。

---

## SSR / 服务端渲染

Async components cannot load data during SSR. When an async component is encountered during server-side rendering, the framework outputs a placeholder comment node instead of throwing an error. The placeholder marks the position where the client-side component will mount when hydrated.

异步组件无法在 SSR 期间加载数据。在服务端渲染期间遇到异步组件时，框架会输出一个占位注释节点，而不是抛出错误。占位符标记了客户端组件水合时将挂载的位置。

```jsx
// SSR output for an async component:
// <!--lazy-ssr--> (for lazy-loaded components)
// <!--async--> (for other async components)
```

For data-fetching scenarios in SSR, fetch the data outside the component and pass it via props to a synchronous component.

对于 SSR 中的数据获取场景，应在组件外部获取数据，通过 props 传入同步组件。

---

## Comparison with `lazy` / 与 lazy 的对比

|                                 | `lazy`                                                               | Async Component / 异步组件                                                           |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Purpose / 用途                  | Code splitting shortcut / 代码拆分快捷方式                           | Data fetching, code splitting, any async work / 数据获取、代码拆分、任何异步工作     |
| Mechanism / 机制                | Returns an async component internally / 内部返回异步组件             | Returns a Promise directly / 直接返回 Promise                                        |
| Component function / 组件函数   | Synchronous wrapper (returns Promise) / 同步包装函数（返回 Promise） | `async function` or returns Promise / `async function` 或返回 Promise                |
| During loading / 加载期间       | Placeholder comment node / 占位注释节点                              | Placeholder comment node / 占位注释节点                                              |
| Error handling / 错误处理       | Shows error text / 显示错误文本                                      | Developer `.catch()` or framework catch / 开发者 `.catch()` 或框架捕获               |
| `onMount` timing / onMount 时机 | Fires when the real component mounts / 真实组件挂载时触发            | Fires after Promise resolves and DOM is inserted / Promise resolve 且 DOM 插入后触发 |
| SSR                             | Outputs placeholder comment / 输出占位注释                           | Outputs placeholder comment / 输出占位注释                                           |

`lazy` is syntax sugar. Internally, it creates an async component that loads the module and renders it. Use `lazy` for simple code splitting, or write an async component directly when you need more control. There is no functional difference — `lazy` is just less typing.

`lazy` 是语法糖。内部创建了一个异步组件来加载模块并渲染。简单的代码拆分用 `lazy`，需要更多控制时直接写异步组件。功能上没有区别——`lazy` 只是少打几个字。

---

Now that you understand async components, learn about control flow or lifecycle. / 现在你了解了异步组件，继续了解控制流或生命周期。

- [Components / 组件](./components.md)
- [Control Flow / 控制流](./control-flow.md)
- [Lifecycle / 生命周期](./lifecycle.md)
