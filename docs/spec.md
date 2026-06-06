# kiaao 框架规范 v1.1

**宣传语**：更少的概念，更少的编译，更多的代码，更高的性能。

**设计哲学**：把响应式的本质（谁依赖谁）从框架的隐性机制，变成开发者的显性承诺。以最少的 API 和最少的概念，在纯运行时直接兑现细粒度更新。

---

## 一、核心 API（4 个）

### `define<T>(initialValue: T): [Getter<T>, Setter<T>]`

创建响应式状态。唯一的状态原语，不区分基本类型和对象。

```javascript
const [count, setCount] = define(0);
const [user, setUser] = define({ name: "tom", age: 18 });
```

#### Getter：`value(selector?)`

- **不传参**：返回当前全量快照。
- **传选择器函数**：执行 `selector(currentValue)` 返回局部数据，同时自动收集依赖。

```javascript
value(); // 全量快照
value((v) => v.name); // 精准订阅 name
value((v) => v.age >= 18); // 就地计算
```

#### Setter：`setValue(updater)`

- **传新值**：直接替换内部状态。
- **传函数**：接收旧值，返回新值。

```javascript
setCount(456);
setCount((prev) => prev + 1);
setUser((prev) => ({ ...prev, age: prev.age + 1 }));
```

**数据纯净度**：内部存储的是纯普通对象/基本类型。任何时候拿到的都是普通值，无 Proxy，无 getter/setter 劫持。更新采用不可变替换，但框架不依赖引用对比触发更新，而是依赖选择器函数的结果对比。

**内部标记**：Getter 和 `derive` 返回的函数均挂载 `Symbol('is_reactive')` 属性，供 `h()` 识别。

---

### `derive<T>(computeFn: () => T): () => T`

创建派生状态。带缓存和脏标记。上游变化时仅标记脏，下游读取时才计算。计算结果相同时拦截下游更新。

```javascript
const double = derive(() => count() * 2);
const activeUsers = derive(() => users().filter((u) => u.active));
```

**与 Getter 的区别**：Getter 是纯转发，每次调用都执行选择器。`derive` 带缓存和拦截，用于重度计算或多处复用。

**内部订阅**：`derive` 使用 `effect` 监听上游，多个上游同时变化时只标记一次脏，避免重复通知。

---

### `effect(fn: () => void): void`

执行副作用，自动收集 `fn` 内部触发的所有依赖。依赖变化且对账通过后重新执行。

```javascript
effect(() => {
  localStorage.setItem(
    "token",
    user((v) => v.token),
  );
});
```

**与 `derive` 的区别**：`derive` 是纯计算（有返回值，有缓存），`effect` 是无返回值的副作用。

**执行上下文**：`currentEffect` 为栈结构，支持嵌套 effect。

---

### `h(tag, props?, ...children): HTMLElement`

纯运行时创建真实 DOM。与 Vite 默认 JSX 转换对接。若子节点是 Getter 或 DeriveSignal 函数（通过 `IS_REACTIVE` 标记识别），自动创建文本占位并启动 `effect` 绑定。

```javascript
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
```

JSX 写法（编译后自动转为 `h` 调用）：

```jsx
<div class="card">
  <h1>{user((v) => v.name)}</h1>
  <p>年龄：{user((v) => v.age)}</p>
</div>
```

---

## 二、控制流组件（2 个）

### `<Show when={...} fallback={...}>`

条件渲染。`when`、`fallback`、`children` 均接收函数（惰性求值），以支持分支完全重建。

```jsx
<Show when={() => visible()} fallback={() => <p>无数据</p>}>
  {() => <Dashboard />}
</Show>
```

函数签名：

```ts
function Show(props: { when: () => any; fallback?: () => any; children?: () => any }): Node;
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

## 三、生命周期（2 个）

### `onMount(fn: () => void): void`

组件首次挂载到 DOM 后执行一次。必须在组件外壳同步执行期间调用，通过当前组件实例栈注册。

### `onUnmount(fn: () => void): void`

组件销毁前执行，用于清理定时器、取消订阅等。必须在组件外壳同步执行期间调用。

```javascript
function Timer() {
  const [time, setTime] = define(new Date());
  const timer = setInterval(() => setTime(new Date()), 1000);
  onUnmount(() => clearInterval(timer));
  return <div>{time((v) => v.toLocaleTimeString())}</div>;
}
```

**内部机制**：`currentComponent` 为组件实例栈。组件函数执行前压栈，执行后出栈。`onMount`/`onUnmount` 将回调注册到栈顶实例的队列中。

---

## 四、组件模型

### 组件函数只执行一次

```javascript
function UserProfile() {
  const [user, setUser] = define({ name: "tom", age: 18 });

  return (
    <div>
      <h1>{user((v) => v.name)}</h1>
      <p>年龄：{user((v) => v.age)}</p>
      <button onClick={() => setUser((prev) => ({ ...prev, age: prev.age + 1 }))}>长大一岁</button>
    </div>
  );
}
```

- 没有返回渲染函数，直接返回由 `h()` 创建的真实 DOM 节点。
- 状态变化时，组件函数不重新执行，只有被选择器绑定的具体 DOM 文本节点原地更新。

---

## 五、渲染机制

### 初始化流程

1. 执行组件外壳一次。
2. 遇到 `define()` 创建信号。
3. 遇到 `user(v => v.name)` 时立即求值并作为参数传给 `h()`。
4. `h()` 检测到子节点是响应式函数（`IS_REACTIVE`），创建文本节点占位，启动 `effect` 绑定。
5. 返回真实 DOM 树，挂载到页面。

### 更新流程

1. `setUser(prev => ({ ...prev, age: 19 }))` 被调用。
2. **先保存旧值引用**，再写入新值。
3. 遍历该信号的所有选择器依赖。
4. 对每个依赖：用旧值执行选择器 → 用新值执行选择器 → 使用 `!==` 浅对比。
5. 结果不同 → 触发对应的 effect（DOM 更新或 `effect` 回调）。
6. DOM 更新是单点文本节点替换，无虚拟 DOM Diff，无组件重跑。

### 无虚拟 DOM

- 不创建 VNode 树，不进行树形 Diff 算法。
- DOM 更新是直接的 `textNode.textContent = newValue`。

---

## 六、依赖收集与调度

### 全局上下文

- `currentEffect`：**栈结构**，支持 effect 嵌套。
- `currentComponent`：**栈结构**，支持组件嵌套。
- `effect` 执行时压栈 `currentEffect`，执行后弹出。
- 组件函数执行前将组件实例压入 `currentComponent`，执行后弹出。

### 依赖图谱结构

每个信号内部维护：`deps = Set<{ selectorFn, effect }>`。**键使用 `selectorFn` 函数引用**，不使用 `toString()`。配合信号内部唯一 ID 避免跨信号冲突。

### 对账机制

更新时对每个依赖用旧值和新值分别执行 `selectorFn`，使用 `!==` 浅对比。只有结果不同才触发 effect。

---

## 七、内部标记（Symbol 键）

框架在所有外部对象上使用 `Symbol` 键存储内部数据：

| Symbol            | 挂载位置                   | 用途                          |
| ----------------- | -------------------------- | ----------------------------- |
| `IS_REACTIVE`     | Getter / DeriveSignal 函数 | 标识响应式函数，供 `h()` 识别 |
| `DISPOSE_KEY`     | DOM 节点                   | 存储组件销毁函数              |
| `INSTANCE_KEY`    | DOM 节点                   | 存储组件实例引用              |
| `EFFECTS_KEY`     | 组件实例                   | 存储 effect 清理队列          |
| `INITIALIZED_KEY` | 组件实例                   | 标记已初始化                  |
| `DISPOSED_KEY`    | 组件实例                   | 标记已销毁                    |

---

## 八、上下文与 Store（0 个额外 API）

不提供 `provide`/`inject` 或 `createContext`。Store 就是放在模块顶层或通过闭包共享的 `define` 信号。跨组件通信通过 `props` 或直接引用模块级信号完成。

---

## 九、TypeScript 核心类型

```typescript
interface Getter<T> {
  (): T;
  <R>(selector: (value: T) => R): R;
}

interface Setter<T> {
  (newValue: T): T;
  (updater: (prev: T) => T): T;
}

function define<T>(initialValue: T): [Getter<T>, Setter<T>];
function derive<T>(computeFn: () => T): () => T;
function effect(fn: () => void): void;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Partial<HTMLElementTagNameMap[K]> | null,
  ...children: any[]
): HTMLElementTagNameMap[K];
```

---

## 十、API 总览

| API         | 分类     | 用途                       |
| ----------- | -------- | -------------------------- |
| `define`    | 核心     | 创建响应式状态（唯一原语） |
| `derive`    | 核心     | 派生状态（缓存 + 拦截）    |
| `effect`    | 核心     | 副作用执行（自动收集依赖） |
| `h`         | 渲染     | 纯运行时创建真实 DOM       |
| `<Show>`    | 控制流   | 条件渲染                   |
| `<List>`    | 控制流   | 列表渲染                   |
| `onMount`   | 生命周期 | 挂载后回调                 |
| `onUnmount` | 生命周期 | 销毁前清理                 |

**总计 8 个 API，用户可见的核心概念仅 4 个（define、derive、effect、h）。**

---

## 十一、与主流框架差异

| 维度         | React    | Vue       | Solid        | **kiaao**        |
| ------------ | -------- | --------- | ------------ | ---------------- |
| 数据纯净度   | 纯净     | 不纯净    | 纯净（两套） | **纯净（一套）** |
| 组件运行次数 | 每次重跑 | 外壳一次  | 外壳一次     | **外壳一次**     |
| 虚拟 DOM     | 有       | 有        | 无           | **无**           |
| 编译器依赖   | 无       | 可选      | 强依赖       | **无**           |
| 响应式原理   | 无       | Proxy     | 编译期       | **显式选择器**   |
| 核心概念数   | 10+      | 8+        | 6+           | **4**            |
| 更新粒度     | 组件级   | 组件/块级 | DOM 节点级   | **选择器结果级** |

---

## 十二、代码量估算

| 模块                | 预计行数          |
| ------------------- | ----------------- |
| `define`            | 40-50             |
| `derive`            | 20                |
| `effect`            | 15                |
| `h`                 | 30-40             |
| 全局上下文与调度    | 30                |
| `<Show>`            | 25                |
| `<List>`            | 35                |
| 生命周期钩子        | 15                |
| TypeScript 类型定义 | 30                |
| **总计**            | **约 250-300 行** |

---

## 十三、待实现（V2+）

- 异步支持：`asyncResource`、微任务批处理调度器
- `<Suspense>` 完整实现
- SSR 支持
- DevTools：依赖图谱可视化

---

## 十四、禁止事项

- 不使用 Proxy
- 不引入虚拟 DOM
- 不依赖编译插件（Vite 默认 JSX 转换已足够）
- 不为不同类型的数据提供不同 API
- 不强制要求用户使用编译器
