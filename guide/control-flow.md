# Control Flow / 控制流

In kiaao, conditional rendering and list rendering are achieved through `when` and `each` attributes on native DOM elements. There are no `<Show>` or `<For>` wrapper components. The host element always exists in the DOM — only its children are dynamically managed.

在 kiaao 中，条件渲染和列表渲染通过原生 DOM 元素上的 `when` 和 `each` 属性实现。没有 `<Show>` 或 `<For>` 这样的包装组件。宿主元素始终存在于 DOM 中——只有其子节点被动态管理。

`when` and `each` work only on native HTML elements (string tags). They cannot be used on component functions. If you need conditional or list rendering inside a component, apply the attribute to an element returned by that component.

`when` 和 `each` 仅对原生 HTML 元素（字符串标签）生效，不能在组件函数上使用。如果需要在组件内部进行条件或列表渲染，请将指令应用在组件返回的元素上。

---

## `when` — Conditional Rendering / 条件渲染

The `when` attribute controls whether the host element's children are rendered. The host element itself stays in the DOM regardless of the condition. `when` accepts a signal (a getter created by `use`) or a plain function. If a signal is passed, changes to that signal automatically update the rendered children. If a plain function is passed, it is evaluated once at initialization and will not be reactive.

`when` 属性控制宿主元素的子节点是否渲染。宿主元素本身始终存在于 DOM 中，不受条件影响。`when` 接受一个信号（由 `use` 创建的 getter）或一个普通函数。如果传入信号，该信号的变化会自动更新渲染的子节点。如果传入普通函数，它只在初始化时执行一次，不会产生响应式更新。

### Boolean Mode / 布尔模式

When the children are anything other than a plain object, `when` operates in boolean mode. If the value of `when` is truthy, the children are rendered. If falsy and an `else` attribute is provided, its result is rendered instead. Otherwise, the children are cleared.

当 children 不是纯对象时，`when` 以布尔模式运行。`when` 的值为 truthy 时渲染子节点；为 falsy 时，如果提供了 `else` 属性则渲染其返回内容，否则清空子节点。

```jsx
const [visible, setVisible] = use(true);

return (
  <div>
    <button onClick={() => setVisible((v) => !v)}>Toggle</button>

    <section when={visible} style="display: contents">
      <span>This appears when visible is true.</span>
    </section>
  </div>
);
```

Children can be a lazy function that returns nodes. The function is only called when `when` becomes truthy.

子节点可以是一个返回节点的惰性函数。该函数仅在 `when` 变为 truthy 时被调用。

```jsx
<section when={visible}>
  {() => {
    // This runs only when visible becomes true / 仅在 visible 变为 true 时执行
    return <span>Dynamic content</span>;
  }}
</section>
```

### Map Mode / 映射表模式

When the children are a plain object `{ [key]: () => VNode }`, `when` treats its value as a key. It looks up the key in the map and calls the matched function to render. If no key matches and an `else` is provided, `else` is rendered. Otherwise, children are cleared.

当 children 是一个纯对象 `{ [key]: () => VNode }` 时，`when` 将其值作为 key 在映射表中查找，调用匹配的函数进行渲染。如果无匹配 key 且提供了 `else`，则渲染 `else`；否则清空。

```jsx
const [status, setStatus] = use("loading");

return (
  <div when={status} else={() => <div>Unknown state</div>}>
    {{
      loading: () => <Spinner />,
      error: () => <ErrorMessage />,
      success: () => <Content />,
    }}
  </div>
);
```

Each branch function is called lazily — only when its key is matched for the first time or when the key changes. If the key remains the same across updates, the already-rendered DOM is reused without re-executing the branch function.

每个分支函数都是惰性调用的——仅在其 key 首次匹配或发生切换时执行。如果 key 在更新前后保持不变，已渲染的 DOM 会被复用，不会重新执行分支函数。

---

## `else` — Fallback / 后备内容

The `else` attribute is an optional function that returns fallback content. It works in both boolean mode and map mode. In boolean mode, `else` renders when `when` is falsy. In map mode, `else` renders when the key is not found in the map.

`else` 属性是一个可选函数，返回后备内容。它在布尔模式和映射表模式下均有效。布尔模式下，`when` 为 falsy 时渲染 `else`。映射表模式下，key 在映射表中未找到时渲染 `else`。

```jsx
// Boolean mode with else / 布尔模式带 else
const [isLoggedIn, setLoggedIn] = use(false)

<div when={isLoggedIn} else={() => <LoginButton />}>
  <Dashboard />
</div>

// Map mode with else / 映射表模式带 else
const [status, setStatus] = use('idle')

<div when={status} else={() => <div>Unknown</div>}>
  {{
    idle: () => <Idle />,
    busy: () => <Busy />,
  }}
</div>
```

---

## `each` — List Rendering / 列表渲染

The `each` attribute renders a list of items inside its host element. It accepts a signal that returns any iterable data source: arrays, objects, Maps, Sets, numbers, and strings.

`each` 属性在其宿主元素内部渲染列表。它接受一个返回任意可迭代数据源的信号：数组、对象、Map、Set、数字和字符串。

The `children` of an `each` element must be a render function with the signature `(item, index, key) => Node`.

- `item` — A signal getter for the current item. You can call `item()` to read the value, or pass it to another `use` derivation.
- `index` — The numeric position.
- `key` — The key of the entry in the original data source (array index, object property name, etc.).

`each` 元素的 `children` 必须是一个渲染函数，签名为 `(item, index, key) => Node`。

- `item` — 当前条目的信号 getter。可以调用 `item()` 读取值，或将其传入另一个 `use` 派生。
- `index` — 数字序号。
- `key` — 条目在原始数据源中的键（数组索引、对象属性名等）。

```jsx
const [items, setItems] = use(["a", "b", "c"]);

return (
  <ul each={items}>
    {(item, index) => (
      <li>
        {index}: {item}
      </li>
    )}
  </ul>
);
```

When the data changes, the framework performs incremental updates based on identity. Items with the same identity reuse their DOM nodes (only moved if the position changed). New items create nodes, removed items destroy nodes. This preserves input focus, scroll position, and other DOM state.

数据变化时，框架根据身份标识进行增量更新。同 identity 的条目复用 DOM 节点（仅在位置变化时移动）。新增条目创建节点，消失条目销毁节点。这保证了输入焦点、滚动位置等 DOM 状态的保持。

---

## `key` — Identity / 身份标识

An optional `key` function `(item, index, entryKey) => any` can be provided to customize the identity of each list item. If not specified, the key defaults to the entry's key in the data source (array index, object property name, etc.).

可选的 `key` 函数 `(item, index, entryKey) => any` 用于自定义每个列表项的身份标识。若不指定，则默认为条目在数据源中的键（数组索引、对象属性名等）。

```jsx
const [users, setUsers] = use([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
]);

return (
  <ul each={users} key={(user) => user.id}>
    {(user) => <li>{user().name}</li>}
  </ul>
);
```

Using a stable key (like a database ID) ensures that DOM nodes are correctly reused even when the array is reordered or filtered. This minimizes DOM operations and preserves element state.

使用稳定的 key（如数据库 ID）可以确保即使在数组重排序或过滤后，DOM 节点也能被正确复用。这最大程度减少了 DOM 操作并保持了元素状态。

---

## Data Sources / 数据源

`each` supports multiple data source types. Internally, they are normalized into key-value entries.

`each` 支持多种数据源类型。内部会将它们统一转换为键值条目。

```jsx
// Array / 数组
<each items={[10, 20, 30]}>{(v) => <span>{v}</span>}</each>

// Object / 对象
<each items={() => ({ name: 'kiaao', version: '4.0' })}>
  {(v, i, key) => <dt>{key}: {v}</dt>}
</each>

// Map
<each items={myMap}>{(v, i, key) => <span>{key}</span>}</each>

// Set
<each items={mySet}>{(v) => <span>{v}</span>}</each>

// Number — renders that many items, index as value
// 数字 —— 渲染指定数量的条目，值为索引
<each items={5}>{(_, i) => <span>{i}</span>}</each>

// String — iterates over characters
// 字符串 —— 遍历每个字符
<each items={'hello'}>{(c) => <span>{c}</span>}</each>
```

---

## Notes / 注意事项

- `when` and `each` cannot be used on void elements (`<br>`, `<input>`, `<hr>`, etc.). An error is thrown in development mode.
- `when` 和 `each` 不能在 void 元素（`<br>`、`<input>`、`<hr>` 等）上使用。开发模式下会抛出错误。
- Both attributes only work on native HTML elements. Using them on a component function has no effect.
- 这两个属性仅对原生 HTML 元素生效。在组件函数上使用无效。
- If both `when` and `each` are present on the same element, `when` takes priority. In map mode, `each` is ignored with a warning. In boolean mode, `when` acts as a guard — the list is only rendered when the condition is truthy.
- 如果同一元素上同时存在 `when` 和 `each`，`when` 优先。映射表模式下，`each` 会被忽略并发出警告。布尔模式下，`when` 作为守卫——列表仅在条件为 truthy 时渲染。
- To avoid leaving a wrapper element in the DOM, apply `style="display: contents"` on the host element. This makes the element invisible in layout while preserving lifecycle management.
- 为避免在 DOM 中留下包裹元素，可在宿主元素上设置 `style="display: contents"`。这使得该元素在布局中不可见，同时保留生命周期管理。

---

Now that you understand control flow, learn about component lifecycle. / 现在你了解了控制流，继续学习组件生命周期。

- [Lifecycle / 生命周期](./lifecycle.md)
- [SSR / 服务端渲染](./ssr.md)
- [Router / 路由](./router.md)
