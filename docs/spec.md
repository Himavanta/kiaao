# kiaao 框架规范 v4.0（更新）

**宣传语**：更少的概念，更少的编译，更多的控制，更高的性能。

**设计哲学**：把响应式的本质从框架的隐性机制变成开发者的显性声明。所有状态通过单一 API 创建，所有信号在 API 层面完全同构。组件只运行一次，DOM 更新精确到节点。

---

## 零、架构原则

### 数据平权

所有数据都是信号，所有信号都由 `use` 产生，所有消费都通过 `getter()` 完成。不存在“原始值”和“响应式值”的区分，不存在“可写信号”和“只读信号”在 API 层面的区分——所有信号都返回 `[getter, setter]`。

### 一切皆派生

没有副作用，只有不读返回值的派生。当开发者写 `use(a, b, () => { console.log(a()) })` 时，创建了一个派生信号，其值永远为 `undefined`。它与其他派生信号拥有完全相同的结构、缓存机制和生命周期。

### API 完全同构

`use` 在任何情况下都返回 `[getter, setter]` 元组。无论是一元调用还是多元调用，无论 `computeFn` 是否有返回值，返回值结构永远不变。

### 依赖显式声明

依赖关系在 `use` 调用时由参数列表静态确定，绝不依赖运行时执行栈。异步回调中访问信号不会产生依赖绑定，条件分支不会动态改变依赖列表。只有写在参数列表里的才被追踪。

### 闭包即作用域

组件实例隔离和局部作用域通过 JavaScript 原生闭包实现。工厂函数每次调用创建独立的闭包和信号。框架不提供 `Context`、`provide/inject` 等作用域管理 API。

### 原生控制流

控制流通过 `h()` 的属性指令实现，直接依附于原生 DOM 元素，而非独立的组件。这保证了动态内容始终处于宿主元素的 `childNodes` 中，`disposeNode` 沿 DOM 树的递归路径自然可抵达所有动态节点。

---

## 一、核心 API：`use`

`use` 是创建响应式信号的唯一入口。根据参数个数自动进入两种模式，**始终返回 `[getter, setter]`**。

### 1.1 定义模式：`use(initialValue)`

**参数**：恰好一个参数，任意类型。

**返回值**：`[getter, setter]` 元组。

```js
const [count, setCount] = use(0);
const [user, setUser] = use({ name: "tom", age: 18 });
const [fnSignal, setFnSignal] = use(() => 42); // 函数本身作为值
const [promiseVal, setPromiseVal] = use(somePromise); // Promise 本身作为值
```

**规则**：

- `initialValue` 可以是任何 JavaScript 值，不做类型限制，不做特殊包装。
- 若传入函数（包括 getter、Promise、async 函数），它被当作普通值存储，不会被调用。

**getter**：调用 `getter()` 返回当前存储的值。

**setter**：

- `setter(newValue)` 直接替换内部值。
- `setter(updaterFn)` 调用 `updaterFn(当前值)`，用返回值替换。

**内部状态**：定义信号内部状态对象包含 `value`、`subs`（订阅该信号的下游派生）、`set`（setter 引用），挂载于 `getter[REACTIVE]`。

---

### 1.2 派生模式：`use(...deps, computeFn)`

**参数**：两个或更多参数。最后一个必须是普通函数（非信号），其余为依赖信号。

**返回值**：`[getter, setter]` 元组。

```js
// 有返回值
const [double, setDouble] = use(count, () => count() * 2);
const [name, setName] = use(user, () => user().name);

// 无返回值
const [_, trigger] = use(count, () => {
  console.log(count());
});
```

**getter 行为**：调用 `getter()` 返回当前缓存的计算结果，不触发重新计算。

**setter 行为**：`setter(value)` 触发 `computeFn` 重新执行，**不直接覆盖值**。

- `computeFn` 接收 `setter` 传入的值作为参数（若由上游变化触发重算，参数为 `undefined`）。
- `computeFn` 的返回值作为新缓存值。
- 若新值与旧值 `!==`，更新缓存并通知下游订阅者。
- 若相同，则短路，不通知下游。

```js
const [count, setCount] = use(1);

const [nextCount, setNextCount] = use(count, (v) => {
  return count() + 1; // v 来自 setNextCount 的参数，此处未使用
});
// 创建时立即执行一次，v 为 undefined
console.log(nextCount()); // 2

setCount(2);
// 上游变化触发重算，v 为 undefined → 重算返回 3
console.log(nextCount()); // 3

setNextCount(100);
// setter 触发重算，v 为 100 → 重算返回 count() + 1 = 3
// 值未变，短路，不通知下游
console.log(nextCount()); // 3
```

**`computeFn` 签名自由**：可定义任意参数、默认值。

```js
const [derived, setDerived] = use(base, (multiplier = 2) => {
  return base() * multiplier;
});
```

**立即求值**：派生信号在创建时立即执行一次 `computeFn`，参数为 `undefined`，结果作为初始缓存。

**内部数据结构**：

```ts
interface DerivationNode<T> {
  deps: Set<SignalNode>; // 此派生依赖的信号
  cachedValue: T; // 上次计算结果
  subs: Set<DerivationNode>; // 依赖此派生的其他派生
  computeFn: (v?: any) => T; // 用户提供的计算函数，参数为 setter 传入的值或 undefined
  set: Setter<T>; // 派生信号的 setter
  stops: Set<() => void>; // 向各依赖注册的单个取消订阅函数（每个依赖一个 stop）
  stop: () => void; // 统一清理入口：遍历 stops，并从所有依赖的 subs 中移除自身
}
```

- `getter[REACTIVE]` 指向该 `DerivationNode` 实例。
- `state.stop` 是框架内部的统一清理函数，外部不可见（`use` 的返回值不包含它），但框架内部（如 `disposeNode`、`addLocalEffect` 等）可通过 `getter[REACTIVE].stop` 直接调用。

---

### 1.3 类型签名

```ts
// 定义模式
function use<T>(initialValue: T): [Getter<T>, Setter<T>];

// 派生模式（有返回值）
function use<T>(...deps: [...Signal[], (setValue?: any) => T]): [Getter<T>, Setter<T>];

// 派生模式（无返回值）
function use(...deps: [...Signal[], (setValue?: any) => void]): [Getter<void>, Setter<void>];
```

---

## 二、辅助工具函数

### `isUse(v: any): boolean`

判断一个值是否是信号（`use` 创建的 getter）。所有信号均挂载 `REACTIVE` 标记，`isUse` 检查 `v?.[REACTIVE] !== undefined`。

### `toUse(v: any): [Getter, Setter]`

将任意值规范化为可读写的信号元组。

- 若 `v` 已经是信号，直接返回 `[v, v[REACTIVE].set]` ——所有信号都有 setter，此分支永远安全。
- 否则等价于 `use(v)`，返回新创建的 `[getter, setter]`。

使用场景：组件适配外部参数，使内部逻辑统一。

```js
function Slider(props) {
  const [value, setValue] = toUse(props.value);
  // 内部统一使用 value() 读取，setValue() 更新
}
```

### `toVal(v: any): any`

若 `v` 是信号则返回 `v()`（当前值），否则返回 `v` 本身。

---

## 三、`h(tag, props?, ...children)`

统一创建函数。根据第一个参数的类型分两种模式。

### 3.1 DOM 模式（`tag` 为字符串）

创建真实 DOM 元素，对 `children` 递归扁平化。

**无效 Tag 兜底**：  
当 `tag` 既非字符串也非函数时（如 `null`、`undefined`、`0`、`false`），`h()` 返回一个空白注释节点 `createComment("")`，防止创建非法 DOM 元素。此为防御性兜底，正常 JSX 使用不会触达此路径。

**Fragment**：  
JSX 的 `<>...</>` 语法由编译器解析为 `Fragment` 组件（`h(Fragment, null, ...children)`）。`Fragment` 渲染为一个 `<div style="display: contents">` 容器，其 `children` 在内部正常处理。该容器存在于 DOM 中，无额外布局影响，但与原生 Fragment 存在差异（CSS 选择器、DOM 遍历等场景需注意容器节点的存在）。`h()` 的无效 tag 兜底与 Fragment 无关——`<>...</>` 走的是 Fragment 组件路径，不会落入无效 tag 兜底逻辑。

**Children 中的无效值**：  
子节点数组中的 `null`、`undefined`、布尔值在 `processChildren` 中被静默跳过，嵌套数组被递归拍平。

**子节点处理**：

- 若子节点为信号（`isUse` 为真）：创建文本占位，通过匿名派生绑定动态更新。该派生的停止函数注册到文本节点的 `LOCAL_EFFECTS` 集合。
- 若为 DOM 节点：直接附加。
- 其他值：转为字符串创建静态文本节点。

#### 属性处理（`setProp` 流程）

属性处理遵循已建立的策略，确保可预测性。详细规则参见《属性处理策略》文档，核心要点：

- **事件属性**（`onXxx`）：转换为 `addEventListener` 绑定，不参与响应式绑定。
- **`style`**：接受字符串或对象。字符串设 `cssText`，对象清空内联样式后 `Object.assign`。
- **前缀**：`attr:` 强制走 `setAttribute`，`prop:` 强制走 DOM property 赋值。
- **SVG 元素**：默认所有属性走 `setAttribute`（除 `style` 和显式 `prop:` 外）。
- **FORCE_ATTRIBUTE 列表**：包含标准 HTML 属性（`class`、`id`、`disabled` 等），这些属性走 `setAttribute`；不在列表中的属性（如 `value`、`checked`、自定义 property）走 `el[key] = value`。
- **`aria-*` / `data-*`**：无条件走 `setAttribute`。
- **布尔属性**：`true` 时设空字符串，`false` 时移除。
- 无前缀的响应式属性值（信号）会自动创建匿名派生进行更新，派生挂载到元素的 `LOCAL_EFFECTS`。

#### 控制流指令

`when` 和 `each` 仅对原生 HTML 元素生效。

##### `when` 指令

控制宿主元素内部子节点的挂载/卸载。宿主元素始终存在于 DOM 中。接受任意值（通常为信号或函数），根据返回值决定渲染行为。

**两种模式**：

- **布尔模式**：`children` 为非对象内容。`when` 返回值 truthy 时渲染 `children`；falsy 时若有 `else` 属性则渲染其返回内容，否则清空。
- **映射表模式**：`children` 为纯对象 `{ [key]: () => VNode }`。`when` 返回值作为 key 查找，找到则调用对应惰性函数渲染；未找到回退 `else`，无 `else` 清空。

**`else` 属性**：可选，值为 `() => any`，作为条件不满足时的后备内容。

##### `each` 指令

控制宿主元素内部按集合生成子节点。接受返回任意数据源的信号（数组、对象、Map、Set、数字、字符串等）。

`children` 渲染函数签名为 `(item: Signal, index: number, key: any) => Node`。框架为每个条目自动创建定义信号，实现同 key 增量更新：同 identity 复用 DOM，仅移动位置；新增/删除分别创建/销毁节点。

**`key` 属性**：可选函数 `(item, index, entryKey) => any`，用于自定义列表项的身份标识，实现高效复用。

---

### 3.2 组件模式（`tag` 为函数）

创建组件实例并压入 `currentComponent` 栈，执行 `tag(props)`，返回真实 DOM 节点。组件函数只执行一次。

---

## 四、内置组件

### `<Teleport to={...}>`

将子内容渲染到指定 DOM 容器（CSS 选择器或元素），逻辑上仍属于当前组件树，卸载时自动清除。

### `lazy(loader)`

异步加载组件，配合 `import()` 使用。初始渲染占位注释，加载完成后替换为真实组件。

### `Fragment`

渲染为 `<div style="display: contents">`，其 `children` 正常处理。JSX 的 `<>...</>` 语法经编译器转换后调用此组件。

---

## 五、生命周期与挂载

### `onMount(fn)` / `onUnmount(fn)`

注册组件挂载/卸载回调，必须在组件函数顶层同步调用。

### `mount(root, container)` / `unmount(root)`

显式挂载/卸载组件树，触发相应生命周期和资源清理。

---

## 六、更新传播与清理

### 依赖图与更新

- 定义信号：`state.value` 变更 → 遍历 `subs`，立即执行每个派生节点的 `computeFn`（参数 `undefined`）→ 对比缓存 → 更新或短路。
- 派生 setter：标记自身，执行 `computeFn(value)`，结果对比缓存，传播规则同上。

### 清理机制

- 每个派生节点维护 `stops` 集合，存放向每个依赖注册的单个取消订阅函数。
- 派生节点同时提供一个 **`stop()` 方法**，一次性调用 `stops` 中的所有函数，并将自身从所有依赖的 `subs` 中移除。
- 当派生节点需要被销毁时（组件卸载、`when`/`each` 分支切换、对应 DOM 节点被移除），框架内部通过 `getter[REACTIVE].stop()` 触发统一清理，无需关心具体依赖数量。
- 开发者无法直接访问 `stop`，清理完全由框架的所有权机制（`LOCAL_EFFECTS`、`DISPOSE_KEY` 回调、`disposeNode` 递归）自动管理。

---

## 七、内部标记

| Symbol                             | 挂载位置               | 用途                                                       |
| ---------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `REACTIVE`                         | 所有信号的 getter 函数 | 标记信号，其值为内部状态对象（含 `value`/`subs`/`set` 等） |
| `LOCAL_EFFECTS`                    | DOM 节点               | 存储该节点上的匿名派生停止函数集合                         |
| `DISPOSE_KEY`                      | DOM 节点（组件根节点） | 存储组件销毁回调（含 `onUnmount` 队列、组件级派生停止等）  |
| `INSTANCE_KEY`                     | DOM 节点               | 存储组件实例引用                                           |
| `INITIALIZED_KEY` / `DISPOSED_KEY` | 组件实例               | 标记初始化/已销毁状态                                      |

---

## 八、与 v3.4 的差异对照

| 维度          | v3.4                                            | v4.0                                           |
| ------------- | ----------------------------------------------- | ---------------------------------------------- |
| 创建可写信号  | `define(init)` → `[get, set]`                   | `use(init)` → `[get, set]`                     |
| 创建派生信号  | `derive(fn)` → `getter`                         | `use(...deps, fn)` → `[get, set]`              |
| 副作用        | `effect(fn)` → `stop`                           | 派生模式（不接收返回值），返回 `[get, set]`    |
| 细粒度订阅    | `getter(selector)`                              | `use(signal, fn)`                              |
| 返回值结构    | 不一致（定义/派生/副作用各不同）                | 完全一致（均为元组）                           |
| 核心 API 数量 | 4 (define/derive/effect/h)                      | 3 (use/h 及辅助)                               |
| Fragment 处理 | 不支持，`<>...</>` 编译为 null tag 后无特殊处理 | `Fragment` 组件渲染为 `display: contents` 容器 |

---

## 九、附录：属性处理策略摘要

参阅《属性处理策略》完整文档，以下是关键点：

- **FORCE_ATTRIBUTE**：包含 `class`、`id`、`disabled`、`src`、`href` 等标准 HTML 属性，统一走 `setAttribute`；`value`、`checked` 等不在列表中，走 property 赋值。
- **前缀机制**：`attr:xxx` 强制 setAttribute，`prop:xxx` 强制 property，覆盖默认行为。
- **SVG 元素**：默认所有属性走 setAttribute，`style` 正常处理，`prop:` 前缀可强制 property（注意只读属性风险）。
- **事件**：`onXxx` 转为 `addEventListener`。
- **SSR 序列化**：仅输出 `attr:` 前缀、`style`、`aria-*`/`data-*`、FORCE_ATTRIBUTE 中的属性；`prop:` 前缀、事件、不在列表中的属性不输出。

---

## 十、代码量估算

核心响应式 + 辅助函数 + 集成适配约 200 行，`h()` 及相关指令、属性处理保持不变（约 120 行），总体核心代码量在 350 行左右。

---

**文档版本**：v4.0  
**状态**：定稿，依据已实现的代码库撰写
