# kiaao 框架规范 v1.4

**宣传语**：更少的概念，更少的编译，更多的代码，更高的性能。

**设计哲学**：把响应式的本质（谁依赖谁）从框架的隐性机制，变成开发者的显性承诺。以最少的 API 和最少的概念，在纯运行时直接兑现细粒度更新。

---

## 零、架构原则

### 信号独立性原则

`define` 创建的信号是完全独立于组件树的值容器。信号不绑定在任何组件实例上，可以在模块顶层、闭包内或任何 JavaScript 作用域中创建和持有。信号的依赖绑定直接发生在信号和消费方（DOM 节点、`effect`、`derive`）之间，不经过组件层级。

### 依赖直接绑定原则

当消费方通过 `getter(selector)` 创建订阅时，该订阅直接向信号注册。更新时，信号直接触发消费方的更新闭包，中间组件不参与、不重跑、不转发。组件树只决定 DOM 的挂载结构，不决定数据的流动路径。

### 闭包即作用域原则

组件实例隔离和局部作用域通过 JavaScript 原生闭包实现。工厂函数每次调用创建独立的闭包和信号，返回的组件函数共享这些信号。框架不提供额外的 `Context`、`provide/inject` 等作用域管理 API。原生语言能力已足够。

---

## 一、核心 API（4 个）

### `define<T>(initialValue: T): [Getter<T>, Setter<T>]`

创建响应式状态。唯一的状态原语，不区分基本类型和对象。

```javascript
const [count, setCount] = define(0);
const [user, setUser] = define({ name: "tom", age: 18 });
```

#### Getter：`value(selector?)`

- **不传参**：返回当前全量快照（立即求值）。
- **传选择器函数**：返回一个**响应式派生函数**。该函数在被调用时才执行选择器并返回当前值，同时自动收集依赖。返回的函数携带 `IS_REACTIVE` 标记，供 `h()` 识别。

```javascript
value(); // 全量快照（立即求值）
value((v) => v.name); // 返回派生函数，延迟求值，精准订阅 name
value((v) => v.age >= 18); // 返回派生函数，就地计算逻辑
```

**重要行为**：`value(selector)` 不立即求值，而是返回一个函数。该函数在每次调用时执行选择器逻辑并返回结果，以此保持依赖追踪的活性。

**Getter 引用稳定性**：Getter 函数引用在组件生命周期内保持稳定。子组件在初始化时通过 props 或闭包接收父组件的 getter，并通过 `getter(selector)` 创建针对该信号的局部订阅。该订阅直接向信号注册，与中间组件无关。更新时中间组件不重跑。

#### Setter：`setValue(updater)`

- **传新值**：直接替换内部状态。
- **传函数**：接收旧值，返回新值。

```javascript
setCount(456);
setCount((prev) => prev + 1);
setUser((prev) => ({ ...prev, age: prev.age + 1 }));
```

**数据纯净度**：内部存储的是纯普通对象/基本类型。任何时候拿到的都是普通值，无 Proxy，无 getter/setter 劫持。更新采用不可变替换，但框架不依赖引用对比触发更新，而是依赖选择器函数的结果对比。

**内部标记**：Getter 的 `value(selector)` 返回的函数以及 `derive` 返回的函数，均挂载 `Symbol('is_reactive')` 属性（常量 `IS_REACTIVE`），供 `h()` 识别。

---

### `derive<T>(computeFn: () => T): () => T`

创建派生状态。带缓存和脏标记。上游变化时仅标记脏，下游读取时才计算。计算结果相同时拦截下游更新。

```javascript
const double = derive(() => count() * 2);
const activeUsers = derive(() => users().filter((u) => u.active));
```

**内部机制**：

- `derive` 内部使用 `effect` 监听其所依赖的上游信号。
- 上游变化时，内部 `effect` 回调执行，标记 `isDirty = true`，并通知下游订阅者。
- 当派生函数被调用时，若脏则重新计算并缓存，然后清除脏标记；若干净则直接返回缓存值。
- 多个上游同时变化时，仅标记一次脏，避免重复通知。
- `derive` 返回的函数同样带有 `IS_REACTIVE` 标记，能被 `h()` 识别。
- 派生函数上挂载 `STOP_KEY` 用于清理内部 `effect`。

**与 Getter 的区别**：Getter 的选择器返回的是无缓存的派生函数，每次调用都执行选择器；`derive` 返回的函数带缓存和拦截，用于重度计算或多处复用。

---

### `effect(fn: () => void): () => void`

执行副作用，自动收集 `fn` 内部触发的所有依赖。依赖变化且对账通过后重新执行。返回一个停止函数，调用后取消该 effect。

```javascript
const stop = effect(() => {
  localStorage.setItem(
    "token",
    user((v) => v.token),
  );
});
// 需要清理时
stop();
```

**执行上下文**：`currentEffect` 为栈结构，支持 `effect` 嵌套。每次 `effect` 执行时压栈，执行后弹出。

**与 `derive` 的区别**：`derive` 是纯计算（有返回值，有缓存），`effect` 是无返回值的副作用。

---

### `h(tag, props?, ...children): HTMLElement`

统一创建函数。根据第一个参数的类型，分两种模式：

#### DOM 模式（`tag` 为字符串）

创建真实 DOM 元素。与 Vite 默认 JSX 转换对接。对 `children` 进行**递归扁平化**（自动展开嵌套数组）。对每个子节点：

- 若为响应式函数（携带 `IS_REACTIVE` 标记）：创建文本占位，并通过 `effect` 绑定动态更新。
- 若为 DOM 节点：直接附加。
- 若为其他值：转为字符串后创建静态文本节点。

#### 组件模式（`tag` 为函数）

将 `tag` 视为组件函数：

1. 创建新的组件实例，压入 `currentComponent` 栈。
2. 执行 `tag(props)`，传入的 `props` 即为第二个参数（若无则传空对象）。
3. 函数返回真实 DOM 节点（或由控制流组件返回的占位/组合节点）。
4. 组件实例出栈，恢复父组件上下文。
5. 返回该 DOM 节点。

这种设计使得 JSX 编译后的 `h(Component, props)` 与纯 `h()` 调用都能统一处理。

**类型签名**：

```typescript
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | ((props: any) => any),
  props?: any,
  ...children: any[]
): HTMLElement;
```

**使用示例**：

```javascript
// DOM 模式
h(
  "div",
  { class: "card" },
  h(
    "h1",
    null,
    user((v) => v.name),
  ),
  h(
    "p",
    null,
    "年龄：",
    user((v) => v.age),
  ),
);

// 组件模式
h(Show, { when: visible, children: () => h("div", null, "可见内容") });
```

JSX 写法（编译后自动转为对应的 `h` 调用）：

```jsx
<div class="card">
  <h1>{user(v => v.name)}</h1>
  <p>年龄：{user(v => v.age)}</p>
</div>

<Show when={visible}>
  {() => <div>可见内容</div>}
</Show>
```

---

## 二、控制流组件（2 个）

### `<Show when={...} fallback={...}>`

条件渲染。`when` 可以是响应式函数（`IS_REACTIVE`）或普通函数。`fallback`、`children` 均接收函数（惰性求值），以支持分支完全重建。

```jsx
<Show when={visible} fallback={() => <p>无数据</p>}>
  {() => <Dashboard />}
</Show>
```

```javascript
// 纯 h 调用
h(Show, { when: visible, children: () => h("div", null, "内容") });
```

`when` 为响应式函数时直接传入，`Show` 内部通过 `when()` 获取当前值并自动依赖追踪。若需要逻辑转换，可使用普通函数包裹：

```javascript
h(Show, { when: () => count() > 0, children: ... })
```

函数签名：

```ts
function Show(props: {
  when: (() => any) | ReactiveFunction;
  fallback?: () => any;
  children?: () => any;
}): Node;
```

### `<List each={...} key={...}>`

列表渲染。`each` 接收返回数组的 getter/derive 函数。`key` 为函数 `(item, index) => any`。`children` 为函数 `(item, index) => any`。

```jsx
<List each={() => items()} key={(item) => item.id}>
  {(item) => <li>{item.text}</li>}
</List>
```

函数签名：

```ts
function List<T>(props: {
  each: () => T[];
  key: (item: T, index: number) => any;
  children: (item: T, index: number) => any;
}): Node;
```

---

## 三、生命周期与挂载辅助

### `onMount(fn: () => void): void`

组件首次挂载到 DOM 后执行一次。必须在组件外壳同步执行期间调用，通过当前组件实例栈注册。

### `onUnmount(fn: () => void): void`

组件销毁前执行，用于清理定时器、取消订阅等。必须在组件外壳同步执行期间调用。

```javascript
function Timer() {
  const [time, setTime] = define(new Date());
  const timer = setInterval(() => setTime(new Date()), 1000);
  onUnmount(() => clearInterval(timer));
  return h(
    "div",
    null,
    time((v) => v.toLocaleTimeString()),
  );
}
```

**内部机制**：`currentComponent` 为组件实例栈。组件函数执行前（通过 `h` 的组件模式）压栈，执行后出栈。`onMount`/`onUnmount` 将回调注册到栈顶实例的队列中。

### 挂载辅助函数

由于 kiaao 不自行入侵 DOM，需要显式挂载来触发生命周期。提供两个轻量工具：

#### `mount(root: HTMLElement, container: HTMLElement): void`

将 `root` 添加到 `container` 中，并递归触发所有待执行的 `onMount` 回调。应在创建组件树后调用。

#### `unmount(root: HTMLElement): void`

从 DOM 中移除 `root`，并递归执行所有 `onUnmount` 回调，清理所有关联的 effect。通常在销毁组件时调用。

```javascript
const root = Timer();
mount(root, document.body);

// 后续卸载
unmount(root);
```

这两个函数不是响应式核心，但是确保生命周期正确触发的必要工具。不影响框架 API 的核心概念数。

---

## 四、组件模型

### 组件函数只执行一次

```javascript
function UserProfile() {
  const [user, setUser] = define({ name: "tom", age: 18 });

  return h(
    "div",
    null,
    h(
      "h1",
      null,
      user((v) => v.name),
    ),
    h(
      "p",
      null,
      "年龄：",
      user((v) => v.age),
    ),
    h("button", { onClick: () => setUser((prev) => ({ ...prev, age: prev.age + 1 })) }, "长大一岁"),
  );
}
```

- 没有返回渲染函数，直接返回由 `h()` 创建的真实 DOM 节点。
- 状态变化时，组件函数不重新执行，只有被响应式函数绑定的具体 DOM 文本节点原地更新。

### 多实例隔离（推荐模式）

当同一组件需要多个独立实例，且每个实例需要私有信号时，使用工厂函数闭包：

```javascript
function createForm() {
  const [formData, setFormData] = define({ name: "", email: "" });

  function FormInput({ field, label }) {
    return h(
      "div",
      null,
      h("label", null, label),
      h("input", {
        value: formData((v) => v[field]),
        onInput: (e) => setFormData((prev) => ({ ...prev, [field]: e.target.value })),
      }),
    );
  }

  return function Form() {
    return h(
      "form",
      null,
      FormInput({ field: "name", label: "姓名" }),
      FormInput({ field: "email", label: "邮箱" }),
    );
  };
}

const MyForm1 = createForm();
const MyForm2 = createForm();
```

每次 `createForm()` 调用创建独立的闭包和信号，实例之间完全隔离。子组件通过闭包直接访问信号，无需 props 逐层转发。

---

## 五、渲染机制

### 初始化流程

1. 用户调用组件函数（或通过 `h(Component)`），创建组件实例并压栈。
2. 执行组件外壳一次。
3. 遇到 `define()` 创建信号。
4. 遇到 `user(v => v.name)` 时返回一个携带 `IS_REACTIVE` 的派生函数，作为参数传给 `h()`。
5. `h()` 检测到子节点是响应式函数，创建文本节点占位，启动 `effect` 绑定（完成首次求值和依赖收集）。
6. 返回真实 DOM 树，组件实例出栈。
7. 用户调用 `mount(root, container)` 将 DOM 挂载到页面，并触发 `onMount` 回调。

### 更新流程

1. `setUser(prev => ({ ...prev, age: 19 }))` 被调用。
2. **先保存旧值引用**，再写入新值。
3. 遍历该信号的所有选择器依赖。
4. 对每个依赖：用旧值执行选择器 → 用新值执行选择器 → 使用 `!==` 浅对比。
5. 结果不同 → 触发对应的 `effect` 重新执行（DOM 更新或 `effect` 回调）。
6. DOM 更新是单点文本节点替换，无虚拟 DOM Diff，无组件重跑。

### 无虚拟 DOM

- 不创建 VNode 树，不进行树形 Diff 算法。
- DOM 更新是直接的 `textNode.textContent = newValue`。

---

## 六、依赖收集与调度

### 全局上下文

- `currentEffect`：**栈结构**，支持 `effect` 嵌套。`effect` 执行时压栈，执行后弹出。
- `currentComponent`：**栈结构**，支持组件嵌套。`h()` 处理函数组件时压栈，执行后弹出。

### 依赖图谱结构

每个信号内部维护：`deps = Set<{ selectorFn, effect }>`。

- `selectorFn` 是用户传入的选择器函数。
- **键使用 `selectorFn` 的函数引用**，不使用 `toString()`。配合信号内部唯一 ID 避免跨信号冲突。

### 对账机制

更新时对每个依赖用旧值和新值分别执行 `selectorFn`，使用 `!==` 浅对比。只有结果不同才触发 `effect`。

---

## 七、Effect 清理与组件卸载

### Effect 清理

- 每次 `effect(fn)` 调用返回一个停止函数 `stop()`。
- 调用 `stop()` 会将该 effect 从所有它依赖的信号中移除，并标记为失效。
- 组件实例上维护一个 `effectStops: Set<() => void>`，收集该组件内所有通过 `h()` 动态绑定和显式 `effect()` 创建的 effect 返回的 `stop` 函数。

### 组件卸载

- 每个组件返回的根 DOM 节点上挂载 `Symbol('dispose')` 方法。
- 当用户调用 `unmount(root)` 时：
  1. 执行所有 `onUnmount` 回调。
  2. 遍历 `effectStops`，调用每个 `stop()` 清理 effect。
  3. 递归处理子组件。
  4. 从 DOM 中移除节点。
- `unmount` 函数正是基于此 `DISPOSE_KEY` 递归执行清理。

---

## 八、内部标记（Symbol 键）

框架在所有外部对象上使用 `Symbol` 键存储内部数据，避免命名冲突和调试干扰：

| Symbol            | 挂载位置                               | 用途                                 |
| ----------------- | -------------------------------------- | ------------------------------------ |
| `IS_REACTIVE`     | Getter 选择器返回的函数 / DeriveSignal | 标识响应式函数，供 `h()` 识别        |
| `DISPOSE_KEY`     | DOM 节点                               | 存储组件销毁函数                     |
| `INSTANCE_KEY`    | DOM 节点                               | 存储组件实例引用                     |
| `EFFECTS_KEY`     | 组件实例                               | 存储 effect 的 `stop` 函数集合       |
| `INITIALIZED_KEY` | 组件实例                               | 标记已初始化                         |
| `DISPOSED_KEY`    | 组件实例                               | 标记已销毁                           |
| `STOP_KEY`        | derive 返回的函数                      | 存储停止内部 effect 的函数，用于清理 |

---

## 九、跨组件通信与 Store

### 模块级 Store（全局共享）

`define` 创建的信号是独立的值容器，可直接放在模块顶层。任何组件通过 `import` 引入并按需订阅：

```javascript
// store.js
export const [user, setUser] = define({ name: "tom" });
export const [theme, setTheme] = define("dark");
```

组件中直接使用：

```javascript
import { user, theme } from "./store.js";

function Header() {
  return h(
    "header",
    { class: theme((v) => `header-${v}`) },
    h(
      "span",
      null,
      user((v) => v.name),
    ),
  );
}
```

### Props 传递 getter

父组件可将 getter 函数引用通过 props 传给子组件。由于组件只执行一次，props 仅在初始化时传递一次。子组件调用 `getter(selector)` 创建直接向信号注册的局部订阅，中间组件不参与更新。

### 无 Context / provide-inject

kiaao 不提供 `Context`、`provide`、`inject` 等跨层级通信 API。信号的独立性、闭包的原生能力、以及模块机制，已覆盖所有跨层级共享场景。框架不在此之上增加抽象。

---

## 十、TypeScript 核心类型

```typescript
interface Getter<T> {
  (): T;
  <R>(selector: (value: T) => R): () => R;
}

interface Setter<T> {
  (newValue: T): T;
  (updater: (prev: T) => T): T;
}

interface ReactiveFunction {
  (): any;
  [IS_REACTIVE]?: true;
}

function define<T>(initialValue: T): [Getter<T>, Setter<T>];
function derive<T>(computeFn: () => T): () => T;
function effect(fn: () => void): () => void;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | ((props: any) => any),
  props?: any,
  ...children: any[]
): HTMLElement;

function mount(root: HTMLElement, container: HTMLElement): void;
function unmount(root: HTMLElement): void;
```

---

## 十一、API 总览

| API         | 分类     | 用途                                             |
| ----------- | -------- | ------------------------------------------------ |
| `define`    | 核心     | 创建响应式状态（唯一原语）                       |
| `derive`    | 核心     | 派生状态（缓存 + 拦截）                          |
| `effect`    | 核心     | 副作用执行（自动收集依赖），返回停止函数         |
| `h`         | 渲染     | 创建真实 DOM 或调用函数组件，自动扁平化 children |
| `<Show>`    | 控制流   | 条件渲染（when 支持响应式函数）                  |
| `<List>`    | 控制流   | 列表渲染                                         |
| `onMount`   | 生命周期 | 挂载后回调（需配合 mount 触发）                  |
| `onUnmount` | 生命周期 | 销毁前清理（需配合 unmount 触发）                |
| `mount`     | 挂载     | 将组件树挂载到容器并触发 onMount                 |
| `unmount`   | 挂载     | 卸载组件树并触发 onUnmount，清理所有 effect      |

**核心概念仍为 4 个（define、derive、effect、h），挂载辅助函数是显式化生命周期的必要工具，不计入核心响应式概念。**

---

## 十二、与主流框架差异

| 维度            | React              | Vue               | Solid          | **kiaao**              |
| --------------- | ------------------ | ----------------- | -------------- | ---------------------- |
| 数据纯净度      | 纯净               | 不纯净            | 纯净（两套）   | **纯净（一套）**       |
| 组件运行次数    | 每次重跑           | 外壳一次          | 外壳一次       | **外壳一次**           |
| 虚拟 DOM        | 有                 | 有                | 无             | **无**                 |
| 编译器依赖      | 无                 | 可选              | 强依赖         | **无**                 |
| 响应式原理      | 无                 | Proxy             | 编译期         | **显式选择器**         |
| 核心概念数      | 10+                | 8+                | 6+             | **4**                  |
| 更新粒度        | 组件级             | 组件/块级         | DOM 节点级     | **选择器结果级**       |
| Context/Provide | 有                 | 有                | 有             | **无（信号即通道）**   |
| 挂载方式        | 自动（createRoot） | 自动（createApp） | 自动（render） | **显式 mount/unmount** |

---

## 十三、代码量估算

| 模块                               | 预计行数          |
| ---------------------------------- | ----------------- |
| `define`                           | 40-50             |
| `derive`                           | 25                |
| `effect`                           | 20                |
| `h` (含组件模式与 children 扁平化) | 45-55             |
| 全局上下文与调度                   | 30                |
| `<Show>`                           | 25                |
| `<List>`                           | 35                |
| 生命周期钩子                       | 15                |
| 组件实例与清理（含 mount/unmount） | 30                |
| TypeScript 类型定义                | 35                |
| **总计**                           | **约 300-350 行** |

---

## 十四、待实现（V2+）

- 异步支持：`asyncResource`、微任务批处理调度器
- `<Suspense>` 完整实现
- SSR 支持
- DevTools：依赖图谱可视化

---

## 十五、禁止事项

- 不使用 Proxy
- 不引入虚拟 DOM
- 不依赖编译插件（Vite 默认 JSX 转换已足够）
- 不为不同类型的数据提供不同 API
- 不强制要求用户使用编译器
- 不提供 Context / provide-inject 机制（信号独立于组件树已消除其必要性）
