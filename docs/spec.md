# MonoJS 框架完整规范与设计文档

## 一、核心哲学与宣传语

**宣传语**：

> 更少的概念，更少的编译，更多的代码，更高的性能。

**设计哲学**：

- 把响应式的本质（谁依赖谁）从框架的隐性机制，变成开发者的显性承诺。
- 以最少的 API 和最少的概念，在纯运行时直接兑现细粒度更新。
- 信任开发者：显式声明依赖，换取数据的绝对纯净和框架的极致简洁。

**核心取舍**：用户多写几个字符（选择器函数），换取零 Proxy、零虚拟 DOM、零编译器依赖、零组件重跑。

---

## 二、数据模型

### 2.1 响应式原语：`define`

**唯一的状态创建原语**。不区分基本类型和对象，统一语法。

```typescript
function define<T>(initialValue: T): [Getter<T>, Setter<T>];
```

**返回值**：元组 `[getter, setter]`，支持数组解构。

```javascript
const [value, setValue] = define(123);
const [user, setUser] = define({ name: "tom", age: 18 });
```

### 2.2 Getter：`value(selector?)`

- **不传参**：返回当前全量快照（只读）。
- **传选择器函数**：执行 `selector(currentValue)`，返回局部数据，并**自动收集依赖**。

```javascript
value(); // 全量快照
value((v) => v.name); // 精准订阅 name 字段
value((v) => v.age >= 18); // 就地计算，自动依赖
```

**依赖收集规则**：只有当 `currentEffect` 存在时，才将当前副作用绑定到该选择器对应的依赖节点上。

### 2.3 Setter：`setValue(updater)`

- **传新值**：直接替换内部状态。
- **传函数**：接收旧值，返回新值（函数式更新）。

```javascript
setValue(456);
setValue((prev) => prev + 1);
setUser((prev) => ({ ...prev, age: prev.age + 1 }));
```

**更新触发规则**：设置新值后，遍历所有已注册的选择器依赖，执行每个选择器函数分别对比新旧结果。只有结果不同的依赖，才触发其绑定的副作用（DOM 更新或 `watch` 回调）。

### 2.4 数据纯净度

- 内部存储的是**纯普通 JS 对象/基本类型**。
- 任何时候通过 `value()` 或 `value(v => v.x)` 拿到的都是**普通值**，没有 Proxy 包装，没有 getter/setter 劫持。
- 更新采用**不可变替换**（用户传入新对象），但框架不依赖引用对比来触发更新，而是依赖选择器函数的结果对比。

---

## 三、核心 API（四大金刚）

### 3.1 `define<T>(initialValue: T): [Getter<T>, Setter<T>]`

**用途**：创建响应式状态。
**职责**：存储数据、管理依赖图谱、在对账后精准触发更新。

### 3.2 `h(tag, props, ...children): HTMLElement`

**用途**：纯运行时创建真实 DOM。
**职责**：

- 创建原生 DOM 节点。
- 若子节点是函数（Getter 或 DeriveSignal），则创建文本节点占位，并通过 `watch` 绑定动态更新。
- 若子节点是普通值或 DOM 节点，直接附加。

**与 JSX 的关系**：Vite 自带的 JSX 转换将 JSX 转为 `h` 函数调用，无需额外编译插件。

### 3.3 `derive(computeFn): DeriveSignal`

**用途**：创建派生状态（计算属性）。
**职责**：

- 内部通过 `watch` 绑定上游依赖。
- 维护脏标记（`isDirty`）和缓存值。
- 当上游变化时，仅标记脏，不立即计算。
- 当下游读取时，若脏则重新计算并缓存，若干净则直接返回缓存。
- **拦截功能**：若新计算结果与旧缓存相同，不通知下游。

**与 Getter 的区别**：Getter 是“纯转发”，每次调用都执行选择器；`derive` 带缓存和拦截，用于重度计算或多处复用。

### 3.4 `watch(fn): void`

**用途**：监听状态变化并执行副作用。
**职责**：

- 将 `fn` 包装为 effect，挂载全局 `currentEffect`。
- 立即执行一次 `fn()`，触发内部所有 Getter/derive 的依赖收集。
- 当上游状态变化且对账通过后，自动重新执行 `fn`。

**与 `derive` 的区别**：`derive` 是纯计算（有返回值，有缓存），`watch` 是无返回值的副作用（如 DOM 更新、`fetch`、`localStorage`）。

---

## 四、组件模型

### 4.1 组件函数只执行一次

```javascript
function UserProfile() {
  const [user, setUser] = define({ name: "tom", age: 18 });

  // 组件外壳在初始化时只运行这一次
  // 返回的是真实 DOM 树，不是渲染函数
  return (
    <div>
      <h1>{user((v) => v.name)}</h1>
      <p>年龄：{user((v) => v.age)}</p>
      <button onClick={() => setUser((prev) => ({ ...prev, age: prev.age + 1 }))}>长大一岁</button>
    </div>
  );
}
```

- **没有返回渲染函数**：直接返回由 `h()` 创建的真实 DOM 节点。
- **状态变化时**：组件函数不会重新执行。只有被选择器绑定的那个具体 DOM 文本节点会原地更新。
- **这是与 React 最根本的区别**，也是“更高的性能”的来源。

### 4.2 控制流组件（边界组件）

由于组件只执行一次，条件/循环等结构性变化必须通过内置组件处理。

#### `<Show when={condition} fallback={...}>`

```javascript
<Show when={() => visible()}>{() => <span>{user((v) => v.name)}</span>}</Show>
```

#### `<For each={list} key={item => item.id}>`

```javascript
<For each={() => items()} key={(item) => item.id}>
  {(item) => <li>{item.text}</li>}
</For>
```

#### `<Suspense fallback={...}>`

用于异步场景（未来实现）。

**关键规则**：这些边界组件内部使用**占位符 DOM 节点**（如空注释节点），当条件变化时，内部子树被完整创建或销毁，外部 DOM 完全不动。

---

## 五、渲染机制

### 5.1 初始化流程

1. 执行组件外壳一次。
2. 遇到 `define()` 创建信号。
3. 遇到 `user(v => v.name)` 时，立即求值并作为参数传给 `h()`。
4. `h()` 检测到子节点是函数（Getter），创建文本节点占位，启动 `watch` 绑定。
5. 返回真实 DOM 树，挂载到页面。

### 5.2 更新流程

1. `setUser(prev => ({ ...prev, age: 19 }))` 被调用。
2. 内部存储的旧值被替换为新值。
3. 遍历该信号的所有选择器依赖。
4. 对每个依赖：用旧值执行选择器 → 用新值执行选择器 → 对比结果。
5. 结果不同 → 触发对应的 effect（DOM 更新或 watch 回调）。
6. DOM 更新是**单点文本节点替换**，无虚拟 DOM Diff，无组件重跑。

### 5.3 无虚拟 DOM

- 不创建 VNode 树。
- 不进行树形 Diff 算法。
- DOM 更新是直接的 `textNode.textContent = newValue`。

---

## 六、依赖收集与调度

### 6.1 全局上下文

```javascript
let currentEffect = null;
```

- `watch` 和 `h` 内部的动态绑定，都会将其副作用函数挂载到 `currentEffect`。
- Getter 在执行选择器时，若 `currentEffect` 存在，则将当前 effect 注册到依赖图谱中。

### 6.2 依赖图谱结构

- 每个信号内部维护一个集合：`deps = Set<{ selectorFn, effect }>`。
- 键是 `selectorFn` 的**引用**，绝对不能使用 `toString()`。
- 同一个 effect 可以对同一个信号注册多个不同的选择器。

### 6.3 对账机制（值对比）

- 更新时，框架对每个注册的依赖，用旧值和新值分别执行 `selectorFn`。
- 使用 `!==` 进行浅对比（基本类型直接比值，对象比引用）。
- 只有对比结果为 `false` 时，才触发 effect。

---

## 七、生命周期

### 7.1 组件级

提供最小化的钩子：

- `onMount(fn)`：组件首次挂载后执行。
- `onCleanup(fn)`：组件销毁前执行，用于清理定时器、取消订阅等。

### 7.2 组件销毁

- 每个组件实例返回的根 DOM 节点附带 `__mono_dispose` 方法。
- 父级移除该 DOM 节点时，调用该方法递归清理所有子组件的 effect 订阅。

---

## 八、TypeScript 支持

### 8.1 核心类型

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
function watch(fn: () => void): void;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> | null,
  ...children: any[]
): HTMLElementTagNameMap[K];
```

### 8.2 设计原则

- 选择器函数的参数类型自动推导。
- Getter 的返回值类型自动推导。
- Setter 的参数类型受初始值类型约束。
- 不使用 `any` 作为公开 API 的返回类型。

---

## 九、与主流框架的核心差异

| 维度         | React      | Vue            | Solid              | **MonoJS**           |
| ------------ | ---------- | -------------- | ------------------ | -------------------- |
| 数据纯净度   | 纯净       | 不纯净 (Proxy) | 纯净（但两套 API） | **纯净（一套 API）** |
| 组件运行次数 | 每次重跑   | 外壳一次       | 外壳一次           | **外壳一次**         |
| 虚拟 DOM     | 有         | 有             | 无                 | **无**               |
| 编译器依赖   | 无         | 可选           | 强依赖             | **无**               |
| 响应式原理   | 无（全量） | Proxy          | 编译期             | **显式选择器**       |
| 核心概念数   | 10+        | 8+             | 6+                 | **4**                |
| 更新粒度     | 组件级     | 组件/块级      | DOM 节点级         | **选择器结果级**     |

---

## 十、代码量估算

| 模块                                       | 预计行数          |
| ------------------------------------------ | ----------------- |
| `define`（含 Getter/Setter/依赖图谱/对账） | 40-50             |
| `watch`                                    | 15                |
| `derive`                                   | 20                |
| `h`（含动态绑定）                          | 30-40             |
| 全局上下文与调度                           | 30                |
| `<Show>` 组件                              | 25                |
| `<For>` 组件                               | 35                |
| `<Suspense>` 占位（基础版）                | 30                |
| 生命周期钩子                               | 15                |
| TypeScript 类型定义                        | 30                |
| **总计**                                   | **约 270-310 行** |

---

## 十一、待实现的进阶特性（V2+）

- **异步支持**：`asyncResource`、微任务批处理调度器。
- **`<Suspense>` 完整实现**：含 Promise 拦截、fallback 切换、嵌套协调。
- **Context/Store 统一方案**：基于 `define` + 选择器，无需额外 API。
- **SSR 支持**：需要为 `h` 提供字符串渲染后端。
- **DevTools**：依赖图谱可视化、选择器调试。

---

## 十二、禁止事项（底线）

- **不使用 Proxy**：保持数据纯净是核心承诺。
- **不引入虚拟 DOM**：更新路径必须直连真实 DOM。
- **不依赖编译插件**：Vite 默认 JSX 转换已足够。
- **不为不同类型的数据提供不同 API**：`define` 是唯一的状态创建方式。
- **不强制要求用户使用编译器**：纯运行时是框架的核心价值。
