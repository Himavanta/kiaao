# Lifecycle / 生命周期

Every component in kiaao has a simple lifecycle: it is created once, mounted once, and unmounted once. There is no "update" phase because component functions never re-run. Lifecycle hooks are not imported from the framework — they are methods on the `context` object passed as the second argument to every component function.

kiaao 中的每个组件都有简单的生命周期：创建一次，挂载一次，卸载一次。没有"更新"阶段，因为组件函数从不重新运行。生命周期钩子不从框架中导入——它们是传入每个组件函数的第二个参数 `context` 对象上的方法。

---

## Component Signature / 组件签名

Every component function receives two arguments: `props` and `context`. The `context` object provides `onMount` and `onUnmount`.

每个组件函数接收两个参数：`props` 和 `context`。`context` 对象提供 `onMount` 和 `onUnmount`。

```jsx
function App(props, { onMount, onUnmount }) {
  // props — data passed from the parent / 父组件传入的数据
  // context — lifecycle methods scoped to this component instance / 绑定到当前组件实例的生命周期方法
  return <div>...</div>;
}
```

---

## `onMount` / 挂载回调

`onMount(fn)` registers a callback that runs after the component's DOM is inserted into the document. It can be called anywhere — at the top level of the component function, inside a nested function, or inside another `onMount` callback — as long as the component instance has not been disposed.

`onMount(fn)` 注册一个回调，在组件的 DOM 插入文档后执行。它可以在任何地方调用——组件函数顶层、嵌套函数内部、或另一个 `onMount` 回调内部——只要组件实例尚未被销毁。

**Execution timing / 执行时机：**

| When called / 调用时机 | Behavior / 行为                                                             |
| ---------------------- | --------------------------------------------------------------------------- |
| Before mount / 挂载前  | `fn` is queued, runs when mount completes / `fn` 被推入队列，挂载完成后执行 |
| After mount / 挂载后   | `fn` runs immediately / `fn` 立即执行                                       |

**What "mount complete" means / "挂载完成"的含义：**

- For **sync components**, mount is complete when `mount(root, container)` calls `triggerMount`, which recursively traverses the DOM tree and fires `onMount` callbacks on every node with an `INSTANCE_KEY`. The DOM is fully inserted at this point. Callbacks fire in depth-first pre-order — parent before children.
- 对于**同步组件**，挂载完成指 `mount(root, container)` 调用 `triggerMount` 递归遍历 DOM 树，在每个带 `INSTANCE_KEY` 的节点上触发 `onMount` 回调。此时 DOM 已完全插入。回调以深度优先前序触发——父组件先于子组件。

- For **async components**, mount is complete when the returned Promise resolves, the real DOM is inserted into the transparent wrapper, `triggerMount(realDOM)` recursively mounts all sync children in the subtree, and then the async component's own `mountCallbacks` are fired manually. Children fire before the async parent.
- 对于**异步组件**，挂载完成指返回的 Promise resolve 后，真实 DOM 插入透明 wrapper，`triggerMount(realDOM)` 递归挂载子树中所有同步子组件，然后手动触发异步组件自身的 `mountCallbacks`。子组件先于异步父组件触发。

**This ordering difference is intentional.** In both cases, a parent's `onMount` callback is guaranteed to run only after all _ready_ children in its subtree have mounted. For async components, a child that hasn't resolved yet is not "ready", so the parent does not wait for it.

**这一顺序差异是有意为之。** 无论哪种情况，父组件的 `onMount` 回调都保证在其子树中所有*已就位*的子组件挂载完成后才执行。对于异步组件，尚未 resolve 的子组件不算"已就位"，因此父组件不等待它。

**Async callbacks / 异步回调：**

`fn` can be sync or async. If it returns a Promise, the framework does not wait for it. Errors inside `fn` — both synchronous throws and Promise rejections — are caught by the internal `safeCall` utility and logged to the console. One failing callback does not prevent others from running.

`fn` 可以是同步或 async 函数。若返回 Promise，框架不等待其完成。`fn` 内部的错误——无论是同步抛出还是 Promise rejection——都由内部 `safeCall` 工具函数捕获并打印到控制台。一个回调的失败不会阻止其他回调执行。

```jsx
function App(props, { onMount }) {
  const [data, setData] = use(null);

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
    setData(json);
  });

  // Called after mount — runs immediately
  // 挂载后调用 — 立即执行
  const [ready, setReady] = use(false);
  onMount(() => {
    setReady(true);
    // This onMount is called after mount → runs immediately
    // 这个 onMount 在挂载后调用 → 立即执行
    onMount(() => {
      console.log("Runs right away");
    });
  });

  return <div>{data}</div>;
}
```

**Calling after disposal / 销毁后调用：**

If `onMount` is called after the component has been disposed, it emits a warning in development mode and is silently ignored in production.

若在组件已销毁后调用 `onMount`，开发模式下发出警告，生产模式静默忽略。

---

## `onUnmount` / 卸载回调

`onUnmount(fn)` registers a callback that runs just before the component is removed from the DOM. Use it to clean up timers, intervals, subscriptions, or any external resources. Like `onMount`, it can be called anywhere as long as the component instance has not been disposed.

`onUnmount(fn)` 注册一个回调，在组件从 DOM 中移除之前执行。用于清理定时器、间隔、订阅或任何外部资源。与 `onMount` 一样，它可以在任何地方调用，只要组件实例尚未被销毁。

**Execution timing / 执行时机：**

The cleanup callback runs before the component's DOM is removed. All signals, derivations, and event listeners associated with the component are still intact at this point. Callbacks are executed by `createDisposeFn` via `safeCall`, so async functions are not awaited and errors are caught and logged.

清理回调在组件的 DOM 被移除之前执行。此时与组件关联的所有信号、派生和事件监听器仍然完好。回调由 `createDisposeFn` 通过 `safeCall` 执行，因此 async 函数不会被等待，错误会被捕获并打印。

```jsx
function Timer(props, { onMount, onUnmount }) {
  const [time, setTime] = use(new Date());

  onMount(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    // Register cleanup from inside onMount / 在 onMount 内部注册清理
    onUnmount(() => {
      clearInterval(timer);
    });
  });

  return <div>{time}</div>;
}
```

**Async callbacks / 异步回调：**

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

**Calling after disposal / 销毁后调用：**

If `onUnmount` is called after the component has already been disposed, it emits a warning in development mode and is silently ignored in production.

若在组件已销毁后调用 `onUnmount`，开发模式下发出警告，生产模式静默忽略。

---

## `mount` and `unmount` / 挂载与卸载

`mount(root, container)` inserts a component tree into a DOM container and triggers all pending `onMount` callbacks in the tree. `unmount(root)` removes the tree from the DOM and triggers all `onUnmount` callbacks, then recursively cleans up all signals, derivations, and event listeners.

`mount(root, container)` 将组件树插入 DOM 容器，并触发树中所有待执行的 `onMount` 回调。`unmount(root)` 从 DOM 中移除组件树，触发所有 `onUnmount` 回调，然后递归清理所有信号、派生和事件监听器。

```jsx
import { mount, unmount } from "kiaao";

const app = <App />;
mount(app, document.getElementById("app"));

// Later, when the app should be removed:
// 之后，当应用需要被移除时：
unmount(app);
```

For async components, the wrapper is inserted into the DOM immediately during `mount`, but `onMount` callbacks are deferred until the Promise resolves and the real content is ready.

对于异步组件，wrapper 在 `mount` 期间立即插入 DOM，但 `onMount` 回调会延迟到 Promise resolve 且真实内容就位后才触发。

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

## Automatic Cleanup / 自动清理

All derivations created within a component are automatically cleaned up when the component unmounts. This includes:

- Derivations created explicitly with `use(...deps, fn)` inside the component function.
- Anonymous derivations created by `h()` when binding signals to DOM attributes or text nodes.
- Derivations created by `when` and `each` directives.

组件内创建的所有派生在组件卸载时会自动清理。这包括：

- 在组件函数内部显式通过 `use(...deps, fn)` 创建的派生。
- `h()` 在将信号绑定到 DOM 属性或文本节点时创建的匿名派生。
- `when` 和 `each` 指令创建的派生。

You do not need to manually stop any derivation. The framework tracks ownership and cleans up recursively through `disposeNode`.

你不需要手动停止任何派生。框架追踪所有权并通过 `disposeNode` 递归清理。

---

## Ownership / 所有权

A derivation is owned by the component or DOM subtree where it was created. When that component unmounts or that DOM subtree is removed (for example, by `when` switching to a different branch or `each` removing list items), the derivation stops reacting to its dependencies and removes itself from their subscriber lists.

派生由其创建时所在的组件或 DOM 子树拥有。当该组件卸载或该 DOM 子树被移除时（例如 `when` 切换到另一个分支，或 `each` 移除列表项），派生停止响应其依赖，并将自身从依赖的订阅者列表中移除。

This means you can freely create derivations anywhere without worrying about memory leaks — as long as they are created inside a component or a DOM element managed by `when`/`each`.

这意味着你可以在任何地方自由创建派生，无需担心内存泄漏——只要它们是在组件内或由 `when`/`each` 管理的 DOM 元素内创建的。

---

## Summary / 总结

| Hook / 钩子     | When it runs / 执行时机                                                                                                    | Notes / 备注                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `onMount(fn)`   | After DOM insertion — immediately for sync components, deferred for async / DOM 插入后——同步组件立即触发，异步组件延迟触发 | Can be called anywhere; runs immediately if already mounted; async `fn` supported; errors caught / 可在任何地方调用；已挂载则立即执行；支持 async 函数；错误被捕获 |
| `onUnmount(fn)` | Before DOM removal / DOM 移除前                                                                                            | Can be called anywhere; async `fn` supported; errors caught; ignored if already disposed / 可在任何地方调用；支持 async 函数；错误被捕获；已销毁则忽略             |

| Function / 函数          | What it does / 作用                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `mount(root, container)` | Insert into DOM and trigger `onMount` callbacks / 插入 DOM 并触发 `onMount` 回调                                            |
| `unmount(root)`          | Trigger `onUnmount` callbacks, recursively cleanup, then remove from DOM / 触发 `onUnmount` 回调，递归清理，然后从 DOM 移除 |
