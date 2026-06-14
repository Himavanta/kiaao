# kiaao 框架规范 v4.3

**宣传语**：更少的概念，更少的编译，更多的控制，更高的性能。

**设计哲学**：把响应式的本质从框架的隐性机制变成开发者的显性声明。所有状态通过单一 API 创建，所有信号在 API 层面完全同构。组件只运行一次，DOM 更新精确到节点。

## 零、架构原则

### 数据平权

所有数据都是信号，所有信号都由 `use` 产生，所有消费都通过 `getter()` 完成。不存在"原始值"和"响应式值"的区分，不存在"可写信号"和"只读信号"在 API 层面的区分——所有信号都返回 `[getter, setter]`。

### 一切皆派生

没有副作用，只有不读返回值的派生。当开发者写 `use(a, b, () => { console.log(a()) })` 时，创建了一个派生信号，其值永远为 `undefined`。它与其他派生信号拥有完全相同的结构、缓存机制和生命周期。

### API 完全同构

`use` 在任何情况下都返回 `[getter, setter]` 元组。无论是一元调用还是多元调用，无论 `computeFn` 是否有返回值，返回值结构永远不变。`use` 接收信号时直接返回该信号的 `[getter, setter]`，接收普通值时创建新信号——行为统一，语义一致。

### 依赖显式声明

依赖关系在 `use` 调用时由参数列表静态确定，绝不依赖运行时执行栈。异步回调中访问信号不会产生依赖绑定，条件分支不会动态改变依赖列表。只有写在参数列表里的才被追踪。

### 闭包即作用域

组件实例隔离和局部作用域通过 JavaScript 原生闭包实现。工厂函数每次调用创建独立的闭包和信号。框架不提供 `Context`、`provide/inject` 等作用域管理 API。

### 原生控制流

控制流通过 `h()` 的属性指令实现，直接依附于原生 DOM 元素，而非独立的组件。这保证了动态内容始终处于宿主元素的 `childNodes` 中，`disposeNode` 沿 DOM 树的递归路径自然可抵达所有动态节点。

### 显式上下文

组件实例上下文通过函数参数显式传递，而非依赖全局栈。生命周期 API 和组件级 `use` 是 `context` 对象的方法，不是从框架导入的全局函数。这从根本上消除了异步执行导致的上下文归属问题。

### 机制在核心，策略在扩展

框架核心提供最小化的原语（信号创建、DOM 渲染、元素级生命周期），具体的行为策略（动画、验证、手势等）通过自定义指令系统由外部库或用户代码实现。

## 一、核心 API：`use`

`use` 是创建响应式信号的唯一入口。根据参数个数和类型自动进入不同模式，**始终返回 `[getter, setter]`**。

### 1.1 参数解析规则

1. **一元调用 + 信号** → 直接返回 `[信号, 信号[REACTIVE].set]`（不创建新资源）
2. **一元调用 + 非信号** → 定义模式：创建新信号
3. **多元调用** → 派生模式：最后一个参数为计算函数，其余为依赖信号

这保证了信号不会被误判为计算函数。

### 1.2 定义模式：`use(initialValue)`

**触发条件**：恰好一个参数，且不是信号。

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

**内部状态**：

```ts
interface DefinitionState<T> {
  value: T;
  subs: Set<DerivationState<any>>;
  set: Setter<T>;
  stop: () => void; // 空操作：定义模式无上游依赖
}
```

挂载于 `getter[REACTIVE]`。

### 1.3 引用已有信号：`use(existingSignal)`

**触发条件**：恰好一个参数，且是信号（`isUse(val)` 为 true）。

**返回值**：`[val, val[REACTIVE].set]`，即已有信号的 getter 和 setter。不创建新资源。

```js
const [count, setCount] = use(0);
const [sameCount, sameSetCount] = use(count); // sameCount === count
```

这一行为吸收了 `toUse` 的能力，使 `use` 成为统一的"规范化入口"。

### 1.4 派生模式：`use(...deps, computeFn)`

**触发条件**：两个或更多参数。最后一个必须是普通函数（非信号），其余为依赖信号。

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
  return count() + 1;
});
console.log(nextCount()); // 2

setCount(2);
console.log(nextCount()); // 3

setNextCount(100);
console.log(nextCount()); // 3（值未变，短路）
```

**`computeFn` 签名自由**：可定义任意参数、默认值。

**立即求值**：派生信号在创建时立即执行一次 `computeFn`，参数为 `undefined`，结果作为初始缓存。

**内部数据结构**：

```ts
interface DerivationState<T> {
  deps: Set<SignalState<any>>;
  cachedValue: T;
  subs: Set<DerivationState<any>>;
  computeFn: (v?: any) => T;
  set: Setter<T>;
  stops: Set<() => void>;
  stop: () => void; // 从所有 deps 的 subs 中移除自身并清空 stops
}
```

挂载于 `getter[REACTIVE]`。`state.stop` 是框架内部的统一清理函数，外部不可见。

### 1.5 类型签名

```ts
// 接收信号：直接返回 [getter, setter]
function use<T>(signal: Getter<T>): [Getter<T>, Setter<T>];

// 定义模式
function use<T>(initialValue: T): [Getter<T>, Setter<T>];

// 派生模式（有返回值）
function use<T>(...deps: [...Signal[], (setValue?: any) => T]): [Getter<T>, Setter<T>];

// 派生模式（无返回值）
function use(...deps: [...Signal[], (setValue?: any) => void]): [Getter<void>, Setter<void>];
```

## 二、辅助工具函数

### `isUse(v: any): boolean`

判断一个值是否是信号（`use` 创建的 getter）。检查 `v?.[REACTIVE] !== undefined`。

### `toValue(v: any): any`

若 `v` 是信号则返回 `v()`（当前值），否则返回 `v` 本身。

### 已移除

- `toUse`：功能被 `use` 吸收。`use(signal)` 直接返回已有信号的 `[getter, setter]`。
- `toVal`：重命名为 `toValue`。

## 三、`h(tag, props?, ...children)`

统一创建函数。根据第一个参数的类型分三种模式：DOM 模式、组件模式、指令模式。

### 3.1 DOM 模式（`tag` 为字符串）

创建真实 DOM 元素，对 `children` 递归扁平化。

**无效 Tag 兜底**：当 `tag` 既非字符串也非函数时，返回空白注释节点 `createComment("")`。

**Fragment**：JSX 的 `<>...</>` 语法渲染为 `<div style="display: contents">` 容器，与原生 Fragment 存在差异。

**Children 中的无效值**：`null`、`undefined`、布尔值被静默跳过，嵌套数组被递归拍平。

**子节点处理**：

- 若子节点为信号：创建文本占位，通过匿名派生绑定动态更新。该派生的停止函数注册到文本节点的 `LOCAL_EFFECTS` 集合。
- 若为 DOM 节点：直接附加。
- 其他值：转为字符串创建静态文本节点。

#### 属性处理（`setProp` 流程）

- **事件属性**（`onXxx`）：转换为 `addEventListener` 绑定。
- **`style`**：接受字符串或对象。
- **前缀**：`attr:` 强制 `setAttribute`，`prop:` 强制 DOM property 赋值。
- **SVG 元素**：默认所有属性走 `setAttribute`。
- **FORCE_ATTRIBUTE 列表**：标准 HTML 属性走 `setAttribute`；不在列表中的走 property 赋值。
- **`aria-*` / `data-*`**：无条件走 `setAttribute`。
- **布尔属性**：`true` 设空字符串，`false` 移除。
- 响应式属性值（信号）自动创建匿名派生进行更新，挂载到元素的 `LOCAL_EFFECTS`。

#### 控制流指令

`when` 和 `each` 仅对原生 HTML 元素生效。

##### `when` 指令

控制宿主元素内部子节点的挂载/卸载。宿主元素始终存在于 DOM 中。

**两种模式**：

- **布尔模式**：`children` 为非对象内容。truthy 渲染 `children`；falsy 回退 `else`，否则清空。
- **映射表模式**：`children` 为 `{ [key]: () => VNode }`。key 匹配渲染对应分支，未匹配回退 `else`。

**`else` 属性**：可选，`() => any`，作为后备内容。

##### `each` 指令

控制宿主元素内部按集合生成子节点。接受数组（信号或非信号），其他类型请用户自行转换后传入。

`children` 渲染函数签名为 `(item: Signal, index: number, key: any) => Node`。框架为每个条目自动创建定义信号，实现同 key 增量更新。

**`key` 属性**：可选函数 `(item, index, entryKey) => any`，自定义身份标识。

### 3.2 组件模式（`tag` 为函数，且不带有 `DIRECT_KEY` 标记）

组件函数签名：`(props, context)`。

#### 3.2.1 `context` 接口

```ts
interface ComponentContext {
  use: typeof use; // 组件级信号创建（卸载时自动清理）
  onMount(fn: () => void | Promise<void>): void;
  onUnmount(fn: () => void | Promise<void>): void;
}
```

#### 3.2.2 同步组件

流程：

1. 创建组件实例，构建 `context` 对象
2. 调用 `tag(props, context)`，同步获取返回的 DOM 节点
3. 通过 `attachInstance` 在返回值节点上追加实例关联（`INSTANCE_KEY` 和 `DISPOSE_KEY` 均为 Set）
4. 若返回值非 `Node`，创建注释节点作为占位（防御性兜底）
5. 若返回值为数组，创建 Fragment 容器包裹并挂载实例关联

#### 3.2.3 异步组件

当组件函数返回 `Promise` 时，为异步组件。流程：

1. 创建组件实例，构建 `context` 对象
2. 调用 `tag(props, context)`，获取返回的 Promise
3. 创建 wrapper 元素（`<div style="display: contents">`），挂载 `DISPOSE_KEY` Set
4. 注册 `disposed` 标志位
5. 等待 Promise resolve：
   - 检查 `disposed`
   - 检查 `realDOM instanceof Node`，非法值降级为注释节点
   - 将 `realDOM` 作为子节点插入 wrapper
   - 调用 `triggerMount(realDOM)` 递归触发子树
   - 手动触发当前异步组件自身的 `mountCallbacks`
6. Promise reject 时打印错误

wrapper 不设置 `INSTANCE_KEY`。wrapper 从创建到卸载始终是组件的根节点。

### 3.3 指令模式（`tag` 为函数，且带有 `DIRECT_KEY` 标记）

当 `tag` 是函数且带有 `DIRECT_KEY` 标记时，进入指令模式。

指令通过 `direct` 函数创建。`direct` 为传入的函数添加 `DIRECT_KEY` 标记，`h()` 通过检测此标记区分指令和组件。

#### 3.3.1 指令的创建与签名

```ts
import { direct } from "kiaao";

const MyDirective = direct((el, props, context) => {
  // el: 当前绑定的原生 DOM 元素
  // props: JSX 传入的属性（包括 children）
  // context: 元素级生命周期方法 { onMount, onUnmount, use }
});
```

**指令签名**：

```ts
type DirectiveFunction = (
  el: Element,
  props: Record<string, any> & { children?: any },
  context: DirectiveContext,
) => void;

interface DirectiveContext {
  onMount(fn: () => void): void;
  onUnmount(fn: () => void): void;
  use: typeof use; // 元素级信号，元素移除时自动清理
}
```

- **`el`**：指令绑定的单个原生 DOM 元素。当指令包含多个子元素时，指令函数会被多次调用，每次传入一个子元素。
- **`props`**：JSX 中写在指令上的属性，包含一个特殊的 `children` 属性。
- **`context`**：元素级生命周期上下文，直接绑定到当前 `el`。方法始终作用于当前正在处理的元素。

#### 3.3.2 指令模式流程

1. 计算 `props`（合并 rest children 到 `props.children`）。
2. 遍历扁平化后的 `children`，对每个是 `Element` 的子元素调用指令函数。跳过非 Element 子元素并在开发模式警告。
3. 忽略指令函数的返回值，继续将原始 `children` 返回。
4. 若原始 `children` 为单子节点且为 `Node`，直接返回该 `Node`；否则返回数组。

#### 3.3.3 指令与组件模式的区别

指令模式不创建组件实例，不压入 `currentComponent` 栈，不触发组件生命周期。

#### 3.3.4 元素级生命周期

指令拥有独立于组件的元素级生命周期：

- **`context.onMount(fn)`**：注册的回调在元素被插入 DOM 后由 `triggerMount` 调用。按注册顺序执行。
- **`context.onUnmount(fn)`**：注册的回调在元素被移除前由 `disposeNode` 同步调用。`fn` 不应返回 Promise。用于清理资源（移除事件监听、断开 Observer、停止定时器等）。
- **`context.use(...)`**：与组件级 `use` 语法完全一致，但创建的信号/派生绑定到当前元素的生存周期。元素被移除时，这些资源通过 `LOCAL_EFFECTS` 自动清理。

#### 3.3.5 指令的嵌套与执行顺序

多个指令可以嵌套使用。`h()` 从内到外执行，内层指令先注册钩子。`onMount` 按注册顺序触发，`onUnmount` 并行执行。

#### 3.3.6 指令的返回值

指令函数可以返回一个值，但框架会忽略它。指令不能通过返回新元素来修改 DOM 结构。指令的唯一正规途径是通过 `el` 直接操作 DOM 和通过 `context` 注册生命周期钩子。

#### 3.3.7 SSR 兼容性

SSR 模式下指令不执行。`hSSR` 跳过指令逻辑，直接返回 children 的 SSR 输出。

### 3.4 多实例共享 DOM 节点

`INSTANCE_KEY` 和 `DISPOSE_KEY` 从单值改为 `Set`，允许多个组件实例在同一个 DOM 节点上共存。

```ts
function attachInstance(node, instance) {
  if (!node[INSTANCE_KEY]) {
    node[INSTANCE_KEY] = new Set();
    node[DISPOSE_KEY] = new Set();
  }
  node[INSTANCE_KEY].add(instance);
  node[DISPOSE_KEY].add(createDisposeFn(instance));
}
```

`triggerMount` 遍历 Set 中所有实例。`disposeNode` 遍历 Set 执行所有清理函数后清空两个 Set。

### 3.5 退出动画

退出动画的异步时序控制由用户态代码处理。框架核心保持信号模型的纯粹性和可预测性，不引入任何信号层面的异步机制。推荐的实现模式是通过工厂函数将动画任务收集与信号触发分离，利用指令系统收集动画任务。详见《动画方案探索与 Motion 指令实现》文档。

## 四、生命周期

生命周期 API 通过 `context` 参数传入，不再从框架中导入。

### 4.1 `onMount(fn)`

注册组件挂载完成后的回调。可在任何位置调用。

| 调用时组件状态 | 行为                       |
| -------------- | -------------------------- |
| 尚未挂载       | 推入 `mountCallbacks` 队列 |
| 已挂载         | 立即同步执行               |

- **同步组件**：`triggerMount` 递归遍历时触发
- **异步组件**：Promise resolve 后，先递归 `triggerMount(realDOM)`，再触发自身
- `fn` 可以是同步或 async 函数。错误由 `safeCall` 捕获并打印
- 已销毁后调用：开发模式警告，生产模式静默忽略

### 4.2 `onUnmount(fn)`

注册组件销毁前的清理回调。可在任何位置调用。

- `fn` 可以是同步或 async 函数。错误由 `safeCall` 捕获并打印
- 已销毁后调用：开发模式警告，生产模式静默忽略

### 4.3 `context.use`

组件级信号创建。语法与模块级 `use` 完全一致。创建的信号在组件卸载时自动清理。

- 接收信号时直接返回引用（不创建新资源，不注册清理）
- 接收普通值时创建新信号（注册清理）
- 多元调用创建派生（注册清理）
- 已销毁后调用：返回安全占位 `[noop, noop]`

### 4.4 `mount(root, container)` / `unmount(root)`

显式挂载/卸载组件树。

### 4.5 `safeCall(fn, label)`

模块级工具函数，统一执行生命周期回调，捕获同步错误和异步 rejection。

## 五、内置组件

### `<Portal to={...}>`

将子内容渲染到指定 DOM 容器，逻辑上仍属于当前组件树，卸载时自动清除。需从 `context` 参数中解构生命周期 API。

### `lazy(loader)`

将动态 `import()` 转换为组件。内部返回一个异步组件——`loader()` 返回的 Promise 由异步组件机制统一处理。加载失败时显示错误文本节点。

### `Fragment`

渲染为 `<div style="display: contents">`。

## 六、更新传播与清理

### 依赖图与更新

- 定义信号：`state.value` 变更 → 遍历 `subs`，立即执行每个派生节点的 `computeFn` → 对比缓存 → 更新或短路
- 派生 setter：执行 `computeFn(value)`，结果对比缓存，传播规则同上

### 清理机制

- 每个派生节点维护 `stops` 集合，存放向每个依赖注册的取消订阅函数
- 派生节点提供 `stop()` 方法，一次性调用 `stops` 并清理反向引用
- 定义信号提供空 `stop()` 方法（无上游依赖，无需实际清理）
- 销毁时通过 `getter[REACTIVE].stop()` 统一清理
- 清理由框架的所有权机制自动管理：
  - `context.use` 创建的信号/派生 → `unmountCallbacks`
  - DOM 绑定产生的匿名派生 → `LOCAL_EFFECTS`
  - 指令的 `context.use` 创建的信号 → `LOCAL_EFFECTS`
  - 组件销毁 → `DISPOSE_KEY` Set

## 七、内部标记

| Symbol              | 挂载位置               | 用途                                                              |
| ------------------- | ---------------------- | ----------------------------------------------------------------- |
| `REACTIVE`          | 所有信号的 getter 函数 | 标记信号，其值为内部状态对象（含 `value`/`subs`/`set`/`stop` 等） |
| `LOCAL_EFFECTS`     | DOM 节点               | 存储该节点上的匿名派生停止函数集合                                |
| `DISPOSE_KEY`       | DOM 节点               | 存储 `Set<() => void>`（组件销毁回调集合）                        |
| `INSTANCE_KEY`      | DOM 节点               | 存储 `Set<ComponentInstance>`（关联的组件实例集合）               |
| `INITIALIZED_KEY`   | 组件实例               | 标记挂载已完成                                                    |
| `DISPOSED_KEY`      | 组件实例               | 标记已销毁                                                        |
| `DIRECT_KEY`        | 指令函数               | 标记指令函数，供 `h()` 区分指令和组件                             |
| `DIRECTIVE_MOUNT`   | DOM 节点               | 存储指令注册的 `onMount` 回调集合                                 |
| `DIRECTIVE_UNMOUNT` | DOM 节点               | 存储指令注册的 `onUnmount` 回调集合                               |

## 八、与 v3.4 的差异对照

| 维度           | v3.4                            | v4.3                                           |
| -------------- | ------------------------------- | ---------------------------------------------- |
| 创建可写信号   | `define(init)` → `[get, set]`   | `use(init)` → `[get, set]`                     |
| 创建派生信号   | `derive(fn)` → `getter`         | `use(...deps, fn)` → `[get, set]`              |
| 副作用         | `effect(fn)` → `stop`           | 派生模式（不接收返回值），返回 `[get, set]`    |
| 细粒度订阅     | `getter(selector)`              | `use(signal, fn)`                              |
| 规范化值       | `toUse(v)` → `[get, set]`       | `use(v)`（信号直接返回引用，非信号创建新信号） |
| 提取值         | `toVal(v)`                      | `toValue(v)`                                   |
| 生命周期注册   | `import { onMount, onUnmount }` | `context` 参数解构                             |
| 组件级信号     | 不支持（需手动管理）            | `context.use`（自动清理）                      |
| 组件函数签名   | `(props)`                       | `(props, context)`                             |
| 异步组件       | 不支持                          | 返回 Promise 即为异步组件                      |
| 自定义指令     | 不支持                          | `direct` 创建，元素级生命周期                  |
| 多实例共享节点 | 覆盖（导致清理丢失）            | 追加到 Set（共存）                             |
| Fragment       | 不支持                          | `Fragment` 组件渲染为 `display: contents` 容器 |

## 九、附录：属性处理策略摘要

- **FORCE_ATTRIBUTE**：标准 HTML 属性走 `setAttribute`；`value`、`checked` 等走 property 赋值
- **前缀机制**：`attr:` 强制 setAttribute，`prop:` 强制 property
- **SVG 元素**：默认所有属性走 setAttribute
- **事件**：`onXxx` 转为 `addEventListener`
- **SSR 序列化**：仅输出 `attr:` 前缀、`style`、`aria-*`/`data-*`、FORCE_ATTRIBUTE 中的属性

**文档版本**：v4.3
**撰写日期**：2026年6月14日
**状态**：定稿
