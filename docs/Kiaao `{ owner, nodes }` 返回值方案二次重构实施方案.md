# Kiaao `{ owner, nodes }` 返回值方案二次重构实施方案

**状态**：草案
**关联**：[Owner 树架构重构实施方案](./Owner树架构重构实施方案.md)
**日期**：2026年6月23日
**版本**：1.0

## 一、背景与动机

在第一次 Owner 树架构重构（`currentOwner` 方案）中，我们成功将生命周期宿主从 DOM 树迁移到了 JS 内存中的树形 Owner 结构，并实现了 Fragment 无容器、异步安全清理、`createApp` 入口等关键目标。然而，该方案保留了一个最小化的全局上下文变量 `currentOwner`，用于在同步 `h()` 调用期间传递当前组件的 Owner 引用。

`currentOwner` 的存在虽然经过严格作用域限定，但它仍然是模块级可变状态，在某些场景（如异步组件 Promise 回调）下需要显式地临时恢复和恢复，增加了实现的脆弱性和理解成本。此外，全局上下文的存在对多语言实现（Rust/Go/Swift 等）不够友好，也使得水合（Hydration）中的节点认领逻辑多了一层间接性。

本次二次重构的目标是**彻底消除全局上下文 `currentOwner`**，通过修改 `h()` 的返回值为携带所有权信息的对象 `{ owner, nodes }`，使父子 Owner 关系的建立完全显式化、自包含化。重构完成后，框架核心将不依赖任何模块级可变状态来管理组件生命周期，为跨语言实现、水合优化以及未来的架构演进提供更干净的基础。

## 二、前置条件

本次重构依赖于第一次 Owner 树重构的以下成果：

- 树形 Owner 结构（`parent`/`children`）已实现并稳定运行。
- `createOwner`、`disposeOwner`、`triggerMount` 等核心 API 就绪。
- `createApp` 已取代全局 `mount`/`unmount`。
- Fragment 已无容器，异步组件已使用注释占位。
- 指令系统、`when`/`each` 等已适配 Owner 模型。

在这些基础上，本次重构只需要修改 `h()` 的返回值格式和父子关系的建立方式，无需再次改动 Owner 树的核心逻辑。

## 三、核心设计：`HResult` 对象

我们将 `h()` 的返回值从 `Node | Node[]` 改为一个统一的 `HResult` 对象，其中包含 `owner` 和 `nodes` 两个字段。

```ts
interface HResult {
  owner: Owner;
  nodes: Node[];
}
```

- **`owner`**：当前 `h()` 调用所创建的顶层 Owner。对于组件模式，是该组件实例的 Owner；对于 DOM 元素模式，是当前正在渲染的组件 Owner；对于 Fragment，是当前组件 Owner；对于指令模式，是指令宿主元素所属的 Owner。
- **`nodes`**：当前 `h()` 调用产生的顶级 DOM 节点数组（已扁平化）。

### 3.1 类型标记

为了与普通对象区分，我们在 `HResult` 上使用一个 Symbol 标记（与框架现有的 `IS_REACTIVE`、`DIRECT_KEY` 等风格一致）：

```ts
const HRESULT_SYMBOL = Symbol("kiaao.hresult");

interface HResult {
  [HRESULT_SYMBOL]: true;
  owner: Owner;
  nodes: Node[];
}

function createHResult(owner: Owner, nodes: Node[]): HResult {
  return {
    [HRESULT_SYMBOL]: true,
    owner,
    nodes,
  };
}

function isHResult(value: unknown): value is HResult {
  return typeof value === "object" && value !== null && HRESULT_SYMBOL in value;
}
```

在框架内部，大多数消费方不需要显式检查 `isHResult`，因为 TypeScript 类型系统已经保证了返回值类型。只有在 `processChildren` 等需要同时处理多种子节点类型的场景中，才会使用 `isHResult` 进行守卫。

### 3.2 为什么选择对象而非元组

对象格式 `{ owner, nodes }` 比元组 `[Owner, Node[]]` 更具可读性和可维护性，避免了魔法索引 `[0]`、`[1]`。在性能上，对象字面量与短数组的分配和访问开销几乎相同，不会引入可测量的性能衰退。

## 四、详细设计：`h()` 的改造

### 4.1 返回值格式统一

无论何种模式（DOM、组件、指令、Fragment），`h()` 均返回 `HResult`。内部实现统一为：

```ts
function h(tag, props?, ...children): HResult {
  // 字符串标签 → DOM 模式
  if (typeof tag === "string") {
    return handleDomMode(tag, props, children);
  }
  // 指令函数
  if (isDirective(tag)) {
    return handleDirectiveMode(tag, props, children);
  }
  // 组件函数
  return handleComponent(tag, props, children);
}
```

### 4.2 组件模式（同步）

`handleComponent` 不再依赖 `currentOwner`，而是从子组件的返回值中提取 `childOwner`，显式建立父子关系：

```ts
function handleComponent(tag, props, children): HResult {
  const owner = createOwner();
  const context = createContext(owner);

  // 执行组件函数，获取子组件的 HResult
  const childResult = tag(props, context);
  if (childResult.nodes[0] && isPlaceholderComment(childResult.nodes[0])) {
    // 异步组件处理
    return handleAsyncComponent(childResult, owner, context);
  }

  // 显式建立父子关系
  owner.children.push(childResult.owner);
  childResult.owner.parent = owner;

  // 将子组件的节点注册到当前 Owner
  childResult.nodes.forEach((n) => owner.elements.add(n));

  return createHResult(owner, childResult.nodes);
}
```

### 4.3 异步组件

异步组件 Promise resolve 后，不再需要手动恢复 `currentOwner`，只需将真实节点包装为 `HResult` 返回：

```ts
function handleAsyncComponent(promiseResult, owner, context): HResult {
  const placeholder = createComment("async");
  owner.elements.add(placeholder);

  const placeholderResult = createHResult(owner, [placeholder]);

  promiseResult.then((realResult) => {
    const realNodes = Array.isArray(realResult.nodes) ? realResult.nodes : [realResult.nodes];
    owner.elements.add(...realNodes);
    placeholder.replaceWith(...realNodes);
    triggerMount(owner);
  });

  return placeholderResult;
}
```

### 4.4 DOM 元素模式

DOM 元素的创建仍然在组件函数内部进行，此时 Owner 由当前组件的 `handleComponent` 栈帧提供。在 `[Owner, Node[]]` 方案中，我们需要一种方式来获取“当前正在渲染的组件 Owner”。由于我们彻底消除了 `currentOwner`，这个 Owner 必须通过调用链传递。

**解决方案**：在 `handleComponent` 内部，将当前 Owner 通过闭包传递给 `h()` 的 DOM 模式。具体实现：`handleComponent` 在调用 `tag(props, context)` 之前，将 `owner` 绑定到一个内部版本的 `h` 上（如 `h.owner = owner`），但这种方式又回退到全局状态。更优雅的方式是：修改 `processChildren` 和 `handleDomMode` 接受显式的 `owner` 参数，该参数从 `handleComponent` 逐层传递下来。

由于本次重构是第二次迭代，我们可以安全地对内部 API 进行这样的修改。消费方（`handleComponent`、`when`/`each`、指令系统）都已经在第一次重构中熟悉了 Owner 概念，接受 `owner` 参数是自然的。

因此，`handleDomMode` 的签名变为：

```ts
function handleDomMode(tag, props, children, owner: Owner): HResult {
  const el = createElement(tag);
  // ... 处理 props
  const childNodes = processChildren(children, owner); // 传入 owner
  // ... 插入子节点
  return createHResult(owner, [el]);
}
```

`processChildren` 改为：

```ts
function processChildren(children: any[], owner: Owner): Node[] {
  // 处理过程中，遇到信号绑定则通过 owner.cleanups 注册清理
}
```

### 4.5 指令模式

指令模式与 DOM 模式类似，也接收显式的 `owner` 参数：

```ts
function handleDirectiveMode(tag, props, children, owner: Owner): HResult {
  const flatChildren = children.flat(Infinity);
  for (const child of flatChildren) {
    if (child instanceof Element) {
      tag(child, props, createDirectiveContext(owner));
    }
  }
  return createHResult(owner, flatChildren.filter((c) => c instanceof Node) as Node[]);
}
```

### 4.6 Fragment

Fragment 直接返回 `createHResult(owner, childrenNodes)`。

## 五、对 `currentOwner` 的消除

完成上述改造后，`currentOwner` 变量、`createCurrentOwner()` 函数、以及 `set`/`get` 访问将**完全移除**。`h()` 内部不再有任何模块级可变状态。

组件嵌套时的父子关系通过以下机制建立：

1. 父组件调用 `handleComponent(Child, ...)`。
2. `Child` 组件函数返回一个 `HResult`，其中包含 `Child` 的 Owner 和节点。
3. 父组件从返回值中提取 `childResult.owner`，执行 `parent.children.push(childResult.owner)` 和 `childResult.owner.parent = parent`，显式挂载。
4. 父组件自己的 `h()` 调用返回 `HResult`，其中包含父组件的 Owner，继续向上传递。

这形成了一个完全自包含的递归链，不依赖任何全局状态。

## 六、消费方适配范围

所有消费 `h()` 返回值的模块都需要从处理 `Node | Node[]` 改为处理 `HResult`。具体包括：

| 模块                  | 当前代码                    | 新代码                                   |
| --------------------- | --------------------------- | ---------------------------------------- |
| `handleComponent`     | `return nodes`              | `return createHResult(owner, nodes)`     |
| `handleDomMode`       | `return el`                 | `return createHResult(owner, [el])`      |
| `handleDirectiveMode` | `return children`           | `return createHResult(owner, nodes)`     |
| `processChildren`     | 接收 `children`             | 接收 `children` + `owner`，返回 `Node[]` |
| `when`/`each` 内部    | 调用 `h()` 拿到 `Node[]`    | 调用 `h()` 拿到 `HResult`，提取 `.nodes` |
| JSX 运行时            | `return h(...)` 返回 `Node` | `return h(...)` 返回 `HResult`           |
| `createApp`           | `const nodes = h(App)`      | `const { owner, nodes } = h(App)`        |
| 动画扩展              | 可能调用 `h()`              | 适配新返回值                             |

**改动面较大，但每处改动都是机械性的**——将 `const nodes = h(...)` 替换为 `const { owner, nodes } = h(...)`，并在父级将 `owner` 挂载到自己的 `children` 上。

## 七、实施路径

### 第一阶段：`HResult` 基础设施

1. 定义 `HResult` 接口与 Symbol 标记。
2. 实现 `createHResult` 和 `isHResult` 工具函数。
3. 修改 `h()` 的所有内部实现，返回 `HResult`。
4. 修改 `processChildren` 和 `handleDomMode` 等接受显式 `owner` 参数。

### 第二阶段：消除 `currentOwner`

1. 从 `handleComponent` 中移除所有 `currentOwner.set/get` 调用。
2. 删除 `currentOwner` 变量和 `createCurrentOwner` 模块。
3. 适配 `when`/`each`、指令系统、JSX 运行时、`createApp` 等所有消费方。

### 第三阶段：测试与清理

1. 更新所有单元测试和集成测试。
2. 更新 TypeScript 类型定义。
3. 更新框架规范和引导文档中涉及的代码示例。
4. 移除第一次重构中保留的临时兼容代码。

## 八、与现有代码的衔接

由于第一次重构已经建立了树形 Owner 结构，本次重构只需要改变 `h()` 的返回值格式和父子关系的建立点。`disposeOwner`、`triggerMount`、`createApp` 等核心逻辑保持不变。

对于 `when`/`each`，它们内部已经为每个分支/条目创建了 Owner，本次只需要适配 `h()` 返回值的解构。

对于指令系统，它不创建自己的 Owner，但需要从 `HResult` 中提取节点以进行遍历。指令函数本身的 `ctx.onMount` 等仍注册到当前 Owner（现在通过 `handleComponent` 传递的 `owner` 参数），无需改动。

## 九、优势总结

- **彻底消除全局状态**：不再有任何模块级可变状态参与组件生命周期，代码更纯粹、更易理解。
- **异步安全**：不再需要在 Promise 回调中临时恢复 `currentOwner`，完全消除了这一类 bug 的可能性。
- **跨语言友好**：所有所有权信息通过函数返回值传递，这是所有编程语言的原生能力，极大降低了用其他语言实现 Kiaao 的门槛。
- **水合自然**：在水合适配器中，`h()` 返回的 `HResult` 可直接携带认领的 DOM 节点及其 Owner，无需额外的映射表。
- **调试直观**：在控制台展开 `h()` 的返回值，可以直接看到该组件的 Owner 和所有节点。

## 十、风险与缓解

- **风险**：改动面覆盖几乎所有核心模块，回归风险较高。
- **缓解**：第一次重构后，Owner 树已经稳定，测试覆盖充分；本次改动每处都是机械性的替换，可以分批提交、逐步验证；在 CI 中运行全量测试确保无回归。

## 十一、结论

`{ owner, nodes }` 方案是 Kiaao 架构演进的必然一步。它在第一次重构建立的树形 Owner 基础上，以最小的概念增量彻底消除了全局上下文，使框架核心达到了前所未有的纯粹性。通过分两步走的策略，我们在保持快速交付的同时，稳步迈向一个无全局状态、跨语言友好的响应式 UI 运行时。

**当前进度**：第一次重构（`currentOwner` 方案）即将完成；本文档作为第二次重构的蓝图，将在第一次重构稳定后启动实施。
