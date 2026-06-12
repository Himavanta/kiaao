# Components / 组件

A component in kiaao is a function that returns JSX. It runs exactly once. There is no re-rendering, no hooks, and no rules of hooks. State lives in signals created with `use` at the top level of the component function.

kiaao 中的组件是一个返回 JSX 的函数。它只执行一次。没有重新渲染，没有 hooks，也没有 hooks 的规则。状态存在于组件函数顶层用 `use` 创建的信号中。

---

## A Basic Component / 基本组件

A component function runs once when mounted. The DOM is created, signals are created, and JSX expressions like `{count}` bind signals to their text nodes. When a setter is called later, only the bound text node updates. The component function does not re-run.

组件函数在挂载时运行一次。DOM 被创建，信号被创建，`{count}` 这样的 JSX 表达式将信号绑定到对应的文本节点。之后调用 setter 时，只有绑定的文本节点更新。组件函数不会重新运行。

```jsx
function Counter() {
  const [count, setCount] = use(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
    </div>
  );
}

mount(<Counter />, document.getElementById("app"));
```

---

## Props / 组件参数

Components receive props as the first argument, just like any JavaScript function. There is no special `props` wrapper — what you pass in is what the function receives.

组件通过第一个参数接收 props，与普通 JavaScript 函数完全一样。没有特殊的 `props` 包装——你传入什么，函数就收到什么。

```jsx
function Greeting({ name }) {
  return <h1>Hello, {name}</h1>;
}

mount(<Greeting name="kiaao" />, document.getElementById("app"));
```

Props can be signals. Use `toUse` in the child component to normalize a prop that might be a plain value or an existing signal. The child's internal logic then works uniformly regardless of how the prop was passed.

Props 可以是信号。在子组件中使用 `toUse` 来规范化可能是普通值或已有信号的 prop。无论 prop 如何传入，子组件的内部逻辑都是统一的。

```jsx
function Display({ value }) {
  const [v, setV] = toUse(value);
  return (
    <div>
      <p>Value: {v}</p>
      <button onClick={() => setV(v() + 1)}>Increment</button>
    </div>
  );
}
```

---

## Multiple Instances / 多实例隔离

To create multiple independent instances of a component that share state, wrap the shared signals in a factory function. The factory's closure holds the signals. Each call to the factory produces a new component function with its own independent copy of those signals.

要创建共享状态的多个独立实例，将共享信号包裹在工厂函数中。工厂函数的闭包持有这些信号。每次调用工厂函数都会生成一个带有自己独立信号副本的全新组件函数。

```jsx
function createCounter() {
  const [count, setCount] = use(0);
  return function Counter() {
    return (
      <div>
        <p>{count}</p>
        <button onClick={() => setCount((c) => c + 1)}>+1</button>
      </div>
    );
  };
}

const CounterA = createCounter();
const CounterB = createCounter();
```

`CounterA` and `CounterB` have fully independent `count` signals. Updating one does not affect the other.

`CounterA` 和 `CounterB` 拥有完全独立的 `count` 信号。更新其中一个不会影响另一个。

---

## Lifecycle / 生命周期

Lifecycle hooks are not imported — they come from the `context` object, the second argument to every component function. See the Lifecycle guide for full details.

生命周期钩子不再从框架导入——它们来自每个组件函数的第二个参数 `context` 对象。详见生命周期引导文档。

```jsx
function App(props, { onMount, onUnmount }) {
  onMount(() => console.log("mounted"));
  onUnmount(() => console.log("unmounting"));
  return <div>Hello</div>;
}
```

- [Lifecycle / 生命周期](./lifecycle.md)

---

## Exposing the DOM / 暴露 DOM

A component returns a real DOM element. There is no `ref` forwarding, no `forwardRef`, no `defineExpose`. You can interact with the returned element directly.

组件返回真实的 DOM 元素。没有 `ref` 转发，没有 `forwardRef`，没有 `defineExpose`。你可以直接与返回的元素交互。

```jsx
function TextInput() {
  const [text, setText] = use("");
  return <input value={text} onInput={(e) => setText(e.target.value)} />;
}

const input = <TextInput />;
input.focus(); // it's a real <input> / 它就是真实的 <input>
```

---

## Nesting Components / 组件嵌套

Components compose naturally. A parent can hold signals and pass them to children as props, or share them through module-level signals or factory closures.

组件可以自然地组合。父组件可以持有信号并通过 props 传递给子组件，或通过模块级信号或工厂闭包共享。

```jsx
function App() {
  const [count, setCount] = use(0);

  return (
    <div>
      <Counter count={count} onUpdate={setCount} />
    </div>
  );
}

function Counter({ count, onUpdate }) {
  return (
    <div>
      <p>{count}</p>
      <button onClick={() => onUpdate((c) => c + 1)}>+1</button>
    </div>
  );
}
```

There is no `Context` or `provide/inject` in kiaao. Module-level signals, closures, and props are the three channels for sharing state across components.

kiaao 中没有 `Context` 或 `provide/inject`。模块级信号、闭包和 props 是跨组件共享状态的三种通道。

---

## Fragment / 片段

JSX `<></>` syntax is rendered as a `<div style="display: contents">` container with children rendered normally inside it. This differs from native Fragment behavior — the container node is real and exists in the DOM tree.

JSX 的 `<></>` 语法在 kiaao 中会被渲染为一个 `<div style="display: contents">` 容器，其子节点正常渲染在其中。这与原生 Fragment 行为不同——容器节点是真实的，存在于 DOM 树中。

`display: contents` makes the container itself invisible in layout, so children appear visually as if they were direct children of the parent. However, there are observable differences:

- CSS selectors like `:nth-child` or the `>` direct child combinator will count the container element.
- DOM traversal APIs (`parentNode.children`, `previousElementSibling`, etc.) will see the container node.
- Attributes on the Fragment (`class`, `style`, etc.) have no effect, since the `<>...</>` syntax does not support passing props.

`display: contents` 使容器自身在布局中不可见，子节点在视觉上表现得如同直接挂载在父级下。但存在以下可观察的差异：

- CSS 选择器（如 `:nth-child`、`>` 直接子代选择器）会将容器元素计入。
- DOM 遍历 API（`parentNode.children`、`previousElementSibling` 等）会看到容器节点。
- Fragment 上的属性（`class`、`style` 等）不会生效，因为 `<>...</>` 语法不支持传递 props。

**Recommendation:** When you need a wrapper that leaves no DOM trace, explicitly use a native element with `style="display: contents"`. This is more predictable than relying on Fragment syntax sugar.

**建议**：当你需要一个无 DOM 痕迹的包裹容器时，显式使用原生元素并自行设置 `style="display: contents"`。这比依赖 Fragment 语法糖更可预测。

```jsx
// Fragment syntax — convenient, but has a real container in the DOM
// Fragment 语法 —— 便捷，但在 DOM 中有真实容器
<>
  <span>A</span>
  <span>B</span>
</>

// Equivalent explicit form — more predictable
// 等价的显式写法 —— 更可预测
<div style="display: contents">
  <span>A</span>
  <span>B</span>
</div>
```

---

## Teleport / 传送门

`Teleport` renders its children into a different location in the DOM, while keeping them logically inside the current component tree. The children remain connected to the component's signals, lifecycle, and cleanup. When the component unmounts, the teleported content is automatically removed from the target.

`Teleport` 将子节点渲染到 DOM 中的另一个位置，同时在逻辑上保持它们属于当前组件树。子节点仍然与组件的信号、生命周期和清理机制保持连接。当组件卸载时，传送的内容会自动从目标容器中移除。

```jsx
import { Teleport } from "kiaao";

function Modal() {
  const [open, setOpen] = use(false);

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)}>Toggle</button>
      <div when={open}>
        <Teleport to="#modal-root">
          <div class="modal">This is rendered inside #modal-root.</div>
        </Teleport>
      </div>
    </div>
  );
}
```

The `to` prop accepts a CSS selector string or a DOM element. If the target does not exist at mount time, `Teleport` renders a placeholder comment node. The content is moved when the target becomes available, or cleaned up when the component unmounts.

`to` 属性接受 CSS 选择器字符串或 DOM 元素。如果挂载时目标不存在，`Teleport` 会渲染一个占位注释节点。当目标可用时内容被移入，或当组件卸载时被清理。

---

## `lazy` / 代码拆分

`lazy(fn)` wraps a dynamically imported component for code splitting. It returns a proxy component that renders a placeholder comment node until the module loads, then replaces it with the real component. `lazy` itself is a synchronous component — the asynchronous loading happens outside the component function.

`lazy(fn)` 包装动态导入的组件以实现代码拆分。它返回一个代理组件，在模块加载期间渲染占位注释节点，完成后替换为真实组件。`lazy` 本身是同步组件——异步加载发生在组件函数外部。

```jsx
import { lazy } from "kiaao";

const HeavyProfile = lazy(() => import("./HeavyProfile"));

function App() {
  return <HeavyProfile userId={42} />;
}
```

For components that need to `await` data before rendering, see Async Components. `lazy` is specifically for code splitting — it does not support `await` inside the component function.

对于需要在渲染前 `await` 数据的组件，参见异步组件。`lazy` 专门用于代码拆分——它不支持在组件函数内部使用 `await`。

---

## Async Components / 异步组件

A component function that returns a Promise is an async component. The framework automatically wraps it in a transparent container and defers `onMount` until the promise resolves. This is a first-class feature, not a wrapper API — just return a Promise from your component.

返回 Promise 的组件函数即为异步组件。框架自动将其包裹在透明容器中，并将 `onMount` 延迟到 Promise resolve 之后。这是一等公民特性，而非包装 API——直接从组件中返回 Promise 即可。

```jsx
async function DataLoader(props, { onMount }) {
  const data = await fetch("/api");
  onMount(() => console.log("ready"));
  return <div>{data}</div>;
}
```

See the full guide for details on wrapper behavior, mount order, error handling, and SSR limitations.

完整的异步组件指南涵盖 wrapper 行为、挂载顺序、错误处理和 SSR 限制。

- [Async Components / 异步组件](./async-components.md)

---

Now that you know how to build components, learn about control flow for conditional and list rendering. / 现在你知道了如何构建组件，继续了解条件渲染和列表渲染的控制流。

- [Control Flow / 控制流](./control-flow.md)
- [Lifecycle / 生命周期](./lifecycle.md)
- [SSR / 服务端渲染](./ssr.md)
