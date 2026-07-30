# Kiaao 框架规范 v7.0

**宣传语**：更少的概念，更少的编译，更多的控制，更高的性能。

**设计哲学**：把响应式的本质从框架的隐性机制变成开发者的显性声明。所有状态通过单一 API 创建，所有信号在 API 层面完全同构。组件只运行一次，DOM 更新精确到节点。机制在核心，策略在扩展。

---

## 零、架构原则

### 数据平权

所有数据都是信号，所有信号都由 `use` 产生。不存在“原始值”和“响应式值”的区分，也不存在“可写信号”和“只读信号”在 API 层面的区分。所有信号都是 `Signal<T>` 函数对象，同时承载读取和写入。

### 一切皆派生

没有副作用，只有不读返回值的派生。当开发者写 `use(a, b, () => { console.log(a()) })` 时，创建了一个派生信号，其值永远为 `undefined`。它与其他派生信号拥有完全相同的结构、缓存机制和生命周期。

### API 完全同构

`use` 在任何情况下都返回 `Signal<T>`。无论是一元调用还是多元调用，无论 `computeFn` 是否有返回值，返回值结构永远不变。`use` 接收信号时直接返回该信号本身，接收普通值时创建新信号——行为统一，语义一致。

### 依赖显式声明

依赖关系在 `use` 调用时由参数列表静态确定，绝不依赖运行时执行栈。异步回调中访问信号不会产生依赖绑定，条件分支不会动态改变依赖列表。只有写在参数列表里的才被追踪。

### 闭包即作用域

组件实例隔离和局部作用域通过 JavaScript 原生闭包实现。工厂函数每次调用创建独立的闭包和信号。框架不提供 `Context`、`provide/inject` 等作用域管理 API。

### 显式上下文

组件实例上下文通过函数参数显式传递，而非依赖全局栈。生命周期 API 和组件级 `use` 是 `context` 对象的方法，不是从框架导入的全局函数。这从根本上消除了异步执行导致的上下文归属问题。

### 机制在核心，策略在扩展

框架核心提供最小化的原语（信号创建、DOM 渲染、元素级生命周期），具体的行为策略（动画、验证、手势等）通过自定义指令系统由外部库或用户代码实现。动画扩展包 `kiaao/motion` 便是这一原则的典型体现。

---

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
- 有参调用 `signal(value)` → 写入，返回 `void`
- 定义信号写入时将 `value` 原样替换当前值，不执行其中的函数

```js
const count = use(0);

count(); // 读取 → 0
count(5); // 写入 → 5
count(count() + 1); // 读取后再写入

const state = use(null);
state(() => null); // 将函数本身写入信号，不会调用函数
state()(); // 显式调用信号中存储的函数
state((() => null)()); // 显式调用后写入返回值 null
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
- 定义信号后续写入时遵循相同规则：`state(() => null)` 会将函数本身写入为信号值，而不是执行函数获取返回值。

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
  (value: T): void;
}

function use<T>(signal: Signal<T>): Signal<T>;
function use<T>(initialValue: T): Signal<T>;
function use<T>(...deps: [...Signal[], (setValue?: any) => T]): Signal<T>;
function use(...deps: [...Signal[], (setValue?: any) => void]): Signal<void>;
```

---

## 二、辅助工具函数

### `isUse(v: any): boolean`

判断一个值是否是信号。检查 `v?.[REACTIVE] !== undefined`。

### `toValue(v: any): any`

若 `v` 是信号则返回 `v()`（当前值），否则返回 `v` 本身。

### 已移除

- `toUse`：功能被 `use` 吸收。`use(signal)` 直接返回已有信号。
- `toVal`：重命名为 `toValue`。
- `Getter<T>` / `Setter<T>` 类型：统一为 `Signal<T>`。
- 逻辑只读信号：kiaao 不提供独立只读类型，常见做法是“派生信号 + 忽略 setter 参数”的模式（参见 guide/reactivity.md）。

---

## 三、`h(tag, props?, ...children)`

统一创建函数。返回值为 `HResult` 对象，包含 `owner`、`nodes`、`pending`、`cleanups` 字段。

```ts
interface HResult {
  owner: Owner | null;
  nodes: HostNode[];
  pending: Owner[];
  cleanups: CleanupFn[];
}
```

`h()` 根据第一个参数的类型分三种模式：DOM 模式、组件模式、指令模式。

### 3.1 DOM 模式（`tag` 为字符串）

创建真实 DOM 元素，对 `children` 递归处理。

**无效 Tag 兜底**：当 `tag` 既非字符串也非函数时，返回空白注释节点。

**Fragment**：JSX 的 `<>...</>` 语法直接返回子节点数组，不产生任何包裹节点。与原生 Fragment 行为一致，无 DOM 痕迹。

**Children 中的无效值**：`null`、`undefined` 被静默跳过。数组被递归摊平（单层 `flat()`）。`false` 按字符串 `"false"` 渲染（保持历史行为）。

**子节点处理**：

- 若子节点为信号：创建文本占位，通过匿名派生绑定动态更新。清理函数收集至 `HResult.cleanups`，随资源上浮至最近持久 Owner。
- 若子节点为函数：视为组件，通过 `handleComponent` 创建独立 Owner，返回边界 HResult。
- 若为 DOM 节点：直接附加。
- 其他值：转为字符串创建静态文本节点。

#### 属性处理（`setProp` 流程）

- **事件属性**（`onXxx`）：转换为 `addEventListener` 绑定，清理函数压入 `HResult.cleanups`。
- **`style`**：接受字符串或对象。对象形式合并到 `element.style`。
- **前缀**：`attr:` 强制 `setAttribute`，`prop:` 强制 DOM property 赋值。
- **SVG 元素**：默认所有属性走 `setAttribute`。
- **FORCE_ATTRIBUTE 列表**：标准 HTML 属性走 `setAttribute`；不在列表中的走 property 赋值。
- **`aria-*` / `data-*`**：无条件走 `setAttribute`。
- **布尔属性**：`true` 设空字符串，`false` 移除。
- 响应式属性值（信号）自动创建匿名派生进行更新，清理函数收集至 `HResult.cleanups`。

### 3.2 组件模式（`tag` 为函数，且不带有 `DIRECT_KEY` 标记）

组件函数签名：`(props, context)`。

#### 3.2.1 `context` 接口

```ts
interface ComponentContext {
  use: typeof use;
  onMount(fn: () => void | Promise<void>): void;
  onUnmount(fn: () => void | Promise<void>): void;
  owner: Owner; // 当前组件自身的 Owner
}
```

#### 3.2.2 组件执行与资源整合

组件函数调用前，框架创建当前组件的 Owner（`componentOwner`）。调用后，框架自动：

1. 将返回值规范化为 `HResult`（`toHResult`）。
2. 通过 `adoptResult(componentOwner, childHr)` 吸收子资源：
   - 若 `childHr.owner` 为空：将 `childHr.nodes` 注册到 `componentOwner.elements`，挂接 `childHr.pending` 中的 Owner，合并 `childHr.cleanups`。
   - 若 `childHr.owner` 非空（边界 HResult）：仅挂接该 Owner 至 `componentOwner.children`，不重复注册节点。
3. 返回组件自身的边界 HResult：`{ owner: componentOwner, nodes: childHr.nodes }`。

这使得组件只需返回渲染内容，框架自动管理生命周期和节点归属。

#### 3.2.3 异步组件

当组件函数返回 `Promise` 时，为异步组件。流程：

1. 创建组件 Owner。
2. 立即返回占位 HResult，其中包含注释占位节点，`owner` 指向组件 Owner（边界）。
3. Promise resolve 后：
   - 将结果转为 HResult，通过 `adoptResult` 吸收至组件 Owner。
   - 用新节点替换占位注释。
   - 触发组件及子树的 `onMount` 回调。
4. Promise reject 时打印错误。

### 3.3 指令模式（`tag` 为函数，且带有 `DIRECT_KEY` 标记）

指令通过 `direct` 函数创建。指令拥有独立的持久 Owner，不创建额外的 DOM 包裹元素。

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

#### 3.3.2 元素级生命周期与过滤

指令处理子节点后，遍历所有子节点，**仅对真实 Element（通过 `adapter.isElement` 判断）调用指令函数**。文本节点、注释节点等将被跳过，以保证指令（如动画）能安全操作 DOM。

指令 Owner 随条件渲染自动挂载/卸载，其上的 `onMount`/`onUnmount` 在相应时机触发。

**TypeScript 支持**：`direct()` 返回的类型为交叉类型 `DirectiveFunction & ((props: Record<string, any>) => HResult)`，以便指令可以作为 JSX 标签使用。

---

## 四、控制流组件

框架提供 `Show`、`Case`、`Each` 三个控制流组件，用于条件渲染和列表渲染。它们遵循统一的首次渲染同步化模式：首次渲染在组件函数体内同步完成，后续变化通过信号订阅驱动 DOM 更新。

**重要**：控制流组件的子元素是组件——接收 `(props, context)` 两个参数，与其他组件完全一致。每个分支拥有独立的 Owner，仅在分支变为活动状态时被创建。

### 4.1 `<Show value={signal}>`

根据 `value` 的真值渲染 `primary` 或 `fallback` 组件。

```tsx
<Show value={show}>
  {(props, ctx) => <Primary />}
  {(props, ctx) => <Fallback />}
</Show>
```

- 第一个子组件在 `value` 为 truthy 时渲染。
- 第二个子组件（可选）在 `value` 为 falsy 时渲染。
- 传入组件函数引用或箭头包装均可，效果等价。
- 首次渲染同步执行，返回 `[...分支节点, 注释锚点]`。
- 后续变化通过信号订阅，在锚点前替换分支内容。

### 4.2 `<Case value={signal}>`

多分支匹配组件。第一个子元素是映射表对象，其中每个值是组件。第二个子元素（可选）是 fallback 组件。

```tsx
<Case value={tab}>
  {{
    a: (props, ctx) => <CompA />,
    b: (props, ctx) => <CompB />,
  }}
  {(props, ctx) => <Fallback />}
</Case>
```

- 根据 `value` 与映射表 key 匹配，调用对应的组件进行渲染。
- 无匹配时调用 fallback 组件（若有）。
- 每个分支仅在其 key 匹配时被调用。

### 4.3 `<Each value={signal} keyed?={(item, index) => key}>`

列表渲染组件。

```tsx
<Each value={list}>
  {({ item, index }) => <ItemComponent item={item} index={index} />}
  {(props, ctx) => <Empty />}
</Each>
```

- 第一个子元素是渲染组件，接收 `{ item: Signal<T>, index: number }` 作为 props。
- 第二个子元素（可选）是空状态 fallback 组件，当数组为空时调用。
- `keyed` 函数接收原始值 `T`（非 `Signal<T>`），用于指定 item 的稳定标识，实现增量 DOM 更新。
- 首次渲染同步构建所有条目（或 fallback），返回 `[...条目节点, 锚点]`。
- 后续变化根据 `keyed` 进行 diff 或全量重建，通过锚点定位。

---

## 五、组件生命周期管理：Owner 树

框架内部通过**树形 Owner 结构**管理所有组件、指令和 Portal 的生命周期。每个组件/指令/Portal 都对应一个 Owner 节点。Owner 持有：

- `children`：子 Owner 引用
- `cleanups`：清理回调队列
- `mountCallbacks` / `unmountCallbacks`：生命周期回调
- `elements`：该作用域直接拥有的 DOM 节点集合

清理时框架沿 Owner 树递归销毁：先递归卸载子 Owner，再执行自身 `unmountCallbacks` 和 `cleanups`，最后从 DOM 移除 `elements` 中的节点。不再依赖 DOM 树遍历。

### 应用入口：`createApp`

```ts
function createApp(component: ComponentFunction): App;

interface App {
  mount(container: string | Element): void;
  unmount(): void;
}
```

`createApp` 接收根组件函数，内部调用 `h(component)` 完成渲染，管理整个应用的生命周期。`mount` 支持 CSS 选择器字符串或直接传入 DOM 元素。`unmount` 销毁整个应用。

```tsx
const app = createApp(App);
app.mount("#root");
```

---

## 六、生命周期回调

生命周期 API 通过 `context` 参数传入，不再从框架中导入。

### `onMount(fn)`

注册组件挂载完成后的回调。可在任何位置调用。

- 首次渲染后，框架沿 Owner 树递归触发所有 `mountCallbacks`。
- 异步组件在 Promise resolve 后触发。
- `fn` 可以是同步或 async 函数。错误由框架捕获并打印。

### `onUnmount(fn)`

注册组件销毁前的清理回调。可在任何位置调用。

- 组件卸载时（条件切换或整体销毁）同步调用。
- `fn` 可以是同步或 async 函数。错误由框架捕获并打印。

### `context.use`

组件级信号创建。语法与模块级 `use` 完全一致。创建的信号（及派生）在组件卸载时自动清理，无需手动管理。

---

## 七、内置组件

### `Portal to={...}`

将子内容渲染到指定 DOM 容器，逻辑上仍属于当前组件树。Portal 拥有自己的持久 Owner，负责管理搬运的节点。卸载时自动从目标容器移除节点。若目标容器不存在，返回占位注释节点，不渲染子内容，也不会自动重试。

```tsx
<Portal to="#tooltip">
  <div>提示内容</div>
</Portal>
```

### `lazy(loader)`

将动态 `import()` 转换为组件。内部返回一个异步组件，加载失败时显示错误文本节点。SSR 环境下返回占位注释节点（异步组件无法在 SSR 中加载）。

### `Fragment`

直接返回子节点数组，不产生任何 DOM 包裹节点。

---

## 八、更新传播与清理

### 依赖图与更新

- 定义信号：`state.value` 变更 → 遍历 `subs` → 立即执行派生 `computeFn` → 对比缓存 → 更新或短路。
- 派生写入：执行 `computeFn(value)` → 结果对比缓存 → 传播规则同上。

### 清理机制

- 每个派生节点维护 `stops` 集合和统一的 `stop()` 方法。
- 组件销毁时沿 Owner 树递归执行 `unmountCallbacks` 和 `cleanups`，断开信号订阅，移除 DOM 元素。
- `context.use` 创建的信号/派生自动归入组件 Owner 的清理队列。
- DOM 绑定产生的匿名派生清理函数通过 `HResult.cleanups` 传递，最终归入最近持久 Owner 的 `cleanups`。
- 指令的 `context.use` 创建的信号归入指令 Owner 的清理队列。

---

## 九、动画扩展（`kiaao/motion`）

`kiaao/motion` 是基于自定义指令系统构建的独立动画扩展包，通过**业务信号与动画信号分离**的模式提供声明式的进入/退出动画支持。

### 9.1 `createMotion(signal, context?)`

处理 Show/Case 模式的动画工厂函数。返回 `[visible, Motion]`，`visible` 是动画信号（绑定到控制流组件），`Motion` 是指令组件。

### 9.2 `createGroupMotion(signal, keyFn?, context?)`

处理 Each 模式的动画工厂函数。返回 `[visibleItems, GroupMotion]`，`visibleItems` 是动画信号（绑定到 `Each`），`GroupMotion` 是指令组件。

### 9.3 内部机制

- **业务信号与动画信号分离**：用户直接操作业务信号，业务 UI 立即响应；控制流组件绑定动画信号，由动画扩展内部通过派生延迟更新。
- **代际标记**：防止快速连续切换导致的竞态。
- **元素状态追踪**：在元素上通过 Symbol 维护动画状态，防止重复触发。
- **进入动画**：使用原生 WAAPI 播放 keyframe 动画。退出动画由 motion 库驱动。

---

## 十、平台适配与 SSR

框架通过 `RenderAdapter` 接口抽象平台差异。内置 `browserAdapter`（DOM）和 `ssrAdapter`（服务端字符串生成）。通过 `setAdapter` 全局注册，`setRenderMode` 切换模式。

SSR 适配器在服务端同步渲染组件树，生成可序列化的节点树，最终通过 `renderToString` 输出 HTML 字符串。控制流组件在 SSR 下自动输出完整内容，无需特殊处理。

水合（Hydration）支持将在后续版本中引入。

---

## 十一、内部标记

| Symbol           | 挂载位置     | 用途                                  |
| ---------------- | ------------ | ------------------------------------- |
| `REACTIVE`       | 所有信号函数 | 标记信号，其值为内部状态对象          |
| `DIRECT_KEY`     | 指令函数     | 标记指令函数，供 `h()` 区分指令和组件 |
| `HRESULT_SYMBOL` | HResult 对象 | 标记 `h()` 返回的 HResult             |
| `MOTION_STATE`   | 动画元素     | 存储元素当前动画状态                  |

---

## 十二、与 v6.0 的差异对照

| 维度           | v6.0（旧）                       | v7.0（本版）                                 |
| -------------- | -------------------------------- | -------------------------------------------- |
| 控制流         | `when`/`each` 属性指令           | `Show`/`Case`/`Each` 组件（子元素为函数）    |
| 生命周期管理   | 轻量 Owner + `nestBind` 二次遍历 | 纯化 Owner 树，`adoptResult` 单次整合        |
| HResult 结构   | `{ owner, nodes, cleanups? }`    | `{ owner, nodes, pending, cleanups }`        |
| 组件返回值整合 | 需 `nestBind` 后置处理           | 组件内部自动 `adoptResult`，返回边界 HResult |
| 指令处理       | 不区分 Element                   | `adapter.isElement` 过滤，只对 Element 执行  |
| Portal         | 无独立 Owner                     | 拥有持久 Owner                               |
| 首次渲染       | 控制流依赖 `onMount` 延迟        | 控制流同步首次渲染（`skipInsert`）           |
| SSR            | 控制流输出空注释                 | 控制流输出完整内容                           |
| 异步组件       | 不支持 SSR                       | SSR 返回占位注释                             |
| 信号 API       | 无变化                           | 无变化                                       |

---

**文档版本**：v7.0  
**撰写日期**：2026年6月30日  
**状态**：定稿
