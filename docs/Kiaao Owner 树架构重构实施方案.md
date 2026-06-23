# Kiaao Owner 树架构重构实施方案

**状态**：草案
**关联**：[跨端架构改造方案讨论](./跨端架构改造方案讨论.md)、[Kiaao 框架架构演进探讨](./架构演进探讨.md)
**日期**：2026年6月23日

## 一、背景与动机

Kiaao 当前的响应式系统将组件实例、副作用清理函数等运行时元数据直接挂载在 DOM 节点上（通过 `INSTANCE_KEY`、`DISPOSE_KEY`、`LOCAL_EFFECTS` 等 Symbol 属性）。这种“DOM 绑定”模式在纯运行时框架中简单直接，但带来了三个结构性障碍：

1. **Fragment 实现必须使用 `display: contents` 容器**：因为多根组件需要一个宿主来承载元数据，导致 DOM 树中出现无意义的包裹节点，在表格、Flex/Grid 等布局中产生兼容性问题。
2. **水合（Hydration）难以实现**：客户端激活时必须重新执行组件逻辑并遍历 DOM 树来匹配节点，缺乏编译时坐标或稳定的 ID 体系。
3. **异步组件的清理存在盲区**：父组件在异步子组件尚未返回真实 DOM 时被卸载，无法安全取消异步操作或清理已创建的资源。

根本原因在于**生命周期以 DOM 树为宿主**——当需要卸载一个组件或分支时，必须递归遍历其 DOM 子树来寻找需要清理的元数据。这违反了“逻辑所有权”原则：一个作用域（组件、`when`/`each` 分支）创建的资源，理应由该作用域自己管理，而不是分散挂靠在外部的 DOM 节点上。

本次重构的目标是将生命周期宿主从 DOM 树迁回 JS 内存，引入**基于映射集合的 Owner 池**，使框架的清理逻辑与 DOM 树解耦。

## 二、目标架构概述：Owner 池

### 2.1 核心思想

每个组件、`when`/`each` 分支、指令作用域都对应一个 **Owner 对象**。Owner 对象之间通过 `Map<Owner, Set<Owner>>` 建立显式的父子关系，形成逻辑树。Owner 持有：

- 该作用域创建的**渲染元素引用**（用于卸载时移除；在 DOM 环境为 `Node`，在其它平台为对应类型）
- 该作用域注册的**清理回调**（包括响应式派生的 `stop` 函数、指令的 `onUnmount` 回调等）
- 挂载与卸载回调队列
- 标记自身是否已销毁的状态

### 2.2 与当前架构的关键差异

| 维度         | 当前架构（DOM 绑定）                         | Owner 池架构                                |
| ------------ | -------------------------------------------- | ------------------------------------------- |
| 生命周期宿主 | DOM 节点（`INSTANCE_KEY` 等）                | `Owner` 对象（JS 内存）                     |
| 卸载清理     | 递归遍历 DOM 树（`disposeNode`）             | 按 Owner 链递归清理子集合（`disposeOwner`） |
| 多根组件     | 必须用 `<div style="display:contents">` 包裹 | 直接返回 `Node[]`，无容器                   |
| 异步组件     | 依赖 wrapper + 标志位防止泄漏                | 占位 Owner + 注释占位符                     |
| 引用方向     | 双向（DOM 持有实例，实例持有订阅）           | 单向（Owner 持有渲染元素引用）              |

### 2.3 Owner 数据结构与存储

**存储结构**：`Map<Owner, Set<Owner>>`

每个 Owner 是 Map 的一个键，其值为它的**直接子 Owner 集合**。这种邻接表结构支持 O(1) 查找子节点，且不需要额外的 ID 管理。

```ts
interface Owner {
  cleanups: (() => void)[]; // 清理回调（派生停止、指令 onUnmount 等）
  mountCallbacks: (() => void)[]; // 挂载回调（onMount 注册的回调）
  unmountCallbacks: (() => void)[]; // 卸载回调（onUnmount 注册的回调）
  elements: Set<unknown>; // 该作用域创建的渲染元素引用（DOM 环境为 Node，跨端时为对应平台元素）
  disposed: boolean; // 是否已销毁
}

// Owner 池
const ownerPool: Map<Owner, Set<Owner>> = new Map();
```

**为什么用 `Map` 而非 `WeakMap`**：

- Owner 的生命周期是**显式管理**的（创建、挂载、销毁），不是依赖 GC 的。
- `Map` 的强引用使得 Owner 在 `disposeOwner` 调用前始终存活，且方便调试时检查当前活跃的 Owner 数量。
- `WeakMap` 的弱引用会导致“孤儿 Owner”问题：如果父 Owner 因异常路径被 GC 但子 Owner 未清理，子 Owner 残留在 `WeakMap` 中且无法被正常遍历清理。
- 兜底方案：在开发模式下，可通过 `FinalizationRegistry` 监测 Owner 是否在未调用 `disposeOwner` 的情况下被 GC，并发出警告，辅助排查泄漏。注意 GC 回调时机不可控，仅作辅助提示。

**`elements` 的命名与粒度**：

- 命名为 `elements`（而非 `domRefs`），以支持跨端扩展。在浏览器环境下，它的类型为 `Set<Node>`；在其它平台（Canvas、Native）下，将替换为对应渲染元素的类型。
- **粒度规则**：`elements` 中只存放**该 Owner 有独立所有权**的顶层渲染元素，不存放元素的内部子节点。移除根元素时，渲染平台会自动处理其内部后代节点，不需要每个子节点都出现在 `elements` 中。
- 该字段只由框架内部管理，不暴露给用户。

**父子关系的建立**：

```ts
function createOwner(parentOwner?: Owner): Owner {
  const owner: Owner = {
    cleanups: [],
    mountCallbacks: [],
    unmountCallbacks: [],
    elements: new Set(),
    disposed: false,
  };
  ownerPool.set(owner, new Set());

  if (parentOwner) {
    ownerPool.get(parentOwner)!.add(owner);
  }

  return owner;
}
```

**清理逻辑**：

```ts
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
  const children = ownerPool.get(owner);
  if (children) {
    for (const child of children) {
      disposeOwner(child);
    }
    children.clear();
  }

  // 5. 从池中删除自身
  ownerPool.delete(owner);
}
```

### 2.4 `currentOwner` 机制

Owner 的创建依赖于同步执行期间的 `currentOwner` 栈。这个机制需要与之前废弃的“全局组件实例栈”明确区分。

**机制**：

- `currentOwner` 是一个模块级变量，指向当前正在执行的组件函数的 Owner。
- 当 `h()` 进入组件模式时（`typeof tag === 'function'` 且非指令），在创建新 Owner 后，将 `currentOwner` 设为这个新 Owner，调用组件函数，调用结束后恢复为父 Owner。
- **Owner 在组件函数执行前创建**，这意味着 `context`（与 Owner 绑定）在组件函数执行期间已经有效。`context.onMount`/`onUnmount`/`use` 直接操作当前 Owner 的对应队列。
- **DOM 节点与 Owner 的绑定在组件函数返回后进行**：`handleComponent` 拿到组件函数返回的节点后，将节点注册到 Owner 的 `elements` 中。

**与废弃的全局实例栈的区别**：

| 废弃的全局实例栈                            | 这个 Owner 栈                                            |
| ------------------------------------------- | -------------------------------------------------------- |
| 用于在异步回调中追踪组件上下文              | 仅用于同步 `h()` 调用期间创建 Owner                      |
| `context.use` 需要在 `await` 后也能取到实例 | `context.use` 在组件函数执行期间直接操作 Owner，不依赖栈 |
| 异步边界后栈状态不可靠，导致归属错误        | 异步边界前 Owner 已创建，`context` 已绑定，归属明确      |

**异步组件的处理**：

对于异步组件（`async function` 或返回 Promise 的函数），Owner 在组件函数执行前创建，`context` 在此时绑定。组件函数内部的 `await` 不会改变 `context` 的归属——`context` 对象在闭包中，始终指向同一个 Owner。

```ts
async function Comp(props, { use, onMount }) {
  const [data] = use(null);
  // await 之后，context 仍然有效
  const result = await fetch("/api");
  onMount(() => console.log("mounted"));
  return <div>{result}</div>;
}
```

组件函数返回后，如果是异步组件（返回 Promise），`handleComponent` 创建注释占位符并立即绑定到 Owner。Promise resolve 后，真实节点替换注释占位符并注册到 Owner。

## 三、详细设计方案

### 3.1 `h()` 的改造：统一返回 `Node[]`

**目标**：`h()` 内部实现统一处理数组，无论组件返回单个节点还是多个节点，对外均以 `Node[]` 形式流通。类型签名放宽为 `Node | Node[]`，与 JSX 运行时保持一致。

**改造点**：

- 所有调用 `h()` 的地方，结果变量改为数组或立即扁平化处理。
- `handleSyncComponentResult` / `handleAsyncComponentResult` 接收 `Node[]`。
- `processChildren` 内部已支持数组扁平化，无需大改。
- JSX 运行时（`jsx-runtime/index.ts`）的 `createJsxElement` 返回类型从 `Node` 改为 `Node | Node[]`。

**组件模式（同步）**：

```ts
function handleComponent(tag, props) {
  // 1. 创建 Owner（执行前）
  const owner = createOwner(currentOwner);

  // 2. 创建与 Owner 绑定的 context
  const context = createContext(owner);
  // context.onMount → 注册到 owner.mountCallbacks
  // context.onUnmount → 注册到 owner.unmountCallbacks
  // context.use → 注册到 owner.cleanups

  // 3. 执行组件函数
  const prevOwner = currentOwner;
  currentOwner = owner;
  const result = tag(props, context);
  currentOwner = prevOwner;

  // 4. 异步路径
  if (result instanceof Promise) {
    return handleAsyncComponent(result, owner, context);
  }

  // 5. 同步路径：拿到 DOM 后，绑定到 Owner
  const nodes = Array.isArray(result) ? result.flat(Infinity) : [result];
  nodes.forEach((n) => owner.elements.add(n));
  return nodes;
}
```

**指令模式**：遍历 children（已扁平化数组），对每个 `Element` 调用指令函数，跳过非 Element 并在开发模式警告。最终返回原 children 数组。指令函数的 `ctx.onMount`/`onUnmount`/`use` 注册到当前 `currentOwner`。

**Fragment**：直接返回 children 数组，不创建任何包裹节点。

### 3.2 彻底消除 `display: contents`

**场景**：

| 场景                   | 当前做法                                 | 新做法                    |
| ---------------------- | ---------------------------------------- | ------------------------- |
| `<>...</>`（Fragment） | `<div style="display:contents">` 容器    | 返回 `Node[]`，无任何包裹 |
| 异步组件加载中         | `<div style="display:contents">` wrapper | 注释占位 + `replaceWith`  |
| 组件返回多个根元素     | Fragment 包裹                            | 直接返回 `Node[]`         |

`display:contents` 将不再出现在框架源码中。用户自行使用的 `display:contents` 不受影响。

### 3.3 异步组件：注释占位 + `replaceWith`

**流程**：

1. 调用异步组件函数前，Owner 已创建，`context` 已绑定。
2. 组件函数返回 Promise 后，创建注释节点 `<!--async-->`，注册到 Owner 的 `elements`。
3. 返回该注释节点（包裹在 `Node[]` 中）。
4. 父组件将注释节点插入 DOM 的预期位置。
5. Promise resolve 后，获取真实节点（`realNodes: Node[]`）。
6. 将 `realNodes` 注册到 Owner 的 `elements`，从 `elements` 中移除注释节点。
7. 调用 `placeholderComment.replaceWith(...realNodes)` 替换注释节点。
8. 在真实节点上递归触发 `triggerMount`（执行各层 Owner 的 `mountCallbacks`）。

**卸载安全**：如果在 Promise resolve 前父 Owner 被卸载，`disposeOwner(owner)` 会执行 `cleanups`、移除注释节点，并可取消正在进行的异步操作。Promise reject 时注释节点仍然存在于 DOM 中，`disposeOwner` 可正常清理。

### 3.4 组件透传（B 直接返回 A）

```tsx
const A = () => <div>A</div>;
const B = () => <A />;
```

- A 的 Owner 持有 `<div>A</div>`，作为 B 的 Owner 的子节点。
- B 的 Owner 的 `elements` 为空（B 自己没有创建节点），仅作为作用域容器，负责管理 A 的 Owner。
- 卸载 B 时，`disposeOwner(B_owner)` 会递归清理 A 的 Owner，A 的 `elements` 中的 `<div>` 被移除。

### 3.5 指令系统的简化

指令通过 `ctx.onMount`/`onUnmount`/`use` 注册的回调，现在直接注册到**当前 `currentOwner`** 的对应队列中。指令不再需要操作 DOM 节点的 Symbol 属性来挂载生命周期信息。

**指令不创建自己的 Owner**：指令的清理回调注册到宿主元素所属的组件或分支 Owner 上。当宿主元素被移除时，其所属 Owner 的清理逻辑会自动处理指令注册的回调。

### 3.6 `when`/`each` 的清理重构

**第一阶段（Owner 重构期间）**：保持属性指令的对外行为完全不变，内部实现从 DOM 遍历切换到 Owner 管理。

- `when` 分支切换：`disposeOwner(branchOwner)` 替代 `clearChildren(el)` + DOM 递归。
- `each` 条目移除：`disposeOwner(itemOwner)` 替代 `disposeNode(node)`。
- `else` 分支和映射表模式各自拥有独立的 Owner。
- `each` 的锚点节点归属于容器的 Owner，不属于任何列表项的 Owner。

### 3.7 水合与跨端准备

**代码组织**：

```
src/
  core/                  # 无渲染依赖的核心
    owner.ts             # Owner 池管理
    signal.ts            # 信号系统
    runtime.ts           # use() 等
    h.ts                 # h() 核心（调用 adapter）
    component.ts         # 组件实例（适配 Owner）
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

## 四、对当前各系统的影响汇总

| 系统          | 影响程度                                | 用户感知             |
| ------------- | --------------------------------------- | -------------------- |
| 组件系统      | 内部重构（Owner 替代实例）              | 无变化               |
| 指令系统      | 内部简化，不再操作 DOM Symbol           | 无变化               |
| `when`/`each` | 内部清理从 DOM 遍历切换到 Owner 管理    | 无变化               |
| 异步组件      | 占位从 wrapper 变为注释 + `replaceWith` | DOM 更干净，行为不变 |
| 动画扩展      | 无影响                                  | 无变化               |
| Portal        | 内部简化                                | 无变化               |
| 生命周期 API  | 无影响                                  | 无变化               |
| SSR           | 适配器层变化                            | 无变化               |

## 五、实施路径

本次重构接受**彻底的破坏性变更**，不考虑旧版本兼容。目标是一次性完成核心改造。

### 第一阶段：Owner 池核心 + `h()` 数组化（基础改造）

1. 实现 `owner.ts`：`createOwner`、`disposeOwner`、`registerDisposal`、`Map<Owner, Set<Owner>>` 结构。
2. 实现 `currentOwner` 栈机制，在 `h()` 组件模式中使用。
3. 修改 `h.ts`：内部全部以 `Node[]` 处理，同步组件/指令/Fragment 返回数组。
4. 移除 Fragment 的 `display:contents` 容器。
5. 适配 `component.ts`、`directives.ts`（`when`/`each`）到 Owner 模型。
6. 移除旧的 DOM 绑定符号（`INSTANCE_KEY`、`DISPOSE_KEY`、`LOCAL_EFFECTS` 等）或标记为废弃。
7. 所有现有测试适配。

### 第二阶段：异步组件改造

1. 实现注释占位 + `replaceWith` 机制。
2. Owner 在组件函数执行前创建，`context` 已绑定，异步清理安全。
3. 移除旧的 `wrapper` 模式。

### 第三阶段：代码组织与 adapter 抽取

1. 将 DOM 操作集中到 `dom/adapter.ts`，实现 `RenderAdapter` 接口。
2. 核心代码（`core/`）不再直接使用 `document.*`，改为通过注入的 adapter 调用。
3. 确认 SSR adapter 可复用相同接口。
4. SSR 渲染完成后遍历 `ownerPool` 清理所有未销毁的 Owner（模拟卸载但不操作 DOM，因为 SSR 输出为字符串）。

### 第四阶段：测试与文档

1. 更新所有单元测试。
2. 更新框架规范、引导文档中涉及 DOM 结构变化的部分。
3. 标记破坏性变更。

## 六、对外 API 兼容性

以下 API 签名和行为**保持不变**：

- `use(initial)` / `use(...deps, fn)` / `use(signal)`
- `context.onMount` / `context.onUnmount` / `context.use`
- `direct(fn)` 及其指令签名
- `h(tag, props, ...children)` 的类型签名（放宽为 `Node | Node[]`）
- `when` / `each` 属性指令的用法（第一阶段保持不变）
- `mount` / `unmount`
- `Portal`、`lazy`、`createMotion` / `createGroupMotion` 等扩展 API

**内部破坏性变更**（用户代码不可见）：

- 废弃所有基于 DOM 节点的元数据 Symbol（`INSTANCE_KEY` 等）
- `disposeNode` 函数移除，替换为 `disposeOwner`
- Fragment 不再生成 `display:contents` 容器
- 异步组件不再使用 `display:contents` wrapper

## 七、边界情况与注意事项

1. **信号绑定时机**：信号与文本节点/元素属性的绑定在组件函数执行期间即完成（通过 `processChildren` 传入当前 Owner），清理函数注册到 `owner.cleanups`。DOM 节点本身的注册在组件返回后批量完成。
2. **异常路径**：`h()` 的组件模式中增加 `try/finally`，确保即使组件函数抛出异常，`currentOwner` 也能被恢复。对已创建的 Owner，在 `finally` 中检查是否已注册任何资源——若无，调用 `disposeOwner(owner)` 清理。
3. **多种节点类型（HTML/SVG/注释/文本）**：Owner 的 `elements` 可以持有任意渲染元素，卸载时统一通过 adapter 移除。
4. **`each` 的锚点节点**：归属于容器的 Owner，不属于任何列表项的 Owner。
5. **`each` 的 key 重复**：检测 key 冲突，开发模式下输出警告。
6. **多个 Owner 共享节点**：透传组件等场景可能导致多个 Owner 的 `elements` 中包含同一节点。在 `removeElement` 中增加存在性检查，开发模式下输出警告。
7. **异步组件 Promise reject**：注释占位符已绑定到 Owner，`disposeOwner` 可正常清理。
8. **SSR 清理**：`renderToString` 结束时遍历 `ownerPool` 清理所有未销毁的 Owner（模拟卸载，但不操作 DOM）。
9. **`FinalizationRegistry` 兜底**：仅作为开发模式的辅助提示，GC 回调时机不可控，不能作为主要保障。

## 八、未来展望

以下方向在本次重构中不实施，但设计方案时已预留扩展空间：

### 8.1 控制流组件化

Owner 重构完成后，可将 `when`/`each` 改造为独立的 `Show`/`Each`/`Case` 组件。组件形态在 Owner 模型下更自然，模块边界更清晰，更有利于跨端支持。属性指令可保留作为兼容层或语法糖，内部委托给组件实现。

**命名**：`Show`（条件显隐）、`Each`（列表渲染）、`Case`（多分支选择）。

### 8.2 控制流组件的注释占位

`Show`/`Case`/`Each` 在条件不满足或不匹配时，返回注释节点作为位置标记，确保后续恢复挂载时能精确定位。`Each` 的锚点机制扩展为每个条目范围的结束标记。这与异步组件的注释占位 + `replaceWith` 机制一致。

### 8.3 控制流组件的多根节点与透传

- **`Show`/`Case`**：多根节点只是 `elements` 集合中有多个条目，清理逻辑不变。透传组件的节点由透传组件自己的 Owner 管理，`Show` 只持有子 Owner 的引用。
- **`Each`**：key 绑定到条目 Owner，移动/移除操作基于条目 Owner 的所有节点。多根条目的节点管理由条目 Owner 统一负责，`Each` 只操作条目 Owner 层级。

### 8.4 跨端与水合

- 通过 adapter 接口替换渲染目标，支持 Canvas、Native 等平台。
- 基于 Owner 树的稳定结构，在 SSR 时生成基于 Owner 路径的 ID，客户端水合时通过 ID 精准注入数据和事件。

## 九、总结

本次重构以 **Owner 池** 替代 **DOM 绑定** 作为 kiaao 生命周期管理的核心，解决了 Fragment 的容器依赖、异步清理安全、以及水合/跨端扩展的结构性障碍。`h()` 内部统一返回 `Node[]` 使得多根组件和 Fragment 可以完全脱离 `display:contents`。异步组件使用注释占位与 `replaceWith` 实现了更干净的 DOM 结构和更安全的清理流程。代码按 `core/dom` 分层为后续的跨端和水合奠定了基础。

**关键设计决策**：

- Owner 池采用 `Map<Owner, Set<Owner>>` 结构，保证 O(1) 查找子节点，并通过显式清理 + 可选的 `FinalizationRegistry` 兜底来保证内存安全。
- Owner 在组件函数执行前创建，`context` 与 Owner 绑定，确保异步场景下的 100% 归属覆盖。
- DOM 节点与 Owner 的绑定在组件函数返回后进行，简化了 `h()` 内部逻辑。
- 渲染元素引用字段命名为 `elements`，避免与特定平台绑定。
- `when`/`each` 第一阶段保持属性指令形态，仅做底层实现切换。控制流组件化（`Show`/`Each`/`Case`）作为后续独立迭代。

所有对外 API 保持不变，开发者使用 kiaao 的方式不受影响。
