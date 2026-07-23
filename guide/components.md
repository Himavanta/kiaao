# Components / 组件

A component in kiaao is a function that returns JSX. It runs exactly once. There is no re-rendering, no hooks, and no rules of hooks. State lives in signals created with `use`. Every component receives a `context` object as its second argument, providing lifecycle methods, a reference to the component's own Owner, and a component-level `use` that automatically cleans up signals on unmount.

kiaao 中的组件是一个返回 JSX 的函数。它只执行一次。没有重新渲染，没有 hooks，也没有 hooks 的规则。状态存在于用 `use` 创建的信号中。每个组件接收 `context` 对象作为第二个参数，提供生命周期方法、对组件自身 Owner 的引用，以及在卸载时自动清理信号的组件级 `use`。

## A Basic Component / 基本组件

A component function runs once when the application mounts. The DOM is created, signals are created, and JSX expressions like `{count}` bind signals to their text nodes. When a signal is written later, only the bound text node updates. The component function does not re-run.

组件函数在应用挂载时运行一次。DOM 被创建，信号被创建，`{count}` 这样的 JSX 表达式将信号绑定到对应的文本节点。之后写入信号时，只有绑定的文本节点更新。组件函数不会重新运行。

```jsx
function Counter() {
  const count = use(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => count(count() + 1)}>+1</button>
    </div>
  );
}
```

Components are connected to the DOM through `createApp` and `mount`. `createApp` receives the root component's render output and manages the lifecycle of the entire application.

组件通过 `createApp` 和 `mount` 与 DOM 连接。`createApp` 接收根组件的渲染输出，并管理整个应用的生命周期。

```jsx
import { createApp, h } from "kiaao";

const app = createApp(<Counter />);
app.mount("#app");
```

## Props / 组件参数

Components receive props as the first argument, just like any JavaScript function. There is no special `props` wrapper — what you pass in is what the function receives.

组件通过第一个参数接收 props，与普通 JavaScript 函数完全一样。没有特殊的 `props` 包装——你传入什么，函数就收到什么。

```jsx
function Greeting({ name }) {
  return <h1>Hello, {name}</h1>;
}

const app = createApp(<Greeting name="kiaao" />);
app.mount("#app");
```

Props can be signals. Pass them through `context.use` to normalize — if the prop is a plain value, `use` creates a new component-level signal. If the prop is already a signal, `use` returns the same signal directly.

Props 可以是信号。通过 `context.use` 来规范化——如果 prop 是普通值，`use` 创建一个新的组件级信号。如果 prop 已经是信号，`use` 直接返回该信号。

```jsx
function Display(props, { use }) {
  const value = use(props.value);
  // props.value is 42 → creates a new component-level signal
  // props.value is 42 → 创建新的组件级信号
  // props.value is a signal → returns the same signal
  // props.value 是信号 → 返回该信号

  return (
    <div>
      <p>Value: {value}</p>
      <button onClick={() => value(value() + 1)}>Increment</button>
    </div>
  );
}
```

## Multiple Instances / 多实例隔离

To create multiple independent instances of a component that share state, wrap the shared signals in a factory function. The factory's closure holds the signals. Each call to the factory produces a new component function with its own independent copy of those signals.

要创建共享状态的多个独立实例，将共享信号包裹在工厂函数中。工厂函数的闭包持有这些信号。每次调用工厂函数都会生成一个带有自己独立信号副本的全新组件函数。

```jsx
function createCounter() {
  const count = use(0);
  return function Counter() {
    return (
      <div>
        <p>{count}</p>
        <button onClick={() => count(count() + 1)}>+1</button>
      </div>
    );
  };
}

const CounterA = createCounter();
const CounterB = createCounter();
```

`CounterA` and `CounterB` have fully independent `count` signals. Updating one does not affect the other.

`CounterA` 和 `CounterB` 拥有完全独立的 `count` 信号。更新其中一个不会影响另一个。

## Component-Level `use` / 组件级 `use`

We recommend using `context.use` to create signals inside components. It automatically cleans up the signals when the component unmounts, preventing memory leaks and making ownership explicit.

我们推荐使用 `context.use` 在组件内部创建信号。它在组件卸载时自动清理信号，防止内存泄漏，并使所有权更加明确。

```jsx
function Timer(_, { use }) {
  const elapsed = use(0);
  // elapsed will be cleaned up when Timer unmounts
  // elapsed 在 Timer 卸载时会被清理
  return <div>{elapsed}</div>;
}
```

Module-level `use` (imported from `kiaao`) is still available for global state, but should be used sparingly — only when the signal truly needs to outlive any single component.

模块级 `use`（从 `kiaao` 导入）仍然可用于全局状态，但应谨慎使用——仅在信号确实需要超越单个组件生命周期时使用。

## Lifecycle / 生命周期

Lifecycle hooks and component-level `use` are not imported — they come from the `context` object, the second argument to every component function. See the Lifecycle guide for full details.

生命周期钩子和组件级 `use` 不从框架导入——它们来自每个组件函数的第二个参数 `context` 对象。详见生命周期引导文档。

```jsx
function App(props, { onMount, onUnmount, use }) {
  const count = use(0); // component-level, auto-cleaned / 组件级，自动清理

  onMount(() => console.log("mounted"));
  onUnmount(() => console.log("unmounting"));

  return <div>Hello</div>;
}
```

- [Lifecycle / 生命周期](./lifecycle.md)

## Exposing the DOM / 暴露 DOM

A component's return value is an `HResult`, which contains `nodes` — the actual DOM nodes. There is no `ref` forwarding, no `forwardRef`, no `defineExpose`. You can interact with the returned nodes directly.

组件的返回值是 `HResult`，其中包含 `nodes`——真实的 DOM 节点。没有 `ref` 转发，没有 `forwardRef`，没有 `defineExpose`。你可以直接与返回的节点交互。

```jsx
function TextInput() {
  const text = use("");
  return <input value={text} onInput={(e) => text(e.target.value)} />;
}

const result = <TextInput />;
// result.nodes contains the <input> element
// result.nodes 包含 <input> 元素
```

If you need to access the DOM inside the component, use `onMount`:

如果需要在组件内部访问 DOM，使用 `onMount`：

```jsx
function AutoFocusInput(_, { onMount }) {
  const text = use("");
  onMount(() => {
    // The input is now in the DOM
    // input 已在 DOM 中
  });
  return <input value={text} />;
}
```

## Nesting Components / 组件嵌套

Components compose naturally. A parent can hold signals and pass them to children as props, or share them through module-level signals or factory closures.

组件可以自然地组合。父组件可以持有信号并通过 props 传递给子组件，或通过模块级信号或工厂闭包共享。

```jsx
function App() {
  const count = use(0);

  return (
    <div>
      <Display value={count} />
    </div>
  );
}

function Display({ value }, { use }) {
  const v = use(value);
  return <p>{v}</p>;
}
```

There is no `Context` or `provide/inject` in kiaao. Module-level signals, closures, and props are the three channels for sharing state across components.

kiaao 中没有 `Context` 或 `provide/inject`。模块级信号、闭包和 props 是跨组件共享状态的三种通道。

## Fragment / 片段

JSX `<></>` syntax is rendered as a true Fragment — it returns its children directly without creating any wrapper DOM node. There is no extra element in the DOM. This is equivalent to native Fragment behavior.

JSX 的 `<></>` 语法会被渲染为真正的 Fragment——直接返回子节点而不创建任何包裹 DOM 节点。DOM 中没有额外元素。这与原生 Fragment 行为一致。

```jsx
function List() {
  return (
    <>
      <span>A</span>
      <span>B</span>
    </>
  );
}
// The parent gets [<span>A</span>, <span>B</span>] — no wrapper
// 父级获得 [<span>A</span>, <span>B</span>] —— 无包裹元素
```

There is no DOM footprint. CSS selectors like `:nth-child` or `>` direct child combinators will not see any intermediate element.

没有 DOM 痕迹。CSS 选择器（如 `:nth-child`、`>` 直接子代选择器）不会看到任何中间元素。

## Portal / 传送门

`Portal` renders its children into a different location in the DOM, while keeping them logically inside the current component tree. Portal has its own persistent Owner, so its lifecycle is self-contained — when Portal unmounts, the portaled content is automatically removed from the target.

`Portal` 将子节点渲染到 DOM 中的另一个位置，同时在逻辑上保持它们属于当前组件树。Portal 拥有自己的持久 Owner，因此其生命周期是自包含的——Portal 卸载时，传送的内容会自动从目标容器中移除。

```jsx
import { Portal } from "kiaao";

function Modal(_, { use }) {
  const open = use(false);

  return (
    <div>
      <button onClick={() => open(!open())}>Toggle</button>
      <Show value={open}>
        {() => (
          <Portal to="#modal-root">
            <div class="modal">This is rendered inside #modal-root.</div>
          </Portal>
        )}
      </Show>
    </div>
  );
}
```

The `to` prop accepts a CSS selector string or a DOM element. If the target does not exist when `Portal` is rendered, it returns a placeholder comment and does not render its children. It does not retry automatically; render the `Portal` again after the target becomes available.

`to` 属性接受 CSS 选择器字符串或 DOM 元素。如果 `Portal` 渲染时目标容器不存在，它会返回一个占位注释节点，且不会渲染子内容。框架不会自动重试；目标容器准备好后，需要重新渲染 `Portal`。

## `lazy` / 代码拆分

`lazy(loader)` turns a dynamic `import()` into a component. Under the hood, it returns an async component — the Promise from `loader()` is handled by the same async component infrastructure. `lazy` is syntax sugar for the common pattern of importing a component module and rendering it.

`lazy(loader)` 将动态 `import()` 转换为组件。本质上，它返回一个异步组件——`loader()` 返回的 Promise 由异步组件机制统一处理。`lazy` 只是"导入组件模块并渲染"这一常见模式的语法糖。

```jsx
import { lazy } from "kiaao";

const HeavyProfile = lazy(() => import("./HeavyProfile"));

function App() {
  return <HeavyProfile userId={42} />;
}
```

During SSR, `lazy` returns a placeholder comment node (asynchronous components cannot be loaded on the server).

SSR 期间，`lazy` 返回占位注释节点（异步组件无法在服务端加载）。

For more details on async components, including error handling, loading states, and mount order, see the full guide.

更多异步组件细节（包括错误处理、加载状态和挂载顺序）详见完整指南。

- [Async Components / 异步组件](./async-components.md)

## Directives / 自定义指令

Custom directives allow reusable DOM behavior — animation, validation, gestures, ResizeObserver — to be attached directly to native elements. Directives have their own persistent Owner and element-level lifecycle (`onMount`, `onUnmount`, `use`) independent of components. See the Directives guide for full details.

自定义指令允许将可复用的 DOM 行为——动画、验证、手势、ResizeObserver——直接附加到原生元素上。指令拥有自己的持久 Owner 和独立于组件的元素级生命周期（`onMount`、`onUnmount`、`use`）。详见指令引导文档。

```jsx
import { direct } from "kiaao";

const FadeIn = direct((el, props, ctx) => {
  Object.assign(el.style, { opacity: 0 });
  ctx.onMount(() => {
    animate(el, { opacity: 1 }, { duration: props.duration || 0.3 });
  });
});

function Comp() {
  return (
    <FadeIn duration={0.5}>
      <div class="content">I will fade in</div>
    </FadeIn>
  );
}
```

- [Directives / 自定义指令](./directives.md)

Now that you know how to build components, learn about control flow for conditional and list rendering. / 现在你知道了如何构建组件，继续了解条件渲染和列表渲染的控制流。

- [Control Flow / 控制流](./control-flow.md)
- [Lifecycle / 生命周期](./lifecycle.md)
- [SSR / 服务端渲染](./ssr.md)
