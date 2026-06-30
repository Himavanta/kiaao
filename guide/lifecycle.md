# Lifecycle / 生命周期

Every component in kiaao has a simple lifecycle: it is created once, mounted once, and unmounted once. There is no "update" phase because component functions never re-run. Lifecycle hooks are not imported from the framework — they are methods on the `context` object passed as the second argument to every component function.

kiaao 中的每个组件都有简单的生命周期：创建一次，挂载一次，卸载一次。没有"更新"阶段，因为组件函数从不重新运行。生命周期钩子不从框架中导入——它们是传入每个组件函数的第二个参数 `context` 对象上的方法。

---

## Component Signature / 组件签名

Every component function receives two arguments: `props` and `context`. The `context` object provides `onMount`, `onUnmount`, `use`, and `owner`.

每个组件函数接收两个参数：`props` 和 `context`。`context` 对象提供 `onMount`、`onUnmount`、`use` 和 `owner`。

```jsx
function App(props, { onMount, onUnmount, use, owner }) {
  // props — data passed from the parent / 父组件传入的数据
  // context — lifecycle methods and the component's own Owner / 生命周期方法和组件自身的 Owner
  return <div>...</div>;
}
```

- **`use`** — Component-level signal creation. Automatically cleaned up on unmount.
- **`onMount(fn)`** — Register a callback to run after the component's DOM is inserted.
- **`onUnmount(fn)`** — Register a callback to run before the component is removed from the DOM.
- **`owner`** — The component's own Owner node in the lifecycle tree. For advanced use.

- **`use`** — 组件级信号创建。卸载时自动清理。
- **`onMount(fn)`** — 注册回调，在组件 DOM 插入后执行。
- **`onUnmount(fn)`** — 注册回调，在组件从 DOM 移除前执行。
- **`owner`** — 组件在生命周期树中的 Owner 节点。供高级场景使用。

---

## `onMount` / 挂载回调

`onMount(fn)` registers a callback that runs after the component's DOM is inserted into the document. It can be called anywhere — at the top level of the component function, inside a nested function, or inside another `onMount` callback — as long as the component instance has not been disposed.

`onMount(fn)` 注册一个回调，在组件的 DOM 插入文档后执行。它可以在任何地方调用——组件函数顶层、嵌套函数内部、或另一个 `onMount` 回调内部——只要组件实例尚未被销毁。

**Execution timing / 执行时机**：

| When called / 调用时机 | Behavior / 行为                                                             |
| ---------------------- | --------------------------------------------------------------------------- |
| Before mount / 挂载前  | `fn` is queued, runs when mount completes / `fn` 被推入队列，挂载完成后执行 |
| After mount / 挂载后   | `fn` runs immediately / `fn` 立即执行                                       |

**What "mount complete" means / "挂载完成"的含义**：

- For **sync components**, mount is complete when `app.mount()` inserts the root node, then calls `triggerMount` which recursively walks the Owner tree and fires all `mountCallbacks`. The DOM is fully inserted at this point. Callbacks fire from parent to child along the Owner chain.
- For **async components**, mount is complete when the returned Promise resolves, the real DOM replaces the placeholder, `triggerMount` fires for the subtree, and then the async component's own `mountCallbacks` are fired. Children's `onMount` fires before the async parent.

- 对于**同步组件**，挂载完成指 `app.mount()` 插入根节点后，调用 `triggerMount` 递归遍历 Owner 树并触发所有 `mountCallbacks`。此时 DOM 已完全插入。回调按 Owner 链从父到子触发。
- 对于**异步组件**，挂载完成指返回的 Promise resolve 后，真实 DOM 替换占位符，子树触发 `triggerMount`，然后异步组件自身的 `mountCallbacks` 被触发。子组件的 `onMount` 先于异步父组件触发。

**Async callbacks / 异步回调**：

`fn` can be sync or async. If it returns a Promise, the framework does not wait for it. Errors inside `fn` — both synchronous throws and Promise rejections — are caught and logged. One failing callback does not prevent others from running.

`fn` 可以是同步或 async 函数。若返回 Promise，框架不等待其完成。`fn` 内部的错误——无论是同步抛出还是 Promise rejection——都会被捕获并打印。一个回调的失败不会阻止其他回调执行。

```jsx
function App(props, { onMount, use }) {
  const data = use(null);

  // Sync callback — registered before mount, runs after mount
  // 同步回调 — 挂载前注册，挂载后执行
  onMount(() => {
    console.log("Component is in the DOM");
  });

  // Async callback — framework does not wait for fetch to complete
  // 异步回调 — 框架不等待 fetch 完成
  onMount(async () => {
    const res = await fetch("/api/data");
    const json = await res.json();
    data(json);
  });

  // Called after mount — runs immediately
  // 挂载后调用 — 立即执行
  const ready = use(false);
  onMount(() => {
    ready(true);
    // This onMount is called after mount → runs immediately
    // 这个 onMount 在挂载后调用 → 立即执行
    onMount(() => {
      console.log("Runs right away");
    });
  });

  return <div>{data}</div>;
}
```

**Calling after disposal / 销毁后调用**：

If `onMount` is called after the component has been disposed, it emits a warning in development mode and is silently ignored in production.

若在组件已销毁后调用 `onMount`，开发模式下发出警告，生产模式静默忽略。

---

## `onUnmount` / 卸载回调

`onUnmount(fn)` registers a callback that runs just before the component is removed from the DOM. Use it to clean up timers, intervals, subscriptions, or any external resources. Like `onMount`, it can be called anywhere as long as the component instance has not been disposed.

`onUnmount(fn)` 注册一个回调，在组件从 DOM 中移除之前执行。用于清理定时器、间隔、订阅或任何外部资源。与 `onMount` 一样，它可以在任何地方调用，只要组件实例尚未被销毁。

**Execution timing / 执行时机**：

The cleanup callback runs before the component's DOM is removed. All signals, derivations, and event listeners associated with the component are still intact at this point. When the component is disposed via `disposeOwner`:

1. Recursively dispose child Owners.
2. Execute all `onUnmount` callbacks.
3. Execute all cleanup functions (signal stops, event listener removals).
4. Remove owned DOM nodes from the document.

清理回调在组件 DOM 被移除之前执行。此时与组件关联的所有信号、派生和事件监听器仍然完好。当通过 `disposeOwner` 销毁组件时：

1. 递归销毁子 Owner。
2. 执行所有 `onUnmount` 回调。
3. 执行所有清理函数（信号停止、事件监听移除）。
4. 从文档中移除所属 DOM 节点。

```jsx
function Timer(props, { onMount, onUnmount, use }) {
  const time = use(new Date());

  onMount(() => {
    const timer = setInterval(() => {
      time(new Date());
    }, 1000);

    // Register cleanup from inside onMount / 在 onMount 内部注册清理
    onUnmount(() => {
      clearInterval(timer);
    });
  });

  return <div>{time}</div>;
}
```

**Async callbacks / 异步回调**：

`onUnmount` also accepts async functions. The framework does not wait for them. Errors are caught and logged.

`onUnmount` 同样接受 async 函数。框架不等待其完成。错误会被捕获并打印。

```jsx
function DataSync(props, { onUnmount }) {
  onUnmount(async () => {
    await fetch("/api/offline", { method: "POST" });
    console.log("Offline signal sent");
  });

  return <div>...</div>;
}
```

**Calling after disposal / 销毁后调用**：

If `onUnmount` is called after the component has already been disposed, it emits a warning in development mode and is silently ignored in production.

若在组件已销毁后调用 `onUnmount`，开发模式下发出警告，生产模式静默忽略。

---

## Application Entry / 应用入口

Use `createApp` to mount a component tree and manage its lifecycle.

使用 `createApp` 挂载组件树并管理其生命周期。

```jsx
import { createApp } from "kiaao";

const app = createApp(<App />);
app.mount("#app");

// Later, when the app should be removed:
// 之后，当应用需要被移除时：
app.unmount();
```

`createApp` returns an `App` object with:

- `mount(target: string | Element)` — Insert into DOM and trigger `onMount` callbacks.
- `unmount()` — Trigger `onUnmount` callbacks, recursively clean up all resources, then remove from DOM.

`createApp` 返回一个 `App` 对象：

- `mount(target: string | Element)` — 插入 DOM 并触发 `onMount` 回调。
- `unmount()` — 触发 `onUnmount` 回调，递归清理所有资源，然后从 DOM 移除。

---

## Automatic Cleanup / 自动清理

All signals and derivations created with `context.use` are automatically cleaned up when the component unmounts. This includes:

- Definition signals created via `context.use(value)`.
- Derivations created via `context.use(...deps, fn)`.
- Anonymous derivations created by `h()` when binding signals to DOM attributes or text nodes — these are collected and merged into the nearest persistent Owner's `cleanups`.

所有通过 `context.use` 创建的信号和派生在组件卸载时自动清理。这包括：

- 通过 `context.use(value)` 创建的定义信号。
- 通过 `context.use(...deps, fn)` 创建的派生。
- 由 `h()` 在将信号绑定到 DOM 属性或文本节点时创建的匿名派生——这些被收集并合并到最近持久 Owner 的 `cleanups` 中。

You do not need to manually stop any signal. The framework tracks ownership through the Owner tree and cleans up recursively.

你不需要手动停止任何信号。框架通过 Owner 树追踪所有权并递归清理。

---

## Ownership / 所有权

A signal is owned by the component where it was created with `context.use`. When that component unmounts or its Owner is disposed (for example, by a control flow branch switching away), the signal stops reacting to its dependencies and removes itself from their subscriber lists. Module-level signals (created with `import { use }`) are owned by the module and persist for the lifetime of the application.

信号由通过 `context.use` 创建它的组件拥有。当该组件卸载或其 Owner 被销毁时（例如控制流分支切换），信号停止响应依赖并将自身从依赖的订阅者列表中移除。模块级信号（通过 `import { use }` 创建）由模块拥有，在应用生命周期内持续存在。

---

## Error Handling / 错误处理

All lifecycle callbacks — both `onMount` and `onUnmount` — are executed through an internal `safeCall` utility. This ensures:

- Synchronous errors thrown in a callback are caught and logged.
- Promise rejections from async callbacks are caught and logged.
- One failing callback never prevents other registered callbacks from running.
- The framework itself never crashes due to user callback errors.

所有生命周期回调——`onMount` 和 `onUnmount`——都通过内部 `safeCall` 工具函数执行。这保证：

- 回调中同步抛出的错误被捕获并打印。
- 异步回调的 Promise rejection 被捕获并打印。
- 一个回调的失败不会阻止其他已注册回调的执行。
- 框架本身不会因用户回调错误而崩溃。

---

## Summary / 总结

| Hook / 钩子     | When it runs / 执行时机                                                                                                    | Notes / 备注                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `onMount(fn)`   | After DOM insertion — immediately for sync components, deferred for async / DOM 插入后——同步组件立即触发，异步组件延迟触发 | Can be called anywhere; runs immediately if already mounted; async `fn` supported; errors caught / 可在任何地方调用；已挂载则立即执行；支持 async 函数；错误被捕获 |
| `onUnmount(fn)` | Before DOM removal / DOM 移除前                                                                                            | Can be called anywhere; async `fn` supported; errors caught; ignored if already disposed / 可在任何地方调用；支持 async 函数；错误被捕获；已销毁则忽略             |

| Function / 函数     | What it does / 作用                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `app.mount(target)` | Insert into DOM and trigger `onMount` callbacks / 插入 DOM 并触发 `onMount` 回调                                            |
| `app.unmount()`     | Trigger `onUnmount` callbacks, recursively cleanup, then remove from DOM / 触发 `onUnmount` 回调，递归清理，然后从 DOM 移除 |

---

Now that you understand lifecycle, learn about server-side rendering and routing. / 现在你了解了生命周期，继续学习服务端渲染和路由。

- [SSR / 服务端渲染](./ssr.md)
- [Router / 路由](./router.md)
