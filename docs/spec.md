# Kiaao Framework Specification / Kiaao 框架规范

**文档类型**：Spec / 规范  
**版本**：v1.0  
**日期**：2026-07-31  
**状态**：定稿

---

## 一、设计哲学 / Design Philosophy

kiaao 的核心哲学可以浓缩为几个相互关联的原则。这些原则不是并行罗列的，而是从同一个根生长出来的：**框架是用来表达思想的，不是用来隐藏它的**。

### 1.1 数据平权 / Data Uniformity

在 kiaao 中，所有响应式数据都是信号（`Signal<T>`），所有信号都由 `use` 函数创建。不存在"原始值"和"响应式值"的区分——一旦进入框架的响应式系统，一切皆信号。同样，不存在 API 层面的"可写信号"与"只读信号"之分，每个 `Signal<T>` 同时承载读取（无参调用）和写入（有参调用）。

这一原则使得框架的核心概念数量极度收敛。开发者不需要在 `ref`、`reactive`、`computed`、`effect`、`readonly` 等多个 API 之间做选择——他只需要一个 `use`，而 `use` 在不同参数下展现出不同的行为能力，但返回值永远是 `Signal<T>`。

### 1.2 一切皆派生 / Everything is a Derivation

其他框架中所谓的"副作用"，在 kiaao 中仅仅是一个**返回值不被使用的派生信号**。当你写 `use(count, () => console.log(count()))` 时，你创建了一个派生信号，其值永远为 `undefined`。它在内部拥有与任何其他派生完全相同的结构、缓存机制、依赖追踪和生命周期管理。

这一原则消除了"派生"与"副作用"之间的概念鸿沟。框架核心不需要为"副作用"设计单独的调度、清理或错误处理机制。所有派生都是平等的。

### 1.3 显式依赖 / Explicit Dependencies

依赖关系在 `use` 调用时由参数列表静态确定。只有显式传入的信号才会被追踪。在异步回调、`setTimeout`、条件分支中访问信号，**永远不会**创建隐藏的依赖绑定。这使得依赖图完全静态、可预测，不受运行时执行流的影响。

这一原则彻底避免了 Proxy 自动收集依赖或运行时全局栈追踪所带来的"异步追踪陷阱"和不可见的性能问题。依赖图即代码中的参数列表，所见即所得。

### 1.4 API 完全同构 / Complete API Isomorphism

`use` 的任何调用形式都返回 `Signal<T>`。无论是一元调用还是多元调用，无论计算函数有无返回值，返回值结构永远不变。`use` 接收一个已存在的信号时，直接返回该信号本身（不创建新资源）——这使得 `use` 成为一个统一的"规范化入口"，将"可能是值也可能是信号"的数据统一为信号。

### 1.5 闭包即作用域 / Closures as Scope

组件实例隔离和局部作用域通过 JavaScript 原生闭包实现，框架不提供 `Context`、`provide/inject` 等专门的作用域管理 API。模块级信号通过 `import { use }` 创建，组件级信号通过 `context.use` 创建——两者的语法一致，区别仅在于所有权归属。多个组件实例共享状态时，使用工厂函数创建独立闭包。

### 1.6 显式上下文 / Explicit Context

组件实例上下文（生命周期钩子、组件级 `use`、Owner 引用）通过函数的第二个参数 `context` 显式传递，而非通过全局变量或运行时栈。这从根本上消除了异步执行导致的上下文归属问题——在 `async` 回调中调用 `context.onMount` 依然是安全的，因为 `context` 是通过闭包捕获的，不依赖执行时的隐式上下文。

### 1.7 机制在核心，策略在扩展 / Mechanism in Core, Policy in Extensions

框架核心提供最小化的原语：信号创建、元素渲染（`h`）、元素级生命周期（指令）、Owner 树管理。具体的交互策略（动画、表单验证、手势、尺寸监听等）均通过**自定义指令系统**由外部库或用户代码实现。官方动画扩展 `kiaao/motion` 即是这一原则的典型示范——它没有在核心中增加任何新 API，仅使用指令 API 构建了完整的进入/退出动画方案。

---

## 二、信号系统 / Signal System

### 2.1 `use` — 唯一入口 / The Single Entry Point

```ts
function use<T>(signal: Signal<T>): Signal<T>;
function use<T>(initialValue: T): Signal<T>;
function use<T>(...deps: [...Signal[], computeFn: (setValue?: any) => T]): Signal<T>;
```

`use` 根据参数个数和类型自动进入以下模式：

1. **一元调用 + 信号** → 直接返回该信号本身（不创建新资源）
2. **一元调用 + 非信号** → **定义模式**：创建新的可写信号
3. **多元调用** → **派生模式**：最后一个参数为计算函数，前面所有参数为依赖信号

### 2.2 `Signal<T>` 语义 / Signal Semantics

`Signal<T>` 是一个函数对象，通过 `arguments.length` 区分读取和写入：

- **无参调用 `signal()`**：返回当前值 `T`
- **有参调用 `signal(value)`**：写入值 `value`，返回 `void`

写入行为因模式而异：

- **定义信号**：将 `value` 原样替换当前值，不执行函数。`state(() => null)` 会将函数本身写入信号，而不是调用函数。
- **派生信号**：不直接替换值，而是**触发计算函数重新执行**，并将 `value` 作为参数传入计算函数（若由上游变化触发重算，则参数为 `undefined`）。新的缓存值仍由计算函数的返回值决定。

### 2.3 定义模式 / Definition Mode

**触发条件**：恰好一个参数且不是信号。

创建 `DefinitionState` 对象并挂载到 `signal[REACTIVE]`。内部状态：

```ts
interface DefinitionState<T> {
  value: T;
  subs: Set<DerivationState<any>>;
  stop: () => void;
}
```

写入时：

1. 更新 `state.value`
2. 如果新值与旧值 `!==`，遍历 `subs` 触发每个派生重算。

### 2.4 派生模式 / Derivation Mode

**触发条件**：两个或更多参数，最后一个为普通函数。

创建 `DerivationState` 对象：

```ts
interface DerivationState<T> {
  deps: Set<Signal<any>>;
  cachedValue: T;
  subs: Set<DerivationState<any>>;
  computeFn: (setValue?: any) => T;
  stops: Set<() => void>;
  stop: () => void;
}
```

- **初始化**：立即执行 `computeFn(undefined)`，结果存入 `cachedValue`。
- **读取**：直接返回 `cachedValue`，不执行计算。
- **写入**：执行 `computeFn(value)`，对比新值与 `cachedValue`，若 `!==` 则更新缓存并递归触发下游派生。
- **短路**：若计算结果与缓存值 `===`，则不通知下游，防止无效更新传播。
- **显式依赖**：依赖由参数列表决定。派生订阅所有 `deps` 中的信号，自身被下游订阅。

### 2.5 "副作用"实现 / "Side Effects"

无返回值的派生信号（`computeFn` 返回 `undefined`）即构成其他框架中的"副作用"。它们的内部机制与有返回值的派生完全相同，同样拥有缓存（永远是 `undefined`）、订阅和短路行为。框架不为它们提供特殊处理。

```js
const trigger = use(count, () => {
  console.log(count());
});
// trigger 是 Signal<undefined>，可被读取或写入。
```

### 2.6 更新传播与图结构 / Propagation and Graph

- **同步传播**：所有派生更新在当前调用栈中同步完成，没有批量更新队列或微任务调度。
- **错误处理**：计算函数中的同步错误被捕获并 `console.error`，不会中断传播。
- **图结构**：每个 `DerivationState` 同时是上游（`deps`）的订阅者和下游的发布者。依赖图是一个有向无环图（DAG），由开发者的 `use` 调用显式构建。

### 2.7 辅助函数 / Helper Functions

- **`isUse(v)`**：检查 `v` 是否拥有 `[REACTIVE]` 符号，即是否为信号。
- **`toValue(v)`**：若 `v` 是信号则返回其当前值，否则返回 `v` 本身。

---

## 三、组件系统 / Component System

### 3.1 组件函数签名 / Component Function Signature

```ts
type ComponentFunction<P = any> = (props: P, context: Context) => ComponentResult;
```

- `props`：父组件传入的数据，类型为泛型 `P`。
- `context`：框架注入的实例上下文，包含生命周期和组件级 `use`。

### 3.2 `Context` 接口 / Context Interface

```ts
interface Context {
  onMount(fn: () => void | Promise<void>): void;
  onUnmount(fn: () => void | Promise<void>): void;
  use: typeof use; // 组件级 use，自动绑定清理
  owner: Owner; // 组件自身 Owner 引用
}
```

- **`onMount`**：注册回调，在组件 DOM 插入文档后执行。可在任何地方调用（包括异步函数内部）。若挂载已完成，则立即执行。
- **`onUnmount`**：注册回调，在组件销毁前执行。用于清理外部资源。
- **`use`**：与模块级 `use` 语法完全一致，但创建的信号（及派生）自动归属当前组件 Owner，组件卸载时自动 `stop`。若传入已存在的信号，则不创建新资源，也不注册清理。
- **`owner`**：组件自身的 Owner 节点，用于高级场景（如与其他 Owner 交互）。

### 3.3 组件执行与资源整合 / Component Execution and Resource Adoption

组件函数**只运行一次**。在 `handleComponent` 中：

1. 为组件创建新的 `Owner` 节点（`componentOwner`）。
2. 调用组件函数 `tag(props, context)`。
3. 若返回值是 `Promise`，则进入异步组件流程（见 3.4）。
4. 否则，通过 `toHResult(result)` 将返回值标准化为 `HResult`。
5. 调用 `adoptResult(componentOwner, childHr)`，将子资源吸收到组件 Owner：
   - 若 `childHr.owner` 为空（非边界），将子节点、待挂接 Owner、清理函数分别吸收。
   - 若 `childHr.owner` 非空（边界 HResult），则仅将该 Owner 挂入 `componentOwner.children`，不重复注册节点。
6. 返回边界 HResult：`{ owner: componentOwner, nodes: childHr.nodes }`。

组件返回的内容只是它"制造"的 DOM 节点和子组件，所有权和生命周期被当前组件 Owner 接管。

### 3.4 异步组件 / Async Components

当组件函数返回 `Promise` 时：

1. 创建组件 Owner。
2. 立即返回边界 HResult，其中包含一个注释占位节点。
3. Promise resolve 后：
   - 标准化结果为 HResult 并通过 `adoptResult` 吸收至组件 Owner。
   - 用新节点替换占位注释。
   - 递归触发组件及子树的 `onMount` 回调（子组件的 `onMount` 先于异步父组件触发）。
4. Promise reject 时打印错误，占位节点保留。

### 3.5 `h(tag, props?, ...children)` / 渲染工厂

`h` 是所有渲染的入口，返回 `HResult` 对象。

```ts
interface HResult {
  owner: Owner | null;
  nodes: HostNode[];
  pending: Owner[];
  cleanups: CleanupFn[];
}
```

根据 `tag` 类型分发：

- **字符串（DOM 模式）**：创建原生元素，设置属性，递归处理 children。
- **函数 + 无 `DIRECT_KEY` 标记（组件模式）**：调用 `handleComponent`。
- **函数 + 有 `DIRECT_KEY` 标记（指令模式）**：见第七章。
- **`Fragment`**：直接返回 children 数组，无包裹节点。

Children 处理：

- 信号 → 创建文本节点并通过匿名派生绑定更新（匿名派生的清理函数随 `HResult.cleanups` 上浮至最近持久 Owner）。
- 函数 → 视为组件，创建独立 Owner。
- DOM 节点 → 直接附加。
- `null`/`undefined` → 跳过。
- 其他 → 转为字符串创建静态文本节点。

### 3.6 `HResult` 与资源上浮 / HResult and Resource Floating

`HResult` 是渲染的中间表示。当元素嵌套时，内部元素的 `HResult` 会被父级吸收。`pending` 收集尚未挂接到 Owner 树的子 Owner；`cleanups` 收集匿名派生的清理函数。在组件边界（组件函数返回），框架创建边界 HResult（`owner` 非空），此时所有积累的 `pending` 和 `cleanups` 已被吸收到该 Owner 中。

---

## 四、Owner 树与生命周期管理 / Owner Tree and Lifecycle Management

### 4.1 Owner 节点结构 / Owner Structure

```ts
interface Owner {
  parent: Owner | null;
  children: Owner[];
  cleanups: CleanupFn[];
  mountCallbacks: CleanupFn[];
  unmountCallbacks: CleanupFn[];
  elements: Set<HostNode>; // 该作用域直接拥有的 DOM 节点
  disposed: boolean;
}
```

### 4.2 树的构建 / Tree Construction

- 组件、指令、Portal 均创建 Owner。
- `adoptResult` 将非边界 HResult 中的 `pending` 子 Owner 挂接到父 Owner 下。
- 边界 HResult 的 Owner 直接作为子 Owner 挂接。

### 4.3 销毁顺序 / Disposal Order

`disposeOwner(owner)`：

1. 递归销毁所有子 Owner（子先于父）。
2. 执行所有 `unmountCallbacks`。
3. 执行所有 `cleanups`（停止信号、解绑事件等）。
4. 调用 `adapter.remove(node)` 移除 `elements` 中的所有节点。

### 4.4 挂载触发 / Mount Trigger

`triggerMount(owner)` 从当前 Owner 出发，深度优先遍历 `children`，执行所有 `mountCallbacks`，并递归触发子 Owner。通过 `visited` Set 防止循环。

---

## 五、控制流 / Control Flow

### 5.1 共同特征 / Common Characteristics

- 控制流组件在首次渲染时同步构建（`skipInsert`），后续变化通过信号订阅驱动更新。
- 每个分支是一个完整的组件（接收 `props` 和 `context`），拥有独立的 Owner，仅在活动时被创建。
- 使用注释锚点定位，替换内容时通过 `adapter.before(anchor, node)` 插入。

### 5.2 `<Show value={signal}>` / 条件渲染

```tsx
<Show value={show}>
  {Primary}
  {Fallback}
</Show>
```

- `value` 为 truthy 时渲染 Primary，否则渲染 Fallback（可选）。
- 切换时，先 `disposeOwner` 旧分支的 Owner，再创建新分支。

### 5.3 `<Case value={signal}>` / 多分支匹配

```tsx
<Case value={tab}>
  {{ a: CompA, b: CompB }}
  {Fallback}
</Case>
```

- 第一个子元素是映射表，根据 `value` 匹配 key；第二个子元素是 fallback（可选）。
- 切换时同样销毁旧分支、创建新分支。

### 5.4 `<Each value={signal} keyed?={fn}>` / 列表渲染

```tsx
<Each value={items} keyed={(item) => item.id}>
  {({ item, index }) => <ItemComponent item={item} index={index} />}
  {EmptyFallback}
</Each>
```

- 第一个子元素是渲染组件，接收 `{ item: Signal<T>, index: number }`。
- 第二个子元素是空状态 fallback（可选）。
- 无 `keyed` 时，数组变化全量重建。
- 有 `keyed` 时，通过 diff 算法复用未变条目，移动 DOM 节点，仅销毁移除条目并创建新增条目。

---

## 六、属性处理 / Attribute Handling

`setProps(el, props, cleanups)` 遍历 props 处理，规则如下：

- **事件**（`onXxx`）：`addEventListener` 绑定，移除函数推入 `cleanups`。
- **`attr:` 前缀**：强制 `setAttribute`。
- **`prop:` 前缀**：强制 DOM property 赋值。
- **`style`**：字符串直接设 `cssText`，对象形式清空后合并（`Object.assign`）。
- **SVG 元素**：所有属性走 `setAttribute`。
- **FORCE_ATTRIBUTE 列表**（含 `class`、`id`、`disabled` 等标准 HTML 属性）及 `aria-*`/`data-*`：走 `setAttribute`，布尔值 `true` 设空字符串，`false`/`null` 移除。
- **其他**：DOM property 赋值。
- **响应式属性值**（信号）：创建匿名派生，当信号变化时调用 `adapter.setProp`，派生清理推入 `cleanups`。

---

## 七、自定义指令 / Custom Directives

### 7.1 创建 / Creation

```ts
const MyDirective = direct((el, props, context) => { ... });
```

- `direct()` 为函数添加 `[DIRECT_KEY]` 符号，使 `h()` 进入指令模式。
- 指令函数接收：`el`（原生元素）、`props`（JSX 属性）、`context`（`{ onMount, onUnmount, use }`）。

### 7.2 执行流程 / Execution Flow

1. `h()` 检测到 `DIRECT_KEY`。
2. 创建指令 Owner。
3. 标准化 children，通过 `adoptResult` 将子资源吸收到指令 Owner。
4. 遍历所有子节点，**仅对 Element** 调用指令函数，为其绑定元素级生命周期（通过 `createDirectiveContext`）。文本/注释节点被跳过。
5. 返回边界 HResult，其 Owner 为指令 Owner。

指令的 `onMount`/`onUnmount` 与该指令 Owner 的生命周期绑定，随条件渲染自动挂载/卸载。指令不创建额外的 DOM 包裹节点。

---

## 八、平台适配 / Platform Adapters

### 8.1 `RenderAdapter` 接口 / RenderAdapter Interface

所有平台适配器实现以下接口：

```ts
interface RenderAdapter {
  el(tag: string): HostNode;
  text(text: string): HostNode;
  comment(text: string): HostNode;
  before(ref: HostNode, child: HostNode): void;
  append(parent: HostNode, child: HostNode): void;
  remove(node: HostNode): void;
  clear(parent: HostNode): void;
  setText(node: HostNode, value: string): void;
  replace(oldNode: HostNode, ...newNodes: HostNode[]): void;
  setProp(el: HostNode, key: string, value: unknown, cleanups?: CleanupFn[]): void;
  isNode(value: unknown): boolean;
  isElement(value: unknown): boolean;
  prev?(node: HostNode): HostNode;
  createStaticDerived?<T>(fn: () => T, deps: Signal[]): Signal<T>;
}
```

### 8.2 内置适配器 / Built-in Adapters

- **browserAdapter** (`dom/adapter.ts`)：基于 DOM API 实现。
- **ssrAdapter** (`server/adapter.ts`)：构建轻量 SSR 节点树，可序列化为 HTML 字符串，部分操作（如 `remove`、`before`）为空操作。提供 `createStaticDerived` 以直接求值避免响应式追踪。

### 8.3 SSR / 服务端渲染

`renderToString(component, props)` 切换至 SSR 模式，通过 `h()` 得到 SSR 节点树，调用 `serializeSSRNode` 输出 HTML。生命周期回调（`onMount`/`onUnmount`）不执行。异步组件和指令被跳过或输出占位注释。

---

## 九、动画扩展 / Animation Extension (`kiaao/motion`)

### 9.1 核心思想：业务信号与动画信号分离

`createMotion` 和 `createGroupMotion` 接收业务信号（布尔值或数组），返回一个动画信号和指令组件。动画信号滞后于业务信号变化，等待退出动画完成后再更新，从而保证退出动画的完整播放。

### 9.2 `createMotion(signal, context?)` / Show/Case 模式

返回 `[visible, Motion]`：

- `visible`：动画信号，绑定到 `<Show value={visible}>`。
- `Motion`：指令组件，包裹需动画的元素，接收 `from`、`to` 及动画选项。
- 业务信号变为 `false` 时，`Motion` 播放退出动画（`animate(el, from, options)`），动画完成后 `visible` 变为 `false`，`<Show>` 移除 DOM。
- 进入动画在 `onMount` 中播放（`animate(el, to, options)`）。

### 9.3 `createGroupMotion(signal, keyFn?, context?)` / Each 模式

返回 `[visibleItems, GroupMotion]`：

- `visibleItems`：动画信号，绑定到 `<Each value={visibleItems}>`。
- `GroupMotion`：指令组件，包裹每个列表项元素，需传 `key` prop。
- 业务数组变化时，通过 diff（若提供 `keyFn`）定位被移除项，仅对被移除项播放退出动画；动画完成后更新 `visibleItems`。

### 9.4 内部机制

- 使用代际标记（`generation.tick`）防止快速切换竞态。
- 元素动画状态通过 `MOTION_STATE` Symbol 记录，避免重复触发。
- 进入动画使用原生 WAAPI，退出动画由 `motion/mini` 驱动。

---

## 十、路由 / Router

### 10.1 设计原则

路由不引入新概念。路由表是嵌套对象（`RouteMap`），组件树也是嵌套结构，二者形状一致。路由匹配是段查找（`extractSegment` + 对象 key 查找），导航是信号更新（`push` 修改内部源信号），守卫是异步函数，元信息是组件 props，参数化路由通过 `search` 信号或自行解析 `current` 实现。

### 10.2 路由表 / RouteMap

```ts
interface RouteMap {
  "": ComponentFunction; // layout，必须存在
  [key: string]: ComponentFunction | RouteMap;
}
```

- `""` 键表示 layout，始终渲染，接收 `RouterView` prop。
- 函数值简写为 `{ "": fn }`。
- 路由表可直接从服务端菜单树转换而来。

### 10.3 `createRouter(options)` / 创建路由实例

返回 `{ Router, Link, push, current, search }`。`Router` 是顶层组件，内部使用 `RouteGroup` 和 `RouterView` 交替嵌套渲染。`onRoute` 守卫在所有导航前运行，支持重定向和异步。

### 10.4 `RouterView`

由 layout 组件通过 props 接收，负责匹配当前路径段并渲染子路由。第一个 children 作为局部 fallback。只有 `""` 键的组件能收到 `RouterView`。

### 10.5 匹配机制

`extractSegment(fullPath, base)` 从当前完整路径中截取第一段，与 `others` 对象的 key 进行 O(1) 查找。`RouterView` 内部使用 `<Case>` 组件进行分支切换。

---

## 十一、内部符号与工具 / Internal Symbols & Utilities

| Symbol           | 用途                                                |
| ---------------- | --------------------------------------------------- |
| `REACTIVE`       | 标记信号函数，挂载信号内部状态                      |
| `DIRECT_KEY`     | 标记指令函数，区分组件与指令                        |
| `HRESULT_SYMBOL` | 标记 HResult 对象，确保类型安全                     |
| `MOTION_STATE`   | 记录元素动画状态（`idle` / `entering` / `exiting`） |

`isUse`、`toValue`、`isHResult` 等工具基于上述符号实现。

---

## 十二、版本演进关键变更 / Key Changes from v6.0 to v7.0

1. **控制流组件化**：`when`/`each` 指令改为 `Show`/`Case`/`Each` 组件，子元素为函数组件，拥有独立 Owner 和生命周期。
2. **Owner 树纯化**：`adoptResult` 单次整合取代 `nestBind` 二次遍历，资源吸收更清晰。
3. **HResult 结构增强**：增加 `pending` 字段，明确区分"待挂接 Owner"和"已挂接 Owner"。
4. **Portal 拥有 Owner**：Portal 现在拥有独立持久 Owner，卸载时自动清理传送节点。
5. **首次渲染同步化**：控制流组件在首次渲染时同步构建，避免依赖 `onMount` 延迟。
6. **SSR 输出完整控制流**：SSR 下控制流组件输出实际内容而非占位注释。

---

## 十三、结语 / Conclusion

kiaao 是一个将响应式本质从框架隐性机制转变为开发者显性声明的框架。它通过极少的核心概念（`use`、`h`、`Context`、`direct`、Owner 树）构建了完整的 UI 开发模型，并将动画、路由等常见需求作为扩展实现，而不是核心 API 的一部分。这份规范旨在让读者（尤其是 AI 模型）能够完全理解框架的每一个设计选择及其背后的理念，从而能够准确地推理、生成和维护 kiaao 代码。

**框架是用来表达思想的。这份规范，就是思想的书面形式。**
