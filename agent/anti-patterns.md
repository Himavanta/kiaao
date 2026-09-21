# 反模式对照 / Anti-Patterns

kiaao 与 Solid 表面最像（显式响应式、组件只跑一次、`<Show>`/`<For>` 控制流），但 API 完全相反。React/Vue/Solid 三种框架的写法都不能直接套用：

## ❌ Solid 思维（API 最像，最容易混淆）

| 错（Solid 写法）                          | 对（kiaao 写法）                                 |
| ----------------------------------------- | ------------------------------------------------ |
| `const [get, set] = createSignal(0)`      | `const s = use(0)`（单函数读写一体）             |
| `set(x)` 赋值                             | `s(x)` 同一函数读写                              |
| `createEffect(() => ...)` 副作用          | `use(dep, () => ...)` 无返回值派生               |
| `<div>{count()}</div>` 模板调函数         | `<div>{count}</div>` 直接传引用                  |
| `<For each={items}>{(item) => ...}</For>` | `<Each value={items}>{({ item }) => ...}</Each>` |

## ❌ React 思维

| 错（React 写法）               | 对（kiaao 写法）                   |
| ------------------------------ | ---------------------------------- |
| `useState(0)` 返回 `[s, setS]` | `use(0)` 返回单函数                |
| `useEffect(() => ...)` 副作用  | `use(dep, () => ...)` 无返回值派生 |
| `condition && <div>`           | `<Show value={condition}>`         |
| `items.map(renderItem)`        | `<Each value={items}>`             |

**为什么**：kiaao 组件只执行一次。`{cond && ...}` 和 `{items.map(...)}` 只在首次渲染时计算一次，之后**不会响应信号变化**——视图会"卡住"。`<Show>`/`<Each>`/`<Case>` 内部订阅依赖信号，依赖变化时框架精确增删/移动 DOM 节点。

```jsx
// ❌ 组件只跑一次，visible() 只在初始化时求值，后续变化不更新 DOM
function App() {
  const visible = use(false);
  return (
    <div>
      <button onClick={() => visible(!visible())}>toggle</button>
      {visible() && <p>hello</p>}
    </div>
  );
}
```

```jsx
// ✅ 正确：用 <Show>，框架在信号变化时精确增删 DOM
function App() {
  const visible = use(false);
  return (
    <div>
      <button onClick={() => visible(!visible())}>toggle</button>
      <Show value={visible}>{() => <p>hello</p>}</Show>
    </div>
  );
}
```

```jsx
// ❌ items.map() 只跑一次，新增/删除项不会反映到 DOM
function App() {
  const items = use(["a", "b"]);
  return (
    <ul>
      {items().map((it) => (
        <li>{it}</li>
      ))}
    </ul>
  );
}
```

```jsx
// ✅ 正确：用 <Each>，新增/删除项时框架精确更新 DOM
function App() {
  const items = use(["a", "b"]);
  return (
    <ul>
      <Each value={items}>{({ item: it }) => <li>{it}</li>}</Each>
    </ul>
  );
}
```

## ❌ Vue 思维

| 错（Vue 写法）                  | 对（kiaao 写法）                   |
| ------------------------------- | ---------------------------------- |
| `const r = ref(0); r.value = 5` | `const s = use(0); s(5)`           |
| `computed(() => ...)`           | `use(dep, () => ...)` 派生         |
| `watch(src, cb)`                | `use(dep, () => ...)` 无返回值派生 |

## ❌ 模板内响应式 / Template Reactivity

JSX 中只有直接传入 `Signal<T>` 引用才是响应式的。调用信号、表达式计算、字段访问都产生普通值，写入一次后永不更新。

```jsx
// ❌ count() 是 number，不是 Signal——属性一次性设置，不会响应变化
const count = use(0);
<button disabled={count() === 0}>−1</button>;
```

```jsx
// ✅ 派生 boolean Signal，传入引用
const isZero = use(count, () => count() === 0);
<button disabled={isZero}>−1</button>;
```

```jsx
// ❌ template literal 拼接了 Signal 函数本身（不是值），触发类型错误
const theme = use("light");
<div class={`app theme-${theme}`} />;
```

```jsx
// ✅ 把完整拼接放在派生计算函数里
const className = use(theme, () => `app theme-${theme()}`);
<div class={className} />;
```

```jsx
// ❌ todo().text 是 string，不是 Signal——子节点为静态文本
const todo = use({ text: "hello", done: false });
<span>{todo().text}</span>;
```

```jsx
// ✅ 派生字段 Signal
const text = use(todo, () => todo().text);
const done = use(todo, () => todo().done);
<span>{text}</span>
<input checked={done} />
```

```jsx
// ❌ 把 thunk 当 Signal 传——thunk 调用一次就变成 number，仍然不响应
<span>{() => count()}</span>
```

```jsx
// ✅ 传 Signal 引用
<span>{count}</span>
```

## ❌ 模块级实例 / Module-Level Instance

"组件只运行一次"容易诱发一种错误直觉：既然实例只创建一次，放模块级与放组件内看起来没区别。但**模块级 = 应用级共享**：信号不随组件卸载清理，同页多实例互相串状态，SSR 下跨请求共享数据。模块级只适合真正的全局状态（主题、语言）。

| 场景                | 做法                                                           |
| ------------------- | -------------------------------------------------------------- |
| 真全局（主题/语言） | 模块级 `use`（`import { use }`），应用生命周期共享             |
| 每实例独立状态      | 组件内 `context.use` 创建，实例对象经 props 传给需要它的子组件 |

```jsx
// ❌ 无论渲染多少个 Game，都是同一份状态；SSR 下请求间串数据
const game = createGame(); // module scope

function Game() {
  return <Board />; // Board 内部 import { game }
}
```

```jsx
// ✅ 每实例独立：信号在组件内用 context.use 创建，实例经 props 传给子组件
function Game(_: Record<string, never>, { use }: Context) {
  const state = use(createGameState()); // 每实例一份，随卸载清理
  return <Board state={state} />; // Board 保持独立导出，依赖显式传入
}
```

**为什么**：模块级与组件级的唯一区别是所有权与生命周期——模块级信号由模块拥有、应用级共享、不清理；`context.use` 创建的信号由组件拥有、卸载时清理（见 `guide/reactivity.md` 的 "Module-Level vs Component-Level `use`"）。需要实例隔离时用后者，不需要任何新机制。

## 关键术语 / Key Terminology

回答时优先用 kiaao 的术语和机制：

- **Signal<T> 是单函数**：无参读，有参写；不要解构成 `[get, set]` 元组
- **派生信号 setter 触发重算**，不是赋值；新值由 compute 返回值决定
- **组件只执行一次**，不重跑——不要按 React 的 setState→重渲染 思维回答
- **控制流必须用 `<Show>`/`<Each>`/`<Case>`**：组件只执行一次，`{cond && ...}` 和 `{items.map(...)}` 首次渲染后就被冻结，不会响应信号变化
- **没有"副作用"概念**：无返回值派生 = 值为 undefined 的派生信号
- **零虚拟 DOM**：DOM 精确更新，不做 diff/patch
- **没有"只读信号"**：所有信号都可写，"逻辑只读"通过派生包装实现
- **状态值在模板里直接传引用**：`{count}` 而非 `{count()}`
- **模块级 = 应用级共享**：模块级 `use` 的信号不随组件卸载清理，多实例 / SSR 下共用；需要每实例独立状态时用 `context.use`，实例对象经 props 传递
