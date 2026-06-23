# kiaao 框架规范 v5.0

**宣传语**：更少的概念，更少的编译，更多的控制，更高的性能。

**设计哲学**：把响应式的本质从框架的隐性机制变成开发者的显性声明。所有状态通过单一 API 创建，所有信号在 API 层面完全同构。组件只运行一次，DOM 更新精确到节点。机制在核心，策略在扩展。

## 零、架构原则

### 数据平权

所有数据都是信号，所有信号都由 `use` 产生。不存在“原始值”和“响应式值”的区分，不存在“可写信号”和“只读信号”在 API 层面的区分。所有信号都是 `Signal<T>` 函数对象，同时承载读取和写入。

### 一切皆派生

没有副作用，只有不读返回值的派生。当开发者写 `use(a, b, () => { console.log(a()) })` 时，创建了一个派生信号，其值永远为 `undefined`。它与其他派生信号拥有完全相同的结构、缓存机制和生命周期。

### API 完全同构

`use` 在任何情况下都返回 `Signal<T>`。无论是一元调用还是多元调用，无论 `computeFn` 是否有返回值，返回值结构永远不变。`use` 接收信号时直接返回该信号本身，接收普通值时创建新信号——行为统一，语义一致。

### 依赖显式声明

依赖关系在 `use` 调用时由参数列表静态确定，绝不依赖运行时执行栈。异步回调中访问信号不会产生依赖绑定，条件分支不会动态改变依赖列表。只有写在参数列表里的才被追踪。

### 闭包即作用域

组件实例隔离和局部作用域通过 JavaScript 原生闭包实现。工厂函数每次调用创建独立的闭包和信号。框架不提供 `Context`、`provide/inject` 等作用域管理 API。

### 原生控制流

控制流通过 `h()` 的属性指令实现，直接依附于原生 DOM 元素，而非独立的组件。这保证了动态内容始终处于宿主元素的 `childNodes` 中，`disposeOwner` 沿 Owner 树的递归路径自然可抵达所有动态节点。

### 显式上下文

组件实例上下文通过函数参数显式传递，而非依赖全局栈。生命周期 API 和组件级 `use` 是 `context` 对象的方法，不是从框架导入的全局函数。这从根本上消除了异步执行导致的上下文归属问题。

### 机制在核心，策略在扩展

框架核心提供最小化的原语（信号创建、DOM 渲染、元素级生命周期），具体的行为策略（动画、验证、手势等）通过自定义指令系统由外部库或用户代码实现。动画扩展包 `kiaao/motion` 便是这一原则的典型体现。

## 一、核心 API：`use`

`use` 是创建响应式信号的唯一入口。根据参数个数和类型自动进入不同模式，**始终返回 `Signal<T>`**。

### 1.1 参数解析规则

1. **一元调用 + 信号** → 直接返回该信号本身（不创建新资源）
2. **一元调用 + 非信号** → 定义模式：创建新信号
3. **多元调用** → 派生模式：最后一个参数为计算函数，其余为依赖信号

这保证了信号不会被误判为计算函数。

### 1.2 `Signal<T>` 语义

`Signal<T>` 是一个函数对象，通过 `arguments.length` 区分读取和写入：

- 无参调用 `signal()` → 读取，返回当前值 `T`
- 有参调用 `signal(value)` → 写入，返回 `void`。若 `value` 为函数，视为函数式更新

```js
const count = use(0);

count(); // 读取 → 0
count(5); // 写入 → 5
count((c) => c + 1); // 函数式更新
```

### 1.3 定义模式：`use(initialValue)`

**触发条件**：恰好一个参数，且不是信号。

**返回值**：`Signal<T>`。

```js
const count = use(0);
const user = use({ name: "tom", age: 18 });
const fnSignal = use(() => 42); // 函数本身作为值
const promiseVal = use(somePromise); // Promise 本身作为值
```

**规则**：

- `initialValue` 可以是任何 JavaScript 值，不做类型限制，不做特殊包装。
- 若传入函数（包括 getter、Promise、async 函数），它被当作普通值存储，不会被调用。

**内部状态**：

```ts
interface DefinitionState<T> {
  value: T;
  subs: Set<DerivationState<any>>;
  stop: () => void;
}
```

挂载于 `signal[REACTIVE]`。

### 1.4 引用已有信号：`use(existingSignal)`

**触发条件**：恰好一个参数，且是信号（`isUse(val)` 为 true）。

**返回值**：原信号本身（不创建新资源）。

```js
const count = use(0);
const sameCount = use(count); // sameCount === count
```

这一行为吸收了 `toUse` 的能力，使 `use` 成为统一的“规范化入口”。

### 1.5 派生模式：`use(...deps, computeFn)`

**触发条件**：两个或更多参数。最后一个必须是普通函数（非信号），其余为依赖信号。

**返回值**：`Signal<T>`。

```js
// 有返回值
const double = use(count, () => count() * 2);
const name = use(user, () => user().name);

// 无返回值
const trigger = use(count, () => {
  console.log(count());
});
```

**读取行为**：调用 `signal()` 返回当前缓存的计算结果，不触发重新计算。

**写入行为**：`signal(value)` 触发 `computeFn` 重新执行，**不直接覆盖值**。`computeFn` 接收 `signal` 传入的值作为参数（若由上游变化触发重算，参数为 `undefined`）。

**立即求值**：派生信号在创建时立即执行一次 `computeFn`，参数为 `undefined`，结果作为初始缓存。

**短路行为**：若 `computeFn` 返回值与缓存值 `===`，则不通知下游订阅者。

**内部数据结构**：

```ts
interface DerivationState<T> {
  deps: Set<SignalState<any>>;
  cachedValue: T;
  subs: Set<DerivationState<any>>;
  computeFn: (v?: any) => T;
  stops: Set<() => void>;
  stop: () => void;
}
```

挂载于 `signal[REACTIVE]`。`state.stop` 是框架内部的统一清理函数，外部不可见。

### 1.6 类型签名

```ts
interface Signal<T> {
  (): T;
  (value: T | ((prev: T) => T)): void;
}

function use<T>(signal: Signal<T>): Signal<T>;
function use<T>(initialValue: T): Signal<T>;
function use<T>(...deps: [...Signal[], (setValue?: any) => T]): Signal<T>;
function use(...deps: [...Signal[], (setValue?: any) => void]): Signal<void>;
```

## 二、辅助工具函数

### `isUse(v: any): boolean`

判断一个值是否是信号。检查 `v?.[REACTIVE] !== undefined`。

### `toValue(v: any): any`

若 `v` 是信号则返回 `v()`（当前值），否则返回 `v` 本身。

### 已移除

- `toUse`：功能被 `use` 吸收。`use(signal)` 直接返回已有信号。
- `toVal`：重命名为 `toValue`。
- `Getter<T>` / `Setter<T>` 类型：统一为 `Signal<T>`。

## 三、`h(tag, props?, ...children)`

统一创建函数。根据第一个参数的类型分三种模式：DOM 模式、组件模式、指令模式。

### 3.1 DOM 模式（`tag` 为字符串）

创建真实 DOM 元素，对 `children` 递归扁平化。

**无效 Tag 兜底**：当 `tag` 既非字符串也非函数时，返回空白注释节点。

**Fragment**：JSX 的 `<>...</>` 语法直接返回 `Node[]`，不产生任何包裹节点。与原生 Fragment 行为一致，无 DOM 痕迹。

**Children 中的无效值**：`null`、`undefined`、布尔值被静默跳过，嵌套数组被递归拍平。

**子节点处理**：

- 若子节点为信号（`isUse` 为真）：创建文本占位，通过匿名派生绑定动态更新。清理函数注册到当前元素所属的 Owner。
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
- 响应式属性值（信号）自动创建匿名派生进行更新。

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

`children` 渲染函数签名为 `(item: Signal, index: number) => Node`。框架为每个条目自动创建定义信号，实现同 key 增量更新。

**`key` 属性**：可选函数 `(item, index) => any`，自定义身份标识。

### 3.2 组件模式（`tag` 为函数，且不带有 `DIRECT_KEY` 标记）

组件函数签名：`(props, context)`。

#### 3.2.1 `context` 接口

```ts
interface ComponentContext {
  use: typeof use;
  onMount(fn: () => void | Promise<void>): void;
  onUnmount(fn: () => void | Promise<void>): void;
}
```

#### 3.2.2 同步组件

流程：

1. 创建组件实例和对应的 Owner，构建 `context` 对象。
2. 调用 `tag(props, context)`，获取返回的 DOM 节点。
3. 将返回值中的节点注册到当前 Owner。
4. 若返回值非 `Node`，创建注释节点作为占位（防御性兜底）。

#### 3.2.3 异步组件

当组件函数返回 `Promise` 时，为异步组件。流程：

1. 创建组件 Owner，构建 `context` 对象。
2. 调用 `tag(props, context)`，获取返回的 Promise。
3. 创建注释占位符并注册到 Owner。
4. 等待 Promise resolve：
   - 将真实 DOM 注册到 Owner，替换占位符。
   - 从 Owner 出发触发挂载。
5. Promise reject 时打印错误。

### 3.3 指令模式（`tag` 为函数，且带有 `DIRECT_KEY` 标记）

指令通过 `direct` 函数创建。指令模式不创建组件实例，不触发组件生命周期。

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
  use: typeof use;
}
```

#### 3.3.2 元素级生命周期

指令拥有独立于组件的元素级生命周期，回调注册到当前组件或分支的 Owner：

- **`context.onMount(fn)`**：元素插入 DOM 后触发。
- **`context.onUnmount(fn)`**：元素移除前同步调用，用于清理资源。
- **`context.use(...)`**：与组件级 `use` 语法一致，创建的信号/派生随元素生命周期自动清理。

**TypeScript 支持**：`direct()` 返回的类型为交叉类型 `DirectiveFunction & ((props: Record<string, any>) => Node)`，以便指令可以作为 JSX 标签使用。

### 3.4 组件生命周期管理：Owner 树

框架内部通过**树形 Owner 结构**管理所有组件和分支的生命周期。每个组件、`when`/`each` 分支都对应一个 Owner 节点。Owner 节点持有子 Owner 引用、清理回调队列以及该作用域创建的渲染元素。

清理时框架沿 Owner 树递归销毁，不再依赖 DOM 树遍历。组件的挂载和卸载通过 `createApp` API 统一管理（见第四章）。

## 四、`createApp` API

`createApp` 是 kiaao 应用的入口。它创建根 Owner，管理根组件的渲染和生命周期。

```ts
function createApp(component: ComponentFunction, props?: Record<string, any>): App;

interface App {
  mount(container: string | Element): void;
  unmount(): void;
}
```

**使用示例**：

```tsx
import { createApp, use } from "kiaao";

function App() {
  const count = use(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => count(count() + 1)}>+1</button>
    </div>
  );
}

const app = createApp(App);
app.mount("#app");
// 稍后
app.unmount();
```

`mount` 将渲染好的 DOM 节点插入容器并触发所有挂载回调。`unmount` 销毁整个应用，递归清理所有资源。

### 已废弃的 API

- 全局 `mount(root, container)` 和 `unmount(root)` 已被移除。所有挂载/卸载操作通过 `createApp` 进行。
- Portal 组件不受影响——它从不依赖全局 `mount`/`unmount`，其挂载/卸载逻辑完全融入 Owner 树。

## 五、生命周期

生命周期 API 通过 `context` 参数传入，不再从框架中导入。

### 5.1 `onMount(fn)`

注册组件挂载完成后的回调。可在任何位置调用。

- **同步组件**：`triggerMount` 沿 Owner 树递归时触发。
- **异步组件**：Promise resolve 后触发。
- `fn` 可以是同步或 async 函数。错误由 `safeCall` 捕获并打印。

### 5.2 `onUnmount(fn)`

注册组件销毁前的清理回调。可在任何位置调用。

- `fn` 可以是同步或 async 函数。错误由 `safeCall` 捕获并打印。

### 5.3 `context.use`

组件级信号创建。语法与模块级 `use` 完全一致。创建的信号在组件卸载时自动清理。

## 六、内置组件

### `Portal to={...}`

将子内容渲染到指定 DOM 容器，逻辑上仍属于当前组件树。卸载时自动清除。

### `lazy(loader)`

将动态 `import()` 转换为组件。内部返回一个异步组件，加载失败时显示错误文本节点。

### `Fragment`

直接返回 `Node[]`，不产生任何 DOM 包裹节点。

## 七、更新传播与清理

### 依赖图与更新

- 定义信号：`state.value` 变更 → 遍历 `subs` → 立即执行派生 `computeFn` → 对比缓存 → 更新或短路。
- 派生写入：执行 `computeFn(value)` → 结果对比缓存 → 传播规则同上。

### 清理机制

- 每个派生节点维护 `stops` 集合和统一的 `stop()` 方法。
- 组件销毁时沿 Owner 树递归执行清理回调、断开信号订阅、移除渲染元素。
- `context.use` 创建的信号/派生 → 组件 Owner 的清理队列。
- DOM 绑定产生的匿名派生 → 组件 Owner 的清理队列。
- 指令的 `context.use` 创建的信号 → 当前活跃 Owner 的清理队列。

## 八、动画扩展（`kiaao/motion`）

`kiaao/motion` 是基于自定义指令系统构建的独立动画扩展包，通过**业务信号与动画信号分离**的模式提供声明式的进入/退出动画支持。

### 8.1 `createMotion(signal, context?)`

处理 `when` 模式的动画工厂函数。返回 `[visible, Motion]`，`visible` 是动画信号（绑定到 `when`），`Motion` 是指令组件。

### 8.2 `createGroupMotion(signal, keyFn?, context?)`

处理 `each` 模式的动画工厂函数。返回 `[visibleItems, GroupMotion]`，`visibleItems` 是动画信号（绑定到 `each`），`GroupMotion` 是指令组件。

### 8.3 内部机制

- **业务信号与动画信号分离**：用户直接操作业务信号，业务 UI 立即响应；`when`/`each` 绑定动画信号，由动画扩展内部通过派生延迟更新。
- **代际标记**：防止快速连续切换导致的竞态。
- **元素状态追踪**：在元素上通过 Symbol 维护动画状态，防止重复触发。
- **进入动画**：使用原生 WAAPI 播放 keyframe 动画。退出动画由 motion 库驱动。

## 九、内部标记

| Symbol         | 挂载位置     | 用途                                  |
| -------------- | ------------ | ------------------------------------- |
| `REACTIVE`     | 所有信号函数 | 标记信号，其值为内部状态对象          |
| `DIRECT_KEY`   | 指令函数     | 标记指令函数，供 `h()` 区分指令和组件 |
| `MOTION_STATE` | 动画元素     | 存储元素当前动画状态                  |

## 十、与 v3.4 的差异对照

| 维度         | v3.4                            | v5.0                                            |
| ------------ | ------------------------------- | ----------------------------------------------- |
| 创建可写信号 | `define(init)` → `[get, set]`   | `use(init)` → `Signal<T>`                       |
| 创建派生信号 | `derive(fn)` → `getter`         | `use(...deps, fn)` → `Signal<T>`                |
| 副作用       | `effect(fn)` → `stop`           | 派生模式（不接收返回值），返回 `Signal<void>`   |
| 细粒度订阅   | `getter(selector)`              | `use(signal, fn)`                               |
| 规范化值     | `toUse(v)` → `[get, set]`       | `use(v)`（信号直接返回自身，非信号创建新信号）  |
| 提取值       | `toVal(v)`                      | `toValue(v)`                                    |
| 读写方式     | `getter()` / `setter(v)`        | `signal()` / `signal(v)`                        |
| 生命周期注册 | `import { onMount, onUnmount }` | `context` 参数解构                              |
| 组件级信号   | 不支持（需手动管理）            | `context.use`（自动清理）                       |
| 组件函数签名 | `(props)`                       | `(props, context)`                              |
| 异步组件     | 不支持                          | 返回 Promise 即为异步组件                       |
| 自定义指令   | 不支持                          | `direct` 创建，元素级生命周期                   |
| 动画扩展     | 无                              | `kiaao/motion`，业务与动画信号分离              |
| 应用入口     | 全局 `mount`/`unmount`          | `createApp()` → `app.mount()` / `app.unmount()` |
| 生命周期管理 | DOM 绑定（INSTANCE_KEY 等）     | Owner 树（JS 内存）                             |
| Fragment     | 不支持                          | 直接返回 `Node[]`，无 DOM 痕迹                  |

## 十一、附录：属性处理策略摘要

- **FORCE_ATTRIBUTE**：标准 HTML 属性走 `setAttribute`；`value`、`checked` 等走 property 赋值
- **前缀机制**：`attr:` 强制 setAttribute，`prop:` 强制 property
- **SVG 元素**：默认所有属性走 setAttribute
- **事件**：`onXxx` 转为 `addEventListener`
- **SSR 序列化**：仅输出 `attr:` 前缀、`style`、`aria-*`/`data-*`、FORCE_ATTRIBUTE 中的属性

**文档版本**：v5.0  
**撰写日期**：2026年6月23日  
**状态**：定稿
