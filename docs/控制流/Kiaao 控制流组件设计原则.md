# Kiaao 控制流组件设计原则

**状态**：定稿
**日期**：2026年6月27日
**版本**：3.3

## 一、背景

在 Owner 树架构重构完成后，`when` 和 `each` 属性指令与新的框架理念产生了明显的不一致：

- **属性指令依赖宿主元素**：条件为 false 时宿主元素仍然存在于 DOM 中。
- **跨端实现困难**：属性指令直接操作宿主元素的子节点，在非 DOM 平台需要特殊处理。
- **源码耦合度高**：`when`/`each` 的实现深度嵌入 `h()` 的 DOM 模式，承担了组件实例创建、派生订阅、分支清理等本应由更上层抽象负责的职责。

因此，将 `when` 的布尔模式提取为 `Show` 组件，映射表模式提取为 `Case` 组件，`each` 提取为 `Each` 组件。这三个组件与计划中的 `Error` 组件（错误边界）一起，构成 Kiaao 的控制流组件族。

## 二、核心挑战：节点引用的不稳定性与初始化时序

控制流组件需要在条件切换或列表变化时操作节点（插入、移动、移除）。如果组件维护的是节点快照，就会面临节点身份不稳定的问题。

### 2.1 节点身份不稳定的根源

1. **异步组件的注释占位符**：初始渲染时返回注释占位符，稍后被替换为真实节点。
2. **Show/Case 的节点集合**：条件变化时，旧分支内容被销毁，新分支内容被创建。
3. **透传组件**：自身不创建节点，真正的节点在更内层的组件中。
4. **指令的宿主元素**：指令可能修改宿主元素的内部结构。
5. **多根节点**：Fragment 返回多个并列的顶层节点。
6. **Error 错误恢复**（规划中）：`reset` 时销毁 fallback 并重新渲染主内容。

### 2.2 初始化时序问题

控制流组件在初始渲染时面临一个特殊困境：锚点刚刚通过 `createComment` 创建，尚未通过 `h()` 的返回值传递给父级并插入 DOM。此时锚点是一个“孤儿节点”——没有父节点，不在 DOM 树中。这导致 `adapter.before(anchor, node)` 无法工作（锚点无父节点时 `before()` 是安全的空操作）。

因此，初始内容节点必须通过 `result.nodes` 返回给父级，让父级通过 `mergeResults` 将它们插入 DOM。但这同时导致内容节点被 `mergeResults` 捕获，进入了各级父 Owner 的 `elements` 集合——造成“同一节点被多个 Owner 引用”的累积问题。

**解决方案**：将初始内容的渲染推迟到 `onMount` 回调中。此时锚点已通过 `handleComponent` 的返回值被父级插入 DOM，`adapter.before(anchor, node)` 可以正常工作。内容节点不再需要经过 `result.nodes`，因此不会进入 `showOwner.elements` 和所有上级 Owner 的 `elements`。

`onMount` 的回调在 `mount` 调用时同步触发（通过 `triggerMount` 沿 Owner 树递归），内容在同一个同步任务中被渲染并插入 DOM。首次渲染不会产生任何可感知的延迟。所有响应式绑定（信号订阅、派生创建等）在首次渲染时正常建立，后续信号变化通过 `use(value, () => renderBranch())` 触发。

## 三、解决方案：通过 `h()` 渲染子组件，复用组件生命周期

控制流组件的核心设计原则是：**将惰性内容当作普通组件，通过 `h()` 渲染，让 `h()` 自动管理其完整的生命周期。初始内容的渲染推迟到 `onMount` 回调中，确保锚点已在 DOM 中。**

### 3.1 原则内涵

1. **复用 `h()` 的组件渲染管道**。控制流组件将惰性内容作为普通组件通过 `h()` 渲染，`h()` 自动创建组件 Owner、执行组件函数、返回 `HResult`。

2. **惰性渲染通过 `h()` 保证**。控制流组件在条件不满足时根本不会调用 `h(Component)`，因此组件函数不会执行。

3. **推迟初始渲染到 `onMount`**。控制流组件的组件函数中只创建锚点并返回。初始内容的渲染放在 `onMount` 回调中，此时锚点已在 DOM 中，`adapter.before(anchor, node)` 可正常工作。内容节点不经过 `result.nodes`，不会进入各级父 Owner 的 `elements`。

4. **手动处理 Owner 链接和 DOM 插入**。无论是 `onMount` 中的初始渲染，还是后续信号回调中的分支切换，都需要手动将 `h()` 返回的 `HResult.owner` 链接到控制流组件的 Owner 下，并将节点通过 `adapter.before(anchor, node)` 插入在锚点之前。这是所有在信号回调中动态调用 `h()` 的组件都必须遵循的通用模式。

5. **`owner.elements` 是动态的**。它始终包含当前的真实顶层节点集合。对于控制流组件，`elements` 中仅包含锚点——内容节点归属于各自的分支/条目 Owner。

6. **清理是递归且完整的**。`disposeOwner(owner)` 递归清理所有子 Owner。切换分支时，Show 保存上一次渲染的 `HResult`，通过 `disposeOwner(prevResult.owner)` 清理旧分支。条目移除时，Each 调用 `disposeOwner(itemResult.owner)` 清理条目。

### 3.2 参数传递

控制流组件的 children 是组件函数引用。对于需要参数的场景（Each 的条目渲染、Error 的 fallback），参数通过 props 传递：

- **Each**：条目渲染函数接收 `{ item, index }` props。Each 内部调用 `h(ItemComponent, { item, index })`。
- **Error**（规划中）：fallback 接收 `{ error, reset }` props。Error 内部调用 `h(FallbackComponent, { error, reset })`。
- **Show/Case**：主内容和 fallback 都是无 props 组件。

### 3.3 统一锚点机制

Show、Case、Each 都采用统一的注释锚点机制：

- 每个组件始终维护一个注释锚点，它是组件 Owner 的 `elements` 中的**唯一节点**。
- 组件初始渲染时创建锚点，返回 `[anchor]` 给父级。
- 所有内容节点通过 `adapter.before(anchor, node)` 插入在锚点**之前**。
- 锚点永远留在 DOM 中，作为内容区域的结束标记。条件切换或列表变化时，只需移除旧内容节点（它们在锚点之前），插入新内容节点。
- 当没有内容渲染时，锚点独自留在 DOM 中。

### 3.4 Show 和 Case 的分支管理

Show 内部持有当前渲染的 `HResult` 引用（`currentResult`）。`renderBranch` 是核心逻辑，在 `onMount` 中首次调用，后续通过 `use(value, () => ...)` 订阅信号触发。

`renderBranch` 的逻辑：

1. 根据当前 `value` 确定要渲染的组件（`Primary` 或 `Fallback`）。
2. 如果组件不存在，仅清理旧内容（`disposeOwner(currentResult?.owner)`），不渲染新内容。
3. 如果组件存在：
   - 清理旧内容：`disposeOwner(currentResult?.owner)`。
   - 渲染新内容：调用 `h(Component)` 拿到新的 `HResult`。
   - 链接 Owner：`newResult.owner.parent = showOwner; showOwner.children.push(newResult.owner)`。
   - 插入 DOM：遍历 `newResult.nodes`，通过 `adapter.before(anchor, node)` 插入在锚点之前。
   - 更新 `currentResult` 引用。

Case 同理，增加了映射表的 key 匹配步骤。如果新 key 与旧 key 相同，不触发任何更新。

### 3.5 Each 的条目管理

Each 内部持有条目结果数组 `itemResults: [{ key, result }]`。`sync` 是核心逻辑，在 `onMount` 中首次调用，后续通过 `use(value, () => ...)` 订阅信号触发。

`sync` 的逻辑：

1. 计算新旧 key 集合的差异（如果提供了 `keyed`）。
2. **移除条目**：调用 `disposeOwner(itemResult.owner)` 销毁旧条目内容，从数组中删除。
3. **移动条目**：从 `itemResult.owner.elements` 获取当前节点集合，通过 adapter 批量移动到新位置。
4. **新增条目**：调用 `h(ItemComponent, { item, index })` 渲染新条目，链接 Owner、插入 DOM，保存结果到条目数组。

**关于 `index` 参数**：`index` 是条目的**创建索引**，在条目首次渲染时确定，之后不会随列表重排而更新。如果用户需要显示实时序号，应在渲染函数中根据 `item` 自行查找或计算。

**无 `keyed` 时的全量重建**：不传 `keyed` 时，Each 默认全量重建（销毁所有旧条目，重新渲染所有新条目），而非使用索引作为隐式 identity。原因是索引 identity 在列表中间插入或删除时会导致所有后续条目的身份错位。全量重建牺牲了性能，但保证了绝对的正确性。

**关于 fallback**：当 `value` 数组为空且提供了 fallback 组件时，Each 调用 `h(FallbackComponent, {})` 渲染 fallback，链接 Owner、插入 DOM。如果未提供 fallback，仅锚点存在。

### 3.6 基础 API

控制流组件的实现基于 `h()` 和已有的 Owner 树基础设施：

| API                   | 用途                                            |
| --------------------- | ----------------------------------------------- |
| `h(Component, props)` | 渲染子组件，自动管理其完整生命周期              |
| `context.owner`       | 组件访问自己的 Owner 引用                       |
| `context.onMount(fn)` | 注册挂载回调，初始渲染的入口                    |
| `disposeOwner(owner)` | 销毁旧分支/旧条目的所有资源（已公开）           |
| adapter 操作          | 通过 `getAdapter()` 进行 DOM 操作，保持平台无关 |

## 四、API 一致性约定

### 4.1 `keyed` 属性

`Each` 使用 `keyed` prop 而非 `key`，以避免与 JSX 编译器的 `key` 属性发生特殊处理。

### 4.2 `fallback` 统一位置

所有控制流组件的 fallback 都放在 children 的最后一个位置，且均为可选。

| 组件            | 第一个 child                            | 第二个 child（fallback，可选）                   |
| --------------- | --------------------------------------- | ------------------------------------------------ |
| Show            | 主内容组件                              | 条件 false 时显示                                |
| Case            | 映射表对象                              | key 未命中时显示                                 |
| Each            | 条目渲染组件 `({ item, index }) => ...` | 列表为空时显示                                   |
| Error（规划中） | 主内容组件                              | 错误发生时显示，接收 `({ error, reset }) => ...` |

### 4.3 惰性渲染

惰性渲染通过 `h()` 保证——控制流组件在条件不满足时根本不会调用 `h(Component)`，因此组件函数不会执行，其内部的所有资源都不会被创建。

### 4.4 统一锚点

Show、Case、Each 都始终维护一个注释锚点作为组件 Owner 的 `elements` 的唯一节点。内容节点通过 `before(anchor, node)` 插入。锚点永远留在 DOM 中。

### 4.5 异步资源管理

组件卸载时，框架通过 `disposeOwner` 自动清理资源。对于异步操作，开发者应使用 `onUnmount` 注册清理逻辑，自行管理资源释放。框架不提供自动的异步中断机制。

## 五、全面场景验证

控制流组件的设计经过了全面场景的验证，包括透传组件、多根节点、异步组件嵌套、控制流嵌套、自定义指令混合使用等。在所有场景下，`h()` 的组件渲染管道和 Owner 树都能提供稳定的生命周期管理。推迟初始渲染到 `onMount` 不引入任何新的边界情况——异步组件和透传组件的特殊行为已被现有的组件渲染管道完全消化，控制流组件只需要关心自己的一层。

## 六、原则的适用范围

| 适用场景        | 如何遵循                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 用户组件        | 由 `h()` 自动创建 Owner，开发者通过 `context.use` 绑定资源，卸载时自动清理                                                                                   |
| Show/Case       | 初始渲染在 `onMount` 中触发，后续切换通过 `use(value, fn)` 订阅。通过 `h()` 渲染子组件，手动链接 Owner 和插入 DOM                                            |
| Each            | 初始渲染在 `onMount` 中触发，后续列表变化通过 `use(value, fn)` 订阅。通过 `h()` 渲染条目组件，持有条目结果数组，diff 后通过 `result.owner.elements` 获取节点 |
| Error（规划中） | 通过 `h()` 渲染主内容和 fallback 组件，错误发生时切换                                                                                                        |
| 透传组件        | Owner 的 `elements` 可能为空，实际节点在子 Owner 中，清理时递归处理                                                                                          |
| 异步组件        | 占位符被替换后，`owner.elements` 自动更新为真实节点                                                                                                          |
| Portal          | 持有 Portal Owner，`onMount` 中移动节点，`onUnmount` 中清理                                                                                                  |
| 跨端组件        | 同用户组件——Owner 树不依赖平台                                                                                                                               |
| 自定义指令      | **不适用**——指令不创建 Owner，只附加行为到已有元素                                                                                                           |

## 七、原则的意义

**统一性**。控制流组件不再是特殊的存在——它们只是“根据条件决定渲染哪个子组件”的普通组件，与 Kiaao 的组件模型完全一致。

**简化性**。控制流组件不需要手动管理作用域——`h()` 已经实现了组件渲染的完整生命周期管理。Show/Each 的实现只需在 `renderBranch`/`sync` 核心逻辑中决定调用哪个 `h()`，然后手动处理 Owner 链接和 DOM 插入。

**跨端友好**。Owner 树是纯 JS 数据结构，与平台无关。

**可预测性**。调试时展开 Owner 树，可以看到完整的组件层级、活跃组件、当前节点和清理回调。每个 Owner 的 `elements` 只包含它自己创建并负责的节点。

**可扩展性**。任何新组件只需理解 `h()` 的组件渲染机制，就能与现有组件一致地工作。

## 八、结论

控制流组件族的设计遵循一个核心原则：**将惰性内容当作普通组件，通过 `h()` 渲染，让 `h()` 自动管理其完整的生命周期。初始内容的渲染推迟到 `onMount` 回调中，确保锚点已在 DOM 中。**

控制流组件不需要自己管理 Owner——`h()` 已经处理了组件渲染的所有逻辑。Show/Each 只需要在 `renderBranch`/`sync` 核心逻辑中决定调用哪个 `h()`，然后手动链接 Owner 和插入 DOM。推迟初始渲染到 `onMount` 从根本上解决了内容节点在各级父 Owner 的 `elements` 中积累的问题，同时保持了控制流组件设计的简洁性和统一性。

`keyed` 属性用于 `Each` 的身份标识，避免与 JSX 编译器冲突。`fallback` 统一放在 children 的最后一个位置，且均为可选。三个组件统一使用锚点机制保证 DOM 定位的稳定性。异步资源管理通过 `onUnmount` 显式注册清理逻辑，框架不提供自动中断机制。
