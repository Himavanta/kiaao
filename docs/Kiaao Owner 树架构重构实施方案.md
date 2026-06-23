# Kiaao Owner 树架构重构实施方案

**状态**：草案  
**关联**：[跨端架构改造方案讨论](./跨端架构改造方案讨论.md)、[Kiaao 框架架构演进探讨](./架构演进探讨.md)  
**日期**：2026年6月22日

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
- 标记自身是否已销毁的状态

### 2.2 与当前架构的关键差异

| 维度         | 当前架构（DOM 绑定）                         | Owner 池架构                                |
| ------------ | -------------------------------------------- | ------------------------------------------- |
| 生命周期宿主 | DOM 节点（`INSTANCE_KEY` 等）                | `Owner` 对象（JS 内存）                     |
| 卸载清理     | 递归遍历 DOM 树（`disposeNode`）             | 按 Owner 链递归清理子集合（`disposeOwner`） |
| 多根组件     | 必须用 `<div style="display:contents">` 包裹 | 直接返回 `Node[]`，无容器                   |
| 异步组件     | 依赖 wrapper + 标志位防止泄漏                | 占位 Owner，卸载时直接清理                  |
| 引用方向     | 双向（DOM 持有实例，实例持有订阅）           | 单向（Owner 持有渲染元素引用）              |

### 2.3 Owner 数据结构与存储

**存储结构**：`Map<Owner, Set<Owner>>`

每个 Owner 是 Map 的一个键，其值为它的**直接子 Owner 集合**。这种邻接表结构支持 O(1) 查找子节点，且不需要额外的 ID 管理。

```ts
interface Owner {
  cleanups: (() => void)[]; // 清理回调（派生停止、指令 onUnmount 等）
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
- 兜底方案：在开发模式下，可通过 `FinalizationRegistry` 监测 Owner 是否在未调用 `disposeOwner` 的情况下被 GC，并发出警告，辅助排查泄漏。

**`elements` 的命名**：

- 当前方案中此字段暂命名为 `elements`，而非 `domRefs`，以支持跨端扩展。在浏览器环境下，它的类型为 `Set<Node>`；在其它平台（Canvas、Native）下，将替换为对应渲染元素的类型。
- 该字段只由框架内部管理，不暴露给用户。

**父子关系的建立**：

```ts
function createOwner(parentOwner?: Owner): Owner {
  const owner: Owner = {
    cleanups: [],
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

  // 1. 执行清理回调（停止派生、触发 onUnmount 等）
  for (const cleanup of owner.cleanups) {
    try {
      cleanup();
    } catch (e) {
      /* log */
    }
  }
  owner.cleanups.length = 0;

  // 2. 移除所有渲染元素
  for (const el of owner.elements) {
    removeElement(el); // 通过 adapter 调用具体的移除方法
  }
  owner.elements.clear();

  // 3. 递归销毁所有子 Owner
  const children = ownerPool.get(owner);
  if (children) {
    for (const child of children) {
      disposeOwner(child);
    }
    children.clear();
  }

  // 4. 从池中删除自身
  ownerPool.delete(owner);
}
```

## 三、详细设计方案

### 3.1 `h()` 的改造：统一返回 `Node[]`

**目标**：`h()` 内部实现统一处理数组，无论组件返回单个节点还是多个节点，对外均以 `Node[]` 形式流通（类型签名保持 `Node | Node[]`，内部实现全部走数组）。

**改造点**：

- 所有调用 `h()` 的地方，结果变量改为数组或立即扁平化处理。
- `handleSyncComponentResult` / `handleAsyncComponentResult` 接收 `Node[]`。
- `processChildren` 内部已支持数组扁平化，无需大改。

**组件模式（同步）**：

```ts
function handleSyncComponent(tag, props, context) {
  const owner = createOwner(currentOwner);
  const result = tag(props, context);
  // result 可能是 Node 或 Node[]
  const nodes = Array.isArray(result) ? result.flat(Infinity) : [result];
  nodes.forEach((n) => owner.elements.add(n));
  return nodes;
}
```

**指令模式**：遍历 children（已扁平化数组），对每个 `Element` 调用指令函数，跳过非 Element 并在开发模式警告。最终返回原 children 数组（或单元素展开以保持兼容性）。

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

1. 调用异步组件函数前，创建**占位 Owner**（`placeholderOwner`），其父为当前 Owner。
2. 创建一个注释节点 `<!--async-->`，注册到 `placeholderOwner.elements`。
3. 返回该注释节点（包裹在 `Node[]` 中）。
4. 父组件将注释节点插入 DOM 的预期位置。
5. Promise resolve 后，获取真实节点（`realNodes: Node[]`）。
6. 将 `realNodes` 注册到 `placeholderOwner.elements`，从 `elements` 中移除注释节点。
7. 调用 `placeholderComment.replaceWith(...realNodes)` 替换注释节点。
8. 在真实节点上递归触发 `triggerMount`。

**卸载安全**：如果在 Promise resolve 前父 Owner 被卸载，`disposeOwner(placeholderOwner)` 会清理注释节点，并可取消正在进行的异步操作（通过 `AbortController` 或类似机制）。

### 3.4 组件透传（B 直接返回 A）

```tsx
const A = () => <div>A</div>;
const B = () => <A />;
```

- A 的 Owner 持有 `<div>A</div>`，作为 B 的 Owner 的子节点。
- B 的 Owner 的 `elements` 为空（B 自己没有创建节点），仅作为作用域容器。
- 卸载 B 时，`disposeOwner(B_owner)` 会递归清理 A 的 Owner，A 的 `elements` 中的 `<div>` 被移除。

### 3.5 指令系统的简化

指令通过 `context.onMount`/`onUnmount`/`use` 注册的回调，现在直接注册到当前元素所属的 **Owner** 上（通过 `owner.cleanups.push(...)`）。指令不再需要操作 DOM 节点的 Symbol 属性来挂载生命周期信息。元素被移除时，其所属 Owner 的清理逻辑会自动处理。

### 3.6 `when`/`each` 的清理重构

**当前行为保持不变**（`when` 控制子节点显隐、`each` 通过 key 做增量更新）。内部实现从 DOM 遍历改为 Owner 管理：

- `when` 分支切换：`disposeOwner(branchOwner)` 替代 `clearChildren(el)` + DOM 递归。
- `each` 条目移除：`disposeOwner(itemOwner)` 替代 `disposeNode(node)`。
- `else` 分支和映射表模式各自拥有独立的 Owner。

`when`/`each` 的上层行为是否重新设计（如控制宿主元素自身）将在架构重构完成后另行评估。本次重构仅涉及底层实现。

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

## 四、实施路径

本次重构接受**彻底的破坏性变更**，不考虑旧版本兼容。目标是一次性完成核心改造。

### 第一阶段：Owner 池核心 + `h()` 数组化（基础改造）

1. 实现 `owner.ts`：`createOwner`、`disposeOwner`、`registerDisposal`、`Map<Owner, Set<Owner>>` 结构。
2. 修改 `h.ts`：内部全部以 `Node[]` 处理，同步组件/指令/Fragment 返回数组。
3. 移除 Fragment 的 `display:contents` 容器。
4. 适配 `component.ts`、`directives.ts`（`when`/`each`）到 Owner 模型。
5. 移除旧的 DOM 绑定符号（`INSTANCE_KEY`、`DISPOSE_KEY`、`LOCAL_EFFECTS` 等）或标记为废弃。
6. 所有现有测试适配。

### 第二阶段：异步组件改造

1. 实现注释占位 + `replaceWith` 机制。
2. 引入占位 Owner，确保异步清理安全。
3. 移除旧的 `wrapper` 模式。

### 第三阶段：代码组织与 adapter 抽取

1. 将 DOM 操作集中到 `dom/adapter.ts`，实现 `RenderAdapter` 接口。
2. 核心代码（`core/`）不再直接使用 `document.*`，改为通过注入的 adapter 调用。
3. 确认 SSR adapter 可复用相同接口。

### 第四阶段：测试与文档

1. 更新所有单元测试。
2. 更新框架规范、引导文档中涉及 DOM 结构变化的部分。
3. 标记破坏性变更。

## 五、对外 API 兼容性

以下 API 签名和行为**保持不变**：

- `use(initial)` / `use(...deps, fn)` / `use(signal)`
- `context.onMount` / `context.onUnmount` / `context.use`
- `direct(fn)` 及其指令签名
- `h(tag, props, ...children)` 的类型签名（仍声明为返回 `Node | Node[]`）
- `when` / `each` 属性指令的用法
- `mount` / `unmount`
- `Portal`、`lazy`、`createMotion` / `createGroupMotion` 等扩展 API

**内部破坏性变更**（用户代码不可见）：

- 废弃所有基于 DOM 节点的元数据 Symbol（`INSTANCE_KEY` 等）
- `disposeNode` 函数移除，替换为 `disposeOwner`
- Fragment 不再生成 `display:contents` 容器
- 异步组件不再使用 `display:contents` wrapper

## 六、边界情况与注意事项

1. **非 Element 节点（文本、注释）**：Owner 的 `elements` 可以持有任意渲染元素，卸载时统一通过 adapter 移除。
2. **信号绑定产生的文本节点**：在 `processChildren` 中创建时，会注册到当前 Owner 的 `cleanups` 中；其渲染元素本身也会加入 `elements`。Fragment 中混有这类节点时，归属清晰。
3. **指令返回数组的处理**：指令模式下单子节点会展开，多子节点返回数组。与 `h()` 数组化一致。
4. **异步组件快速切换**：代际标记（`tick`）机制仍然需要，防止旧的 `setVisible` 覆盖新状态。
5. **水合时 DOM 复用**：adapter 的创建方法在水合模式下可以返回现有 DOM 引用，不需要新建。

## 七、总结

本次重构以 **Owner 池** 替代 **DOM 绑定** 作为 kiaao 生命周期管理的核心，解决了 Fragment 的容器依赖、异步清理安全、以及水合/跨端扩展的结构性障碍。`h()` 内部统一返回 `Node[]` 使得多根组件和 Fragment 可以完全脱离 `display:contents`。异步组件使用注释占位与 `replaceWith` 实现了更干净的 DOM 结构和更安全的清理流程。代码按 `core/dom` 分层为后续的跨端和水合奠定了基础。

**关键设计决策**：

- Owner 池采用 `Map<Owner, Set<Owner>>` 结构，保证 O(1) 查找子节点，并通过显式清理 + 可选的 `FinalizationRegistry` 兜底来保证内存安全。
- 渲染元素引用字段暂命名为 `elements`，避免与特定平台绑定。
- `when`/`each` 的上层行为保持不变，本次仅重构底层实现。是否重新设计其语义将在后续另行评估。

所有对外 API 保持不变，开发者使用 kiaao 的方式不受影响。
