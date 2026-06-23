# Kiaao Owner 树架构重构实施方案

**状态**：草案
**关联**：[跨端架构改造方案讨论](./跨端架构改造方案讨论.md)、[Kiaao 框架架构演进探讨](./架构演进探讨.md)
**日期**：2026年6月23日
**版本**：3.0

## 一、背景与动机

Kiaao 当前的响应式系统将组件实例、副作用清理函数等运行时元数据直接挂载在 DOM 节点上（通过 `INSTANCE_KEY`、`DISPOSE_KEY`、`LOCAL_EFFECTS` 等 Symbol 属性）。这种“DOM 绑定”模式在纯运行时框架中简单直接，但带来了三个结构性障碍：

1. **Fragment 实现必须使用 `display: contents` 容器**：因为多根组件需要一个宿主来承载元数据，导致 DOM 树中出现无意义的包裹节点，在表格、Flex/Grid 等布局中产生兼容性问题。
2. **水合（Hydration）难以实现**：客户端激活时必须重新执行组件逻辑并遍历 DOM 树来匹配节点，缺乏编译时坐标或稳定的 ID 体系。
3. **异步组件的清理存在盲区**：父组件在异步子组件尚未返回真实 DOM 时被卸载，无法安全取消异步操作或清理已创建的资源。

根本原因在于**生命周期以 DOM 树为宿主**——当需要卸载一个组件或分支时，必须递归遍历其 DOM 子树来寻找需要清理的元数据。这违反了“逻辑所有权”原则：一个作用域（组件、`when`/`each` 分支）创建的资源，理应由该作用域自己管理，而不是分散挂靠在外部的 DOM 节点上。

本次重构的目标是将生命周期宿主从 DOM 树迁回 JS 内存，引入**树形 Owner 架构**，并通过修改 `h()` 的返回值为 `[Owner, Node[]]`，彻底消除全局上下文变量，使框架的清理逻辑与 DOM 树完全解耦。

## 二、目标架构概述：树形 Owner 池

### 2.1 核心思想

每个组件、`when`/`each` 分支、指令作用域都对应一个 **Owner 对象**。Owner 对象之间通过 `parent` / `children` 指针形成一棵显式的所有权树。Owner 持有：

- 该作用域创建的**渲染元素引用**（用于卸载时移除；在 DOM 环境为 `Node`，在其它平台为对应类型）
- 该作用域注册的**清理回调**（包括响应式派生的 `stop` 函数、指令的 `onUnmount` 回调等）
- 挂载与卸载回调队列
- 标记自身是否已销毁的状态

### 2.2 与当前架构的关键差异

| 维度         | 当前架构（DOM 绑定）                         | Owner 树架构                                    |
| ------------ | -------------------------------------------- | ----------------------------------------------- |
| 生命周期宿主 | DOM 节点（`INSTANCE_KEY` 等）                | `Owner` 对象（JS 内存）                         |
| 卸载清理     | 递归遍历 DOM 树（`disposeNode`）             | 递归遍历 `owner.children` 树（`disposeOwner`）  |
| 多根组件     | 必须用 `<div style="display:contents">` 包裹 | 直接返回 `Node[]`，无容器                       |
| 异步组件     | 依赖 wrapper + 标志位防止泄漏                | 占位 Owner + 注释占位符                         |
| 全局上下文   | 无（但元数据挂在 DOM 上）                    | **彻底消除**：父子关系通过 `h()` 返回值显式传递 |
| 引用方向     | 双向（DOM 持有实例，实例持有订阅）           | 单向（Owner 持有渲染元素引用）                  |

### 2.3 Owner 数据结构：树形结构

采用**树形结构**而非扁平映射。每个 Owner 直接持有其子 Owner 的引用，不需要全局池来维护关系。

```ts
interface Owner {
  parent: Owner | null; // 父 Owner（根为 null）
  children: Owner[]; // 子 Owner 列表
  cleanups: (() => void)[]; // 清理回调（派生停止、指令 onUnmount 等）
  mountCallbacks: (() => void)[]; // 挂载回调（onMount 注册的回调）
  unmountCallbacks: (() => void)[]; // 卸载回调（onUnmount 注册的回调）
  elements: Set<unknown>; // 该作用域创建的顶层渲染元素引用（DOM 环境为 Node，跨端时为对应平台元素）
  disposed: boolean; // 是否已销毁
}
```

**为什么选择树形结构**：

- **父子关系通过 `h()` 返回值显式建立**：父组件从子组件的返回值中直接拿到子 Owner，然后执行 `parent.children.push(child)` 和 `child.parent = parent`。不需要全局映射来中转。
- **遍历和清理更高效**：`disposeOwner` 和 `triggerMount` 直接遍历 `children` 数组，不需要扫描全局池或维护反向索引。
- **调试更直观**：在控制台展开根 Owner，可以看到完整的组件树结构和每个节点的 `elements`。
- **消除了对 `ownerPool` 全局 Map 的需求**：整个所有权树从根 Owner 出发即可完整遍历。

**`elements` 的命名与粒度**：

- 命名为 `elements`（而非 `domRefs`），以支持跨端扩展。在浏览器环境下，它的类型为 `Set<Node>`；在其它平台（Canvas、Native）下，将替换为对应渲染元素的类型。
- **粒度规则**：`elements` 中只存放**该 Owner 有独立所有权**的顶层渲染元素，不存放元素的内部子节点。移除根元素时，渲染平台会自动处理其内部后代节点，不需要每个子节点都出现在 `elements` 中。
- 该字段只由框架内部管理，不暴露给用户。

**创建与清理**：

```ts
function createOwner(): Owner {
  return {
    parent: null,
    children: [],
    cleanups: [],
    mountCallbacks: [],
    unmountCallbacks: [],
    elements: new Set(),
    disposed: false,
  };
}

function disposeOwner(owner: Owner): void {
  if (owner.disposed) return;
  owner.disposed = true;

  // 1. 执行卸载回调（触发 onUnmount 等）
  for (const cb of owner.unmountCallbacks) {
    try {
      cb();
    } catch (e) {
      /* log */
    }
  }
  owner.unmountCallbacks.length = 0;

  // 2. 执行清理回调（停止派生、指令清理等）
  for (const cleanup of owner.cleanups) {
    try {
      cleanup();
    } catch (e) {
      /* log */
    }
  }
  owner.cleanups.length = 0;

  // 3. 移除所有渲染元素
  for (const el of owner.elements) {
    removeElement(el); // 通过 adapter 调用具体的移除方法
  }
  owner.elements.clear();

  // 4. 递归销毁所有子 Owner
  for (const child of owner.children) {
    disposeOwner(child);
  }
  owner.children.length = 0;

  // 5. 从父 Owner 中移除自身
  if (owner.parent) {
    const idx = owner.parent.children.indexOf(owner);
    if (idx !== -1) owner.parent.children.splice(idx, 1);
  }
}
```

### 2.4 彻底消除全局上下文：`h()` 返回 `[Owner, Node[]]`

**旧架构的根本问题**：`h()` 返回 `Node`（或 `Node[]`），不包含所有权信息。组件嵌套时，父组件无法从子组件的返回值中知道“这些节点属于哪个 Owner”，因此需要一个模块级的 `currentOwner` 变量来桥接。

**新方案**：`h()` 返回 `[Owner, Node[]]`——一个携带所有权信息的真实节点元组。可以理解为 kiaao 自己的“VNode”，但它是**已解析的真实节点**，不是描述对象，不需要 Diff。

```ts
// h() 新的返回类型
type HResult = [Owner, Node[]];
```

**核心流程（以组件嵌套为例）**：

```ts
function handleComponent(tag, props) {
  // 1. 创建当前组件的 Owner
  const owner = createOwner();

  // 2. 创建与 Owner 绑定的 context
  const context = createContext(owner);

  // 3. 执行组件函数，拿到子组件的 Owner 和节点
  const [childOwner, nodes] = tag(props, context);

  // 4. 显式建立父子关系——不需要任何全局变量
  owner.children.push(childOwner);
  childOwner.parent = owner;

  // 5. 将子组件的节点注册到当前 Owner
  nodes.forEach((n) => owner.elements.add(n));

  // 6. 返回当前 Owner 和节点
  return [owner, nodes];
}
```

**全局上下文被彻底消除**：

- `processChildren` 处理信号绑定时，通过 `context.use`（已绑定 Owner）创建派生，清理函数自动注册到 `owner.cleanups`，不需要读取任何全局变量。
- DOM 元素 `h('div')` 的返回值 `[owner, [el]]` 中，`owner` 由调用方传入（或通过局部变量获取），不需要模块级状态。
- 子组件的 Owner 通过返回值向上传递给父组件，父组件显式挂载，不依赖隐式上下文。

## 三、详细设计方案

### 3.1 `h()` 的改造：统一返回 `[Owner, Node[]]`

**目标**：`h()` 在所有模式下返回 `[Owner, Node[]]` 元组。类型签名变更为 `h(...): [Owner, Node[]]`。JSX 运行时（`jsx-runtime/index.ts`）的 `createJsxElement` 返回类型同步更新。

**改造点**：

- **DOM 模式**（`tag` 为字符串）：创建 DOM 元素，处理 props 和 children。返回 `[owner, [el]]`，其中 `owner` 由调用方传入（在组件函数内部调用时，即为当前组件的 Owner）。
- **组件模式**（`tag` 为函数，非指令）：委托给 `handleComponent`，内部完成 Owner 创建、父子关系建立、节点注册。
- **指令模式**（`tag` 为函数，带 `DIRECT_KEY` 标记）：遍历 children，对每个 Element 调用指令函数，返回 `[currentOwner, children]`。
- **Fragment**：直接返回 `[owner, children]`，不创建任何包裹节点。

**组件模式（同步）的详细实现**：

```ts
function handleComponent(tag, props, parentOwner?: Owner): [Owner, Node[]] {
  // 1. 创建当前组件的 Owner
  const owner = createOwner();

  // 2. 创建与 Owner 绑定的 context
  const context = createContext(owner);

  // 3. 执行组件函数，拿到子组件的 Owner 和节点
  const [childOwner, nodes] = tag(props, context);

  // 4. 异步路径
  if (nodes.length === 1 && isPlaceholderComment(nodes[0])) {
    return handleAsyncComponent(childOwner, nodes, owner, context);
  }

  // 5. 同步路径：显式建立父子关系
  owner.children.push(childOwner);
  childOwner.parent = owner;

  // 6. 将子组件的节点注册到当前 Owner
  nodes.forEach((n) => owner.elements.add(n));

  return [owner, nodes];
}
```

**指令模式**：遍历 children（已扁平化数组），对每个 `Element` 调用指令函数，跳过非 Element 并在开发模式警告。最终返回 `[currentOwner, children]`。指令函数的 `ctx.onMount`/`onUnmount`/`use` 注册到当前 Owner。

**Fragment**：直接返回 `[owner, children]`，不创建任何包裹节点。

### 3.2 彻底消除 `display: contents`

**场景**：

| 场景                   | 当前做法                                 | 新做法                             |
| ---------------------- | ---------------------------------------- | ---------------------------------- |
| `<>...</>`（Fragment） | `<div style="display:contents">` 容器    | 返回 `[owner, Node[]]`，无任何包裹 |
| 异步组件加载中         | `<div style="display:contents">` wrapper | 注释占位 + `replaceWith`           |
| 组件返回多个根元素     | Fragment 包裹                            | 直接返回 `[owner, Node[]]`         |

`display:contents` 将不再出现在框架源码中。用户自行使用的 `display:contents` 不受影响。

### 3.3 异步组件：注释占位 + `replaceWith`

**流程**：

1. 调用异步组件函数前，Owner 已创建，`context` 已绑定。
2. 组件函数返回 Promise 后，创建注释节点 `<!--async-->`，注册到 Owner 的 `elements`。
3. 返回 `[owner, [placeholderComment]]`。
4. 父组件将注释节点插入 DOM 的预期位置。
5. Promise resolve 后，获取真实节点（`realNodes: Node[]`）。
6. 将 `realNodes` 注册到 Owner 的 `elements`，从 `elements` 中移除注释节点。
7. 调用 `placeholderComment.replaceWith(...realNodes)` 替换注释节点。
8. 从 Owner 出发递归触发 `triggerMount`。

**卸载安全**：如果在 Promise resolve 前父 Owner 被卸载，`disposeOwner(owner)` 会执行 `cleanups`、移除注释节点，并可取消正在进行的异步操作。Promise reject 时注释节点仍然存在于 DOM 中，`disposeOwner` 可正常清理。

### 3.4 组件透传（B 直接返回 A）

```tsx
const A = () => <div>A</div>;
const B = () => <A />;
```

- A 的 Owner 持有 `<div>A</div>`，其 `parent` 指向 B 的 Owner。
- B 的 Owner 的 `elements` 为空（B 自己没有创建节点），仅作为作用域容器，负责管理 A 的 Owner。
- 卸载 B 时，`disposeOwner(B_owner)` 会递归清理 A 的 Owner，A 的 `elements` 中的 `<div>` 被移除。

### 3.5 指令系统的简化

指令通过 `ctx.onMount`/`onUnmount`/`use` 注册的回调，直接注册到当前 Owner 的对应队列中。指令不再需要操作 DOM 节点的 Symbol 属性来挂载生命周期信息。

**指令不创建自己的 Owner**：指令的清理回调注册到宿主元素所属的组件或分支 Owner 上。当宿主元素被移除时，其所属 Owner 的清理逻辑会自动处理指令注册的回调。

### 3.6 `when`/`each` 的清理重构

**第一阶段（Owner 重构期间）**：保持属性指令的对外行为完全不变，内部实现从 DOM 遍历切换到 Owner 管理。

- `when` 分支切换：`disposeOwner(branchOwner)` 替代 `clearChildren(el)` + DOM 递归。
- `each` 条目移除：`disposeOwner(itemOwner)` 替代 `disposeNode(node)`。
- `else` 分支和映射表模式各自拥有独立的 Owner。
- `each` 的锚点节点归属于容器的 Owner，不属于任何列表项的 Owner。

**性能注意**：每个列表项创建一个 Owner 会带来一定的对象分配开销。对于大列表（10000+ 项），可考虑延迟创建条目 Owner（仅在实际需要清理时创建），或共享轻量级批量 Owner。这些优化可在后续迭代中进行。

### 3.7 生命周期系统：`triggerMount` 改为 Owner 遍历

**当前**：`triggerMount` 递归遍历 DOM 树的 `childNodes`，找到挂有 `INSTANCE_KEY` 的节点触发 `mountCallbacks`。

**新**：`triggerMount` 从 Owner 出发，递归遍历 `children` 树：

```ts
function triggerMount(owner: Owner, visited: Set<Owner> = new Set()) {
  if (visited.has(owner)) return;
  visited.add(owner);

  // 触发当前 Owner 的挂载回调
  for (const cb of owner.mountCallbacks) {
    safeCall(cb, "onMount");
  }
  owner.mountCallbacks.length = 0;

  // 递归触发所有子 Owner
  for (const child of owner.children) {
    triggerMount(child, visited);
  }
}
```

**异步组件 resolve 后的触发**：`handleAsyncComponent` 在 Promise resolve 后调用 `triggerMount(owner)`，传入异步组件的 Owner，从 Owner 树出发触发所有子组件的挂载回调。

**循环引用防护**：通过 `visited: Set<Owner>` 参数防止异常情况下的循环引用导致无限递归。

### 3.8 Portal 组件

Portal 在当前架构中从不依赖全局 `mount`/`unmount` 函数。它直接操作 DOM（`appendChild` / `removeChild`），因为其内容已经是被 `h()` 创建好的真实节点，不需要再走 `mount` 流程。

在 Owner 架构下，Portal 的挂载/卸载完全融入 Owner 树：

1. 父组件挂载（`app.mount()`）→ 触发根 Owner 的 `triggerMount` → 递归遍历 `children` → 到达 Portal 的 Owner → 调用 Portal 的 `onMount`。
2. Portal 的 `onMount` 内部：将内容节点从原来的父容器移动到目标容器（通过 adapter 的 DOM 操作），然后调用子 Owner 的 `triggerMount`（从 Owner 出发）。
3. 父组件卸载（`app.unmount()`）→ `disposeOwner(rootOwner)` → 递归销毁 Portal 的 Owner → 调用 Portal 的 `onUnmount` → 从目标容器移除内容。

**完全不需要全局 `mount`/`unmount`。** Portal 不受此次 API 变更的影响。

### 3.9 SSR 适配

- SSR adapter 的 `removeElement` 实现为空操作（SSR 无 DOM）。
- `renderToString` 结束时遍历 Owner 树清理所有未销毁的 Owner（执行 cleanups，跳过 element 移除）。
- 为后续水合预留：基于 Owner 树路径生成稳定 ID，序列化到 HTML 注释或属性中。

### 3.10 水合与跨端准备

**代码组织**：

```
src/
  core/                  # 无渲染依赖的核心
    owner.ts             # Owner 数据结构与创建/销毁
    signal.ts            # 信号系统
    runtime.ts           # use() 等
    h.ts                 # h() 核心（调用 adapter）
    component.ts         # 组件处理（handleComponent/handleAsyncComponent）
    directives.ts        # when/each 指令
    direct.ts            # direct() API
  dom/                   # 浏览器渲染层
    adapter.ts           # 实现 RenderAdapter 接口，操作真实 DOM
    props.ts             # 属性处理
    event.ts             # 事件绑定
  motion/                # 动画扩展
  router/                # 路由
  server/                # SSR 渲染层
```

**渲染适配器接口**：

```ts
interface RenderAdapter {
  createElement(tag: string): unknown;
  createTextNode(text: string): unknown;
  createComment(text: string): unknown;
  insertBefore(parent: unknown, child: unknown, ref: unknown | null): void;
  removeElement(el: unknown): void;
  replaceWith(oldNode: unknown, ...newNodes: unknown[]): void;
  setAttribute(el: unknown, name: string, value: string): void;
  addEventListener(el: unknown, event: string, handler: Function): void;
  // ... 其他渲染相关操作
}
```

当前 `src/dom-utils.ts` 中的函数可逐步迁移为 DOM adapter 的实现。

## 四、对外 API 变更

### 4.1 新增：`createApp`

```ts
function createApp(component: ComponentFunction, props?: Record<string, any>): App;

interface App {
  mount(container: string | Node): void;
  unmount(): void;
}
```

**使用示例**：

```tsx
import { createApp, use } from "kiaao";

function App() {
  const [count, setCount] = use(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
    </div>
  );
}

const app = createApp(App);
app.mount("#app");
// 稍后
app.unmount();
```

`createApp` 内部创建根 Owner，调用 `h(component, props)` 渲染根组件。`app.mount()` 将节点插入 DOM 并触发 `triggerMount(rootOwner)`。`app.unmount()` 调用 `disposeOwner(rootOwner)` 递归清理。

### 4.2 废弃：全局 `mount` 和 `unmount`

全局 `mount(root, container)` 和 `unmount(root)` 将被移除。所有挂载/卸载操作通过 `createApp` 返回的应用实例进行。

### 4.3 Portal 不受影响

Portal 组件从不依赖全局 `mount`/`unmount` 函数。它直接操作 DOM，其挂载/卸载逻辑完全融入 Owner 树。此次 API 变更对 Portal 无任何影响。

### 4.4 保持不变的 API

- `use(initial)` / `use(...deps, fn)` / `use(signal)`
- `context.onMount` / `context.onUnmount` / `context.use`
- `direct(fn)` 及其指令签名
- `h(tag, props, ...children)` 的类型签名（变更为返回 `[Owner, Node[]]`，但调用方式不变）
- `when` / `each` 属性指令的用法（第一阶段保持不变）
- `Portal`、`lazy`、`createMotion` / `createGroupMotion` 等扩展 API

## 五、实施路径

本次重构接受**彻底的破坏性变更**，不考虑旧版本兼容。目标是一次性完成核心改造。

### 第一阶段：Owner 树核心 + `h()` 返回值改造（基础改造）

1. 实现 `owner.ts`：树形 `Owner` 数据结构、`createOwner`、`disposeOwner`。
2. 修改 `h.ts`：所有模式返回 `[Owner, Node[]]`。实现 `handleComponent`（同步）、`handleAsyncComponent`（异步）、`handleDomMode`、`handleDirectiveMode`。
3. 修改 `processChildren`：通过 `context.use` 创建信号绑定，不依赖全局变量。
4. 移除 Fragment 的 `display:contents` 容器。
5. 适配 `component.ts`、`directives.ts`（`when`/`each`）到 Owner 模型。
6. 实现 `createApp` API，废弃全局 `mount`/`unmount`。
7. 移除旧的 DOM 绑定符号（`INSTANCE_KEY`、`DISPOSE_KEY`、`LOCAL_EFFECTS` 等）或标记为废弃。
8. 所有现有测试适配。

### 第二阶段：异步组件改造

1. 实现注释占位 + `replaceWith` 机制。
2. Owner 在组件函数执行前创建，`context` 已绑定，异步清理安全。
3. 移除旧的 `wrapper` 模式。

### 第三阶段：代码组织与 adapter 抽取

1. 将 DOM 操作集中到 `dom/adapter.ts`，实现 `RenderAdapter` 接口。
2. 核心代码（`core/`）不再直接使用 `document.*`，改为通过注入的 adapter 调用。
3. 确认 SSR adapter 可复用相同接口。
4. SSR 渲染完成后遍历 Owner 树清理所有未销毁的 Owner（执行 cleanups，跳过 element 移除）。

### 第四阶段：测试与文档

1. 更新所有单元测试。
2. 更新框架规范、引导文档中涉及 DOM 结构变化的部分。
3. 标记破坏性变更。

## 六、边界情况与注意事项

1. **信号绑定时机**：信号与文本节点/元素属性的绑定在组件函数执行期间即完成。通过 `context.use` 创建派生，清理函数自动注册到当前 Owner，不依赖全局变量。DOM 节点本身的注册在组件返回后批量完成。
2. **异常路径**：`handleComponent` 中增加 `try/finally`，确保即使组件函数抛出异常，Owner 树结构不被破坏。对已创建的 Owner，在 `finally` 中检查是否已注册任何资源——若无，调用 `disposeOwner(owner)` 清理。
3. **多种节点类型（HTML/SVG/注释/文本）**：Owner 的 `elements` 可以持有任意渲染元素，卸载时统一通过 adapter 移除。
4. **`each` 的锚点节点**：归属于容器的 Owner，不属于任何列表项的 Owner。
5. **`each` 的 key 重复**：检测 key 冲突，开发模式下输出警告。
6. **多个 Owner 共享节点**：透传组件等场景可能导致多个 Owner 的 `elements` 中包含同一节点。在 `removeElement` 中增加存在性检查，开发模式下输出警告。
7. **异步组件 Promise reject**：注释占位符已绑定到 Owner，`disposeOwner` 可正常清理。
8. **SSR 清理**：SSR adapter 的 `removeElement` 实现为空操作。
9. **`FinalizationRegistry` 兜底**：仅作为开发模式的辅助提示，GC 回调时机不可控，不能作为主要保障。
10. **树形遍历防护**：`triggerMount` 和 `disposeOwner` 均通过 `visited` 集合或 `disposed` 标记防止循环引用导致的无限递归。

## 七、未来展望

以下方向在本次重构中不实施，但设计方案时已预留扩展空间：

### 7.1 控制流组件化

Owner 重构完成后，可将 `when`/`each` 改造为独立的 `Show`/`Each`/`Case` 组件。组件形态在 Owner 模型下更自然，模块边界更清晰，更有利于跨端支持。属性指令可保留作为兼容层或语法糖，内部委托给组件实现。

**命名**：`Show`（条件显隐）、`Each`（列表渲染）、`Case`（多分支选择）。

### 7.2 控制流组件的注释占位

`Show`/`Case`/`Each` 在条件不满足或不匹配时，返回注释节点作为位置标记，确保后续恢复挂载时能精确定位。`Each` 的锚点机制扩展为每个条目范围的结束标记。这与异步组件的注释占位 + `replaceWith` 机制一致。

### 7.3 控制流组件的多根节点与透传

- **`Show`/`Case`**：多根节点只是 `elements` 集合中有多个条目，清理逻辑不变。透传组件的节点由透传组件自己的 Owner 管理，`Show` 只持有子 Owner 的引用。
- **`Each`**：key 绑定到条目 Owner，移动/移除操作基于条目 Owner 的所有节点。多根条目的节点管理由条目 Owner 统一负责，`Each` 只操作条目 Owner 层级。

### 7.4 跨端与水合

- 通过 adapter 接口替换渲染目标，支持 Canvas、Native 等平台。
- 基于 Owner 树的稳定结构，在 SSR 时生成基于 Owner 路径的 ID，客户端水合时通过 ID 精准注入数据和事件。

### 7.5 多语言实现

Kiaao 的核心（信号系统、组件模型、Owner 树）不依赖 JS 高级 API（无 Proxy、无 Reflect、无 WeakRef 强依赖），且通过 `RenderAdapter` 接口将渲染层完全抽象。这使得 Kiaao 可以相对容易地用其它语言实现（Rust/WASM、Swift、Go、Kotlin 等），只需实现信号系统、Owner 树和 `RenderAdapter` 接口即可获得完整的响应式 UI 运行时。

## 八、总结

本次重构以 **树形 Owner 架构** 替代 **DOM 绑定** 作为 kiaao 生命周期管理的核心，并通过 **`h()` 返回 `[Owner, Node[]]`** 彻底消除了全局上下文变量。Fragment 不再需要 `display:contents` 容器，异步组件使用注释占位 + `replaceWith` 实现了更干净的 DOM 结构，代码按 `core/dom` 分层为后续的跨端、水合和多语言实现奠定了基础。

**关键设计决策**：

- Owner 采用树形结构（`parent` / `children`），父子关系通过 `h()` 返回值显式建立，不需要全局映射或隐式上下文。
- `h()` 返回 `[Owner, Node[]]`——携带所有权信息的真实节点元组，是 kiaao 自己的“VNode”，但不进行 Diff。
- 信号绑定通过 `context.use` 创建派生，清理函数自动注册到当前 Owner，不依赖全局变量。
- 废弃全局 `mount`/`unmount`，由 `createApp` API 替代，根 Owner 由应用实例管理。
- `when`/`each` 第一阶段保持属性指令形态，仅做底层实现切换。控制流组件化（`Show`/`Each`/`Case`）作为后续独立迭代。

所有开发者直接使用的 API（`use`、`context`、`direct`、`h()`）保持不变或仅放宽类型签名，使用 kiaao 的方式在大部分场景下不受影响。`mount`/`unmount` 的变更是本次唯一的对外破坏性变更。
