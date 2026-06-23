# Kiaao `{ owner, nodes }` 返回值方案二次重构实施方案

**状态**：草案
**关联**：[Owner 树架构重构实施方案](./Owner树架构重构实施方案.md)
**日期**：2026年6月23日
**版本**：2.0

## 一、背景与动机

在第一次 Owner 树架构重构（`currentOwner` 方案）中，我们成功将生命周期宿主从 DOM 树迁移到了 JS 内存中的树形 Owner 结构，并实现了 Fragment 无容器、异步安全清理、`createApp` 入口等关键目标。然而，该方案保留了一个最小化的全局上下文变量 `currentOwner`，用于在同步 `h()` 调用期间传递当前组件的 Owner 引用。

`currentOwner` 的存在虽然经过严格作用域限定，但在以下场景中暴露出结构性缺陷：

### 1.1 异步回调式组件的归属丢失

考虑以下代码：

```tsx
function Comp() {
  return fetch().then(() => (
    <div>
      <Demo />
    </div>
  ));
}
```

执行时序如下：

1. `handleComponent` 设置 `currentOwner` 为 `Comp` 的 Owner。
2. `Comp` 函数执行，启动 `fetch()`，返回一个 Promise（`.then()` 尚未执行）。
3. `handleComponent` 检测到 Promise，进入异步路径，**立即恢复 `currentOwner` 为父级**。
4. 若干时间后，`fetch` 完成，`.then()` 回调执行。**此时 `currentOwner` 已指向 `Comp` 的父级（或 `null`）。**
5. `.then()` 回调内部调用 `h(Demo)`。`Demo` 组件的 Owner 通过 `createOwner(currentOwner.get())` 创建，其 `parent` 被错误地设置为 `Comp` 的父级——而不是 `Comp`。

**根本原因**：`currentOwner` 是一个依赖同步执行栈的全局变量。`.then()` 回调是一个全新的执行帧，`currentOwner` 栈在组件函数返回时已经回退。框架无法在异步回调中恢复正确的上下文。这不仅导致 `Demo` 的 Owner 归属错误，还导致 `processChildren` 处理信号绑定时将清理函数注册到错误的 Owner 上，造成资源泄漏或提前清理。

### 1.2 为什么需要二次重构

上述问题不是 `currentOwner` 方案的实现疏漏，而是架构层面的必然局限。任何依赖全局同步栈的上下文传递机制，都无法跨越异步边界。要彻底解决这一问题，必须消除对全局上下文的依赖——这正是 `{ owner, nodes }` 返回值方案的核心能力。

此外，`currentOwner` 的存在对多语言实现（Rust/Go/Swift 等）不够友好，需要模拟线程安全的上下文栈。水合（Hydration）中的节点认领逻辑也多了一层间接性。消除全局状态将使 Kiaao 的核心更纯粹、更易于跨语言实现和长期维护。

**本次二次重构的目标**：彻底消除全局上下文 `currentOwner`，通过修改 `h()` 的返回值为携带所有权信息的对象 `{ owner, nodes }`，使父子 Owner 关系的建立完全显式化、自包含化。

## 二、前置条件

本次重构依赖于第一次 Owner 树重构的以下成果：

- 树形 Owner 结构（`parent`/`children`）已实现并稳定运行。
- `createOwner`、`disposeOwner`、`triggerMount` 等核心 API 就绪。
- `createApp` 已取代全局 `mount`/`unmount`。
- Fragment 已无容器，异步组件已使用注释占位。
- 指令系统、`when`/`each` 等已适配 Owner 模型。

在这些基础上，本次重构只需要修改 `h()` 的返回值格式和父子关系的建立方式，无需再次改动 Owner 树的核心逻辑。

## 三、核心设计：`HResult` 对象

我们将 `h()` 的返回值从 `Node | Node[]` 改为一个统一的 `HResult` 对象，其中包含 `owner`、`nodes` 以及可选的 `cleanups` 字段。

```ts
interface HResult {
  [HRESULT_SYMBOL]: true; // 内部标记
  owner: Owner | null; // 当前 h() 调用关联的 Owner。组件模式为组件实例 Owner，普通元素可为 null
  nodes: Node[]; // 当前 h() 调用产生的顶级 DOM 节点数组（已扁平化）
  cleanups?: (() => void)[]; // 临时清理函数。当 processChildren 在无 Owner 上下文时创建信号绑定，stop 函数暂存于此，
  // 由上层 handleComponent 统一注册到正确 Owner
}
```

- **`owner`**：对于组件模式，是该组件实例的 Owner；对于 DOM 元素模式，由于归属在父级 `handleComponent` 中后置处理，此处可以为 `null`；对于 Fragment，是当前组件 Owner；对于指令模式，是指令宿主元素所属的 Owner。
- **`nodes`**：当前 `h()` 调用产生的顶级 DOM 节点数组（已扁平化）。
- **`cleanups`**：仅当 `processChildren` 处理隐式信号绑定（如 `{signal}`）且没有直接 Owner 可使用时，暂存清理函数于此。`handleComponent` 或 `when`/`each` 等上层拥有 Owner 的调用方负责提取并注册到正确的 `owner.cleanups` 中。

### 3.1 类型标记

为了与普通对象区分，我们在 `HResult` 上使用一个 Symbol 标记（与框架现有的 `IS_REACTIVE`、`DIRECT_KEY` 等风格一致）：

```ts
const HRESULT_SYMBOL = Symbol("kiaao.hresult");
// 需导入 isObject 来自 "../utils/type-guards.ts"

function createHResult(owner: Owner | null, nodes: Node[], cleanups?: (() => void)[]): HResult {
  const result: HResult = {
    [HRESULT_SYMBOL]: true as const,
    owner,
    nodes,
  };
  if (cleanups && cleanups.length > 0) {
    result.cleanups = cleanups;
  }
  return result;
}

function isHResult(value: unknown): value is HResult {
  return isObject(value) && HRESULT_SYMBOL in value;
}
```

在框架内部，大多数消费方不需要显式检查 `isHResult`，因为 TypeScript 类型系统已经保证了返回值类型。只有在 `processChildren` 等需要同时处理多种子节点类型的场景中，才会使用 `isHResult` 进行守卫。

### 3.2 为什么选择对象而非元组

对象格式 `{ owner, nodes }` 比元组 `[Owner, Node[]]` 更具可读性和可维护性，避免了魔法索引 `[0]`、`[1]`。在性能上，对象字面量与短数组的分配和访问开销几乎相同，不会引入可测量的性能衰退。

## 四、父子关系的显式建立与后置绑定

本次重构的核心变化是：**父子关系的建立完全通过 `HResult` 的显式传递完成，不需要任何全局上下文。DOM 节点的归属在 `handleComponent` 拿到返回值后统一处理。`h()` 内部不需要知道当前组件 Owner。**

### 4.1 `createOwner` 不再设置 `parent`

`createOwner` 只创建一个 `parent = null` 的孤立 Owner。父子关系的建立转移到**接收 `HResult` 的一方**。无论是同步组件还是异步组件，父组件在拿到子组件的 `HResult` 后，显式执行挂载：

```ts
if (item.owner) {
  owner.children.push(item.owner);
  item.owner.parent = owner;
}
```

这统一了同步和异步场景的处理逻辑，不再需要“修复”异步回调中的归属错误——因为根本没有错误可修。子 Owner 在创建时就没有预设父级，只是在被父级接收时才建立关系。

### 4.2 同步组件模式

```ts
function handleComponent(tag, props, children): HResult {
  const owner = createOwner();
  const context = createContext(owner);

  // 执行组件函数，获取返回值
  const result = tag(props, context);

  // ★ 优先判断 Promise，避免直接访问属性
  if (result instanceof Promise) {
    return handleAsyncComponent(result, owner, context);
  }

  // 统一处理单值和数组（Fragment 返回多个根元素）
  const results = Array.isArray(result) ? result : [result];
  const allNodes: Node[] = [];

  for (const item of results) {
    if (isHResult(item)) {
      // 如果子项携带了 Owner，建立父子关系
      if (item.owner) {
        owner.children.push(item.owner);
        item.owner.parent = owner;
      }
      // ★ 处理子项携带的孤儿清理函数
      if (item.cleanups) {
        owner.cleanups.push(...item.cleanups);
      }
      allNodes.push(...item.nodes);
    } else if (item instanceof Node) {
      allNodes.push(item);
    }
  }

  // 将节点注册到当前 Owner
  allNodes.forEach((n) => owner.elements.add(n));

  return createHResult(owner, allNodes);
}
```

**关键点**：

- `h('div')` 在组件函数内部被调用时，**不需要知道当前组件 Owner**。它返回一个 `HResult`，其中 `owner` 为 `null`，`nodes` 包含 `<div>` 节点，可能携带 `cleanups`。
- `handleComponent` 拿到返回值后，统一将所有节点注册到当前 `owner.elements` 中，将所有 `cleanups` 注册到 `owner.cleanups` 中。这正是早期讨论中确立的“后置绑定”机制——DOM 节点和清理函数的归属在组件函数返回之后完成。
- 子组件的 Owner 在 `HResult` 中携带，`handleComponent` 通过 `item.owner` 获取并建立父子关系。

### 4.3 异步组件模式

异步组件 Promise resolve 后，同样执行与同步组件完全相同的挂载逻辑：

```ts
function handleAsyncComponent(
  promise: Promise<any>,
  owner: Owner,
  context: ComponentContext,
): HResult {
  const placeholder = createComment("async");
  owner.elements.add(placeholder);

  const placeholderResult = createHResult(owner, [placeholder]);

  promise
    .then((rawResult) => {
      // 统一处理单值和数组
      const results = Array.isArray(rawResult) ? rawResult : [rawResult];
      const allNodes: Node[] = [];

      for (const item of results) {
        if (isHResult(item)) {
          // 显式建立父子关系——与同步组件完全相同的逻辑
          if (item.owner) {
            owner.children.push(item.owner);
            item.owner.parent = owner;
          }
          // 处理孤儿清理函数
          if (item.cleanups) {
            owner.cleanups.push(...item.cleanups);
          }
          allNodes.push(...item.nodes);
        } else if (item instanceof Node) {
          allNodes.push(item);
        }
      }

      // 将真实节点注册到当前 Owner
      allNodes.forEach((n) => owner.elements.add(n));
      owner.elements.delete(placeholder);

      // 替换占位符
      adapter.replaceWith(placeholder, ...allNodes);

      // 触发挂载
      triggerMount(owner);
    })
    .catch((err) => {
      // 错误处理...
    });

  return placeholderResult;
}
```

**关键点**：`.then()` 回调中的父子关系建立代码与同步组件完全一致。这不是“修复”，而是“挂载”——因为 `childResult.owner` 在创建时 `parent` 就是 `null`，不存在“错误归属”需要修复。异步只是延迟了挂载时机，不改变挂载逻辑。

### 4.4 DOM 元素模式

DOM 元素的创建完全在组件函数内部进行，**不需要知道当前组件 Owner**：

```ts
function handleDomMode(tag, props, children): HResult {
  const adapter = getAdapter();
  const el = adapter.createElement(tag);
  const extraCleanups: (() => void)[] = [];
  setProps(el, props, extraCleanups);
  const { nodes: childNodes, cleanups: orphanCleanups } = processChildren(children);
  childNodes.forEach((n) => adapter.append(el, n));
  return createHResult(null, [el], [...orphanCleanups, ...extraCleanups]);
}
```

**关键点**：

- `h('div')` 返回的 `HResult` 中 `owner` 为 `null`。这个 `<div>` 节点最终会被包含在组件函数的返回值中，由 `handleComponent` 统一注册到当前组件的 `owner.elements` 中。
- 信号绑定产生的清理函数通过 `processChildren` 返回的 `orphanCleanups` 暂存，放入 `HResult.cleanups`，由上层 `handleComponent` 统一处理。
- `setProps` 中如果有响应式属性绑定，其清理函数也通过类似机制处理——`setProps` 可以将自己产生的清理函数附加到传入的临时数组，或通过返回值传递。

### 4.5 `processChildren` 的适配

`processChildren` 不再要求外部传入 `owner`。它返回两个值：`nodes` 和 `orphanCleanups`。信号绑定产生的清理函数如果没有 Owner 可注册，则放入 `orphanCleanups` 数组，随 `HResult` 向上传递。

```ts
interface ProcessChildrenResult {
  nodes: Node[];
  cleanups: (() => void)[];
}

function processChildren(children: any[]): ProcessChildrenResult {
  const nodes: Node[] = [];
  const cleanups: (() => void)[] = [];

  for (const child of children.flat(Infinity)) {
    if (child == null || typeof child === "boolean") continue;
    if (Array.isArray(child)) {
      const sub = processChildren(child);
      nodes.push(...sub.nodes);
      cleanups.push(...sub.cleanups);
      continue;
    }
    if (child instanceof Node) {
      nodes.push(child);
      continue;
    }
    if (isHResult(child)) {
      nodes.push(...child.nodes);
      if (child.cleanups) cleanups.push(...child.cleanups);
      continue;
    }
    if (isUse(child)) {
      const textNode = createTextNode("");
      const [derived] = use(child, () => {
        textNode.textContent = String(child());
      });
      // 没有 Owner 可注册 → 暂存入 cleanups 数组
      cleanups.push(derived[REACTIVE].stop);
      nodes.push(textNode);
      continue;
    }
    nodes.push(createTextNode(String(child)));
  }

  return { nodes, cleanups };
}
```

### 4.6 指令模式

指令模式需要先解包 `HResult`，提取其中的 `nodes`，再在这些 `nodes` 中找到 `Element` 来调用指令函数。指令函数的清理回调注册到由调用方传入的 `owner` 参数上。

```ts
function handleDirectiveMode(tag, props, children, owner: Owner): HResult {
  // 先解包所有 HResult，提取实际的 Node
  const allNodes: Node[] = [];
  const allCleanups: (() => void)[] = [];

  for (const child of children.flat(Infinity)) {
    if (isHResult(child)) {
      allNodes.push(...child.nodes);
      if (child.cleanups) allCleanups.push(...child.cleanups);
    } else if (child instanceof Node) {
      allNodes.push(child);
    }
  }

  // 对每个 Element 调用指令函数
  const dirProps = { ...props, children: allNodes };
  for (const node of allNodes) {
    if (node instanceof Element) {
      tag(node, dirProps, createDirectiveContext(owner));
    }
  }

  return createHResult(owner, allNodes, allCleanups);
}
```

**关键点**：指令函数接收的 `children` 是 `Element[]`（已经解包），不是 `HResult[]`。指令内部的逻辑完全不需要改动。指令的清理回调注册到传入的 `owner` 参数上，孤儿清理函数继续向上传递。

## 五、对 `currentOwner` 的消除

完成上述改造后，`currentOwner` 变量、`createCurrentOwner()` 函数、以及 `set`/`get` 访问将**完全移除**。`h()` 内部不再有任何模块级可变状态。组件嵌套时的父子关系通过 `HResult` 的显式传递和挂载完成，形成完全自包含的递归链。DOM 节点的归属通过 `handleComponent` 的后置绑定完成，不需要全局上下文。

## 六、消费方适配范围

所有消费 `h()` 返回值的模块都需要从处理 `Node | Node[]` 改为处理 `HResult`。具体包括：

| 模块                  | 当前代码                    | 新代码                                                                 |
| --------------------- | --------------------------- | ---------------------------------------------------------------------- |
| `handleComponent`     | `return nodes`              | `return createHResult(owner, nodes)`                                   |
| `handleDomMode`       | `return el`                 | `return createHResult(null, [el], orphanCleanups)`                     |
| `handleDirectiveMode` | `return children`           | `return createHResult(owner, nodes, cleanups)`                         |
| `processChildren`     | 返回 `Node[]`               | 返回 `{ nodes, cleanups }`                                             |
| `setProps`            | 可能通过全局获取 Owner      | 将清理函数返回或暂存                                                   |
| `when`/`each` 内部    | 调用 `h()` 拿到 `Node[]`    | 调用 `h()` 拿到 `HResult`，提取 `.nodes` 和 `.owner`，处理 `.cleanups` |
| JSX 运行时            | `return h(...)` 返回 `Node` | `return h(...)` 返回 `HResult`                                         |
| `createApp`           | `const nodes = h(App)`      | `const { owner, nodes } = h(App)`，处理 `.cleanups`                    |
| 动画扩展              | 可能调用 `h()`              | 适配新返回值                                                           |

改动面较大，但每处改动都是机械性的——将 `const nodes = h(...)` 替换为 `const { owner, nodes } = h(...)`，并在父级将 `owner` 挂载到自己的 `children` 上，将 `cleanups` 注册到自己的 `owner.cleanups` 中。

### 6.1 `createApp` 的后置处理

`createApp` 内部调用 `h(App)` 渲染根组件后，需要处理返回值：

```ts
function createApp(component, props?) {
  const rootOwner = createOwner();
  const { owner: appOwner, nodes } = h(component, props);
  // 建立根组件的父子关系
  rootOwner.children.push(appOwner);
  appOwner.parent = rootOwner;
  // 将根节点注册到根 Owner（或者让根 Owner 持有这些节点）
  nodes.forEach((n) => rootOwner.elements.add(n));

  return {
    mount(container: Element) {
      const adapter = getAdapter();
      nodes.forEach((n) => adapter.append(container, n));
      triggerMount(rootOwner);
    },
    unmount() {
      disposeOwner(rootOwner);
    },
  };
}
```

### 6.2 `when`/`each` 的处理

`when`/`each` 在渲染分支或列表项时，调用 `h()` 并处理返回的 `HResult`：

```ts
// when 分支渲染
const result = h(component, props);
if (isHResult(result)) {
  // 建立父子关系
  if (result.owner) {
    branchOwner.children.push(result.owner);
    result.owner.parent = branchOwner;
  }
  // 注册清理函数
  if (result.cleanups) {
    branchOwner.cleanups.push(...result.cleanups);
  }
  // 注册节点
  result.nodes.forEach((n) => branchOwner.elements.add(n));
  // 插入 DOM
  // ...
}
```

## 七、实施路径

### 第一阶段：`HResult` 基础设施

1. 定义 `HResult` 接口与 Symbol 标记。
2. 实现 `createHResult` 和 `isHResult` 工具函数。
3. 修改 `processChildren` 返回 `{ nodes, cleanups }`。
4. 修改 `h()` 的所有内部实现，返回 `HResult`。

### 第二阶段：消除 `currentOwner`

1. 从 `handleComponent` 中移除所有全局上下文相关代码。
2. 删除 `currentOwner` 变量和 `createCurrentOwner` 模块。
3. 适配 `when`/`each`、指令系统、JSX 运行时、`createApp` 等所有消费方。

### 第三阶段：测试与清理

1. 更新所有单元测试和集成测试。
2. 更新 TypeScript 类型定义。
3. 更新框架规范和引导文档中涉及的代码示例。
4. 移除第一次重构中保留的临时兼容代码。

## 八、与现有代码的衔接

由于第一次重构已经建立了树形 Owner 结构，本次重构只需要改变 `h()` 的返回值格式和父子关系的建立点。`disposeOwner`、`triggerMount`、`createApp` 等核心逻辑保持不变。

对于 `when`/`each`，它们内部已经为每个分支/条目创建了 Owner，本次只需要适配 `h()` 返回值的解构，并在拿到 `HResult` 后显式建立父子关系和注册清理函数。

对于指令系统，它不创建自己的 Owner，但需要从 `HResult` 中提取节点以进行遍历。指令函数本身的 `ctx.onMount` 等仍注册到当前 Owner（现在通过参数传递），无需改动。

## 九、优势总结

- **彻底消除全局状态**：不再有任何模块级可变状态参与组件生命周期。代码更纯粹、更易理解。
- **异步安全**：`.then()` 回调中创建的组件通过 `HResult` 携带 Owner，父组件延迟挂载，与同步组件逻辑完全统一。不再需要“修复”归属错误。
- **清理函数不丢失**：通过 `HResult.cleanups` 机制，隐式信号绑定的清理函数可以安全地向上传递到正确的 Owner。
- **createOwner 更纯粹**：`createOwner` 只负责创建，不负责建立关系。父子关系由接收返回值的一方显式建立，职责单一。
- **跨语言友好**：所有所有权信息通过函数返回值传递，这是所有编程语言的原生能力。
- **水合自然**：在水合适配器中，`h()` 返回的 `HResult` 可直接携带认领的 DOM 节点及其 Owner，无需额外的映射表。
- **调试直观**：在控制台展开 `h()` 的返回值，可以直接看到该组件的 Owner 和所有节点。

## 十、风险与缓解

- **风险**：改动面覆盖几乎所有核心模块，回归风险较高。
- **缓解**：第一次重构后，Owner 树已经稳定，测试覆盖充分；本次改动每处都是机械性的替换，可以分批提交、逐步验证；在 CI 中运行全量测试确保无回归。

## 十一、结论

`{ owner, nodes }` 方案是 Kiaao 架构演进的必然一步。它在第一次重构建立的树形 Owner 基础上，以最小的概念增量彻底消除了全局上下文，使框架核心达到了前所未有的纯粹性。通过让 `createOwner` 不再预设父子关系、将挂载逻辑统一在父组件接收返回值时执行，同步和异步场景实现了完全一致的处理模式——异步组件的归属不再是需要特殊处理的“修复”，而是自然的延迟挂载。`HResult.cleanups` 字段的引入，优雅地解决了隐式信号绑定在无全局上下文时清理函数的归属问题。

**当前进度**：第一次重构（`currentOwner` 方案）已接近完成；本文档作为第二次重构的蓝图，将在第一次重构稳定后启动实施。
