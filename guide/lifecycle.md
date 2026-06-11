# Lifecycle / 生命周期

Every component in kiaao has a simple lifecycle: it is created once, mounted once, and unmounted once. There is no "update" phase because component functions never re-run.

kiaao 中的每个组件都有简单的生命周期：创建一次，挂载一次，卸载一次。没有"更新"阶段，因为组件函数从不重新运行。

---

## `onMount` / 挂载回调

`onMount(fn)` registers a callback that runs once after the component's DOM is inserted into the document. It must be called synchronously at the top level of the component function — not inside a derivation, not inside a callback, not inside a conditional branch.

`onMount(fn)` 注册一个回调，在组件的 DOM 插入文档后执行一次。它必须在组件函数的顶层同步调用——不能在派生内部、回调内部或条件分支中调用。

```jsx
import { use, onMount } from "kiaao";

function App() {
  const [ready, setReady] = use(false);

  onMount(() => {
    console.log("Component is in the DOM");
    setReady(true);
  });

  return <div>{ready}</div>;
}
```

The callback runs after the component and all its children have been inserted. The DOM is fully available inside `onMount`.

回调在组件及其所有子节点插入后执行。DOM 在 `onMount` 内部完全可用。

---

## `onUnmount` / 卸载回调

`onUnmount(fn)` registers a callback that runs just before the component is removed from the DOM. Use it to clean up timers, intervals, or any external resources. Like `onMount`, it must be called synchronously at the top level of the component function.

`onUnmount(fn)` 注册一个回调，在组件从 DOM 中移除之前执行。用于清理定时器、间隔或任何外部资源。与 `onMount` 一样，它必须在组件函数的顶层同步调用。

```jsx
import { use, onMount, onUnmount } from "kiaao";

function Timer() {
  const [time, setTime] = use(new Date());

  const timer = setInterval(() => {
    setTime(new Date());
  }, 1000);

  onUnmount(() => {
    clearInterval(timer);
  });

  return <div>{time}</div>;
}
```

The cleanup callback runs before the component's DOM is removed. All signals, derivations, and event listeners associated with the component are still intact at this point.

清理回调在组件的 DOM 被移除之前执行。此时与组件关联的所有信号、派生和事件监听器仍然完好。

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

---

## Automatic Cleanup / 自动清理

All derivations created within a component are automatically cleaned up when the component unmounts. This includes:

- Derivations created explicitly with `use(...deps, fn)` inside the component function.
- Anonymous derivations created by `h()` when binding signals to DOM attributes or text nodes.
- Derivations created by `when` and `each` directives.

You do not need to manually stop any derivation. The framework tracks ownership and cleans up recursively through `disposeNode`.

组件内创建的所有派生在组件卸载时会自动清理。这包括：

- 在组件函数内部显式通过 `use(...deps, fn)` 创建的派生。
- `h()` 在将信号绑定到 DOM 属性或文本节点时创建的匿名派生。
- `when` 和 `each` 指令创建的派生。

你不需要手动停止任何派生。框架追踪所有权并通过 `disposeNode` 递归清理。

---

## Ownership / 所有权

A derivation is owned by the component or DOM subtree where it was created. When that component unmounts or that DOM subtree is removed (for example, by `when` switching to a different branch or `each` removing list items), the derivation stops reacting to its dependencies and removes itself from their subscriber lists.

派生由其创建时所在的组件或 DOM 子树拥有。当该组件卸载或该 DOM 子树被移除时（例如 `when` 切换到另一个分支，或 `each` 移除列表项），派生停止响应其依赖，并将自身从依赖的订阅者列表中移除。

This means you can freely create derivations anywhere without worrying about memory leaks — as long as they are created inside a component or a DOM element managed by `when`/`each`.

这意味着你可以在任何地方自由创建派生，无需担心内存泄漏——只要它们是在组件内或由 `when`/`each` 管理的 DOM 元素内创建的。

---

## Summary / 总结

| Hook / 钩子     | When it runs / 执行时机          |
| --------------- | -------------------------------- |
| `onMount(fn)`   | After DOM insertion / DOM 插入后 |
| `onUnmount(fn)` | Before DOM removal / DOM 移除前  |

| Function / 函数          | What it does / 作用                                                         |
| ------------------------ | --------------------------------------------------------------------------- |
| `mount(root, container)` | Insert and trigger onMount / 插入并触发 onMount                             |
| `unmount(root)`          | Remove and trigger onUnmount, then cleanup / 移除并触发 onUnmount，然后清理 |
