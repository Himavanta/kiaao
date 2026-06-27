# Kiaao 控制流组件设计原则

**状态**：定稿
**日期**：2026年6月27日
**版本**：3.0

## 一、背景

在 Owner 树架构重构完成后，`when` 和 `each` 属性指令与新的框架理念产生了明显的不一致：

- **属性指令依赖宿主元素**：条件为 false 时宿主元素仍然存在于 DOM 中。
- **跨端实现困难**：属性指令直接操作宿主元素的子节点，在非 DOM 平台需要特殊处理。
- **源码耦合度高**：`when`/`each` 的实现深度嵌入 `h()` 的 DOM 模式，承担了组件实例创建、派生订阅、分支清理等本应由更上层抽象负责的职责。

因此，将 `when` 的布尔模式提取为 `Show` 组件，映射表模式提取为 `Case` 组件，`each` 提取为 `Each` 组件。这三个组件与计划中的 `Fault` 组件（错误边界）和 `Loading` 组件（异步边界）一起，构成 Kiaao 的控制流组件族，统一通过 Owner 树管理生命周期。

## 二、核心挑战：节点引用的不稳定性

控制流组件需要在条件切换或列表变化时操作节点（插入、移动、移除）。如果组件维护的是节点快照，就会面临节点身份不稳定的问题。

### 2.1 节点身份不稳定的根源

1. **异步组件的注释占位符**：初始渲染时返回注释占位符，稍后被替换为真实节点。
2. **Show/Case 的节点集合**：条件变化时，旧分支内容被销毁，新分支内容被创建。
3. **透传组件**：自身不创建节点，真正的节点在更内层的组件中。
4. **指令的宿主元素**：指令可能修改宿主元素的内部结构。
5. **多根节点**：Fragment 返回多个并列的顶层节点。
6. **Fault 错误恢复**（规划中）：`reset` 时销毁 fallback 并重新渲染主内容。

**根本原因**：在 Kiaao 中，节点的身份可能在其生命周期中发生替换。任何基于“创建时快照”的引用管理都会在面对这些场景时失效。

## 三、解决方案：以 Owner 为稳定引用，分支独立 Owner

控制流组件的核心设计原则是：**以 Owner 为稳定的身份标识，为每个分支和每个条目创建独立的 Owner，委托 Owner 树管理全部生命周期。**

### 3.1 原则内涵

1. **Owner 是稳定的**。从创建到销毁，Owner 对象不变，始终代表同一个逻辑作用域。

2. **分支拥有独立 Owner**。Show 的每个活跃分支、Each 的每个条目，都拥有自己的 Owner。这与 `handleComponent` 为每个组件函数创建 Owner 的原则一致——**一个逻辑作用域，一个 Owner**。

3. **`owner.elements` 是动态的**。它始终包含当前的真实顶层节点集合。切换分支时，旧分支 Owner 被整体销毁，新分支 Owner 持有新节点。不需要维护任何节点快照。

4. **清理是递归且完整的**。`disposeOwner(owner)` 递归清理所有子 Owner、执行清理回调、断开信号订阅、移除所有渲染元素。分支切换时只需 `disposeOwner(branchOwner)` 即可销毁该分支内的所有资源，不需要手动清空 `elements` 或 `cleanups`。

### 3.2 统一锚点机制

Show、Case、Each 都采用统一的注释锚点机制：

- 每个组件始终维护一个注释锚点，它是组件 Owner 的 `elements` 中的**唯一节点**。
- 组件初始渲染时创建锚点，返回 `[anchor]` 给父级。父级通过 `mergeResults` 将锚点加入其 `elements`。
- 所有内容节点（分支内容、条目节点、fallback）通过 `adapter.before(anchor, node)` 插入在锚点**之前**。
- 锚点永远留在 DOM 中，作为内容区域的结束标记。条件切换或列表变化时，只需移除旧内容节点（它们在锚点之前），插入新内容节点。插入位置永远不会丢失。
- 当没有内容渲染时（如条件为 false 且无 fallback，列表为空且无 fallback），锚点独自留在 DOM 中，确保后续内容插入时有位置参考。
- 当组件被卸载时，`disposeOwner(componentOwner)` 会清理锚点，同时递归销毁所有活跃的子 Owner。

### 3.3 当前架构的天然支持

控制流组件的设计不需要引入新机制。当前 `handleComponent` 已经实现了完整的 Owner 挂载逻辑。控制流组件复用相同的模式——为每个分支或条目创建 Owner，通过 `createScopedOwner` 和 `ScopedOwner` 接口管理其生命周期。

### 3.4 Show 和 Case 的分支管理

Show 和 Case 每次只管理一个活跃分支。它们为每个分支创建独立的 ScopedOwner。Show 内部维护当前活跃分支的 ScopedOwner 引用。

Show 内部通过 `use(value, () => ...)` 订阅信号。当 `value` 变化时，回调中：

1. 调用 `activeScope.dispose()` 销毁旧分支的 ScopedOwner，自动清理该分支内部的所有资源（子 Owner、`elements`、`cleanups`、DOM 节点）。
2. 确定要执行的分支函数（主内容或 fallback）。
3. 调用 `createScopedOwner(showOwner, branchFn)` 创建新的 ScopedOwner，执行分支函数，并将渲染结果的所有权归属到该 ScopedOwner 下。
4. 通过 adapter 将新节点插入到锚点之前（移除旧节点已在 `dispose()` 中完成）。
5. 更新 `activeScope` 引用。

Case 同理，增加了映射表的 key 匹配步骤。如果新 key 与旧 key 相同，不触发任何更新。

### 3.5 Each 的条目管理

Each 维护一个条目数组，每个条目对象包含 `key` 和 `scope: ScopedOwner`。Each 自身的 `elements` 仅包含锚点注释节点。

Each 内部通过 `use(value, () => ...)` 订阅数组信号。当信号变化时，回调中：

1. 计算新旧 key 集合的差异。
2. **移除条目**：调用 `item.scope.dispose()` 销毁旧条目 ScopedOwner，自动清理内部所有资源。然后从条目数组中删除该条目对象。
3. **移动条目**：从 `item.scope.elements()` 获取当前节点集合，通过 adapter 批量移动到新位置。
4. **新增条目**：调用 `createScopedOwner(eachOwner, () => renderFn(itemSignal, index))` 创建新条目 ScopedOwner，通过 adapter 将节点插入在锚点之前。

**关于 `index` 参数**：渲染函数的 `index` 是条目的**创建索引**，在条目首次渲染时确定，之后不会随列表重排而更新。如果用户需要显示实时序号，应在渲染函数中根据 `item` 自行查找或计算。

**无 `keyed` 时的全量重建**：不传 `keyed` 时，Each 默认进行全量重建（销毁所有旧条目 ScopedOwner，创建新条目 ScopedOwner），而非使用索引作为隐式 identity。原因是索引 identity 在列表中间插入或删除时会导致所有后续条目的身份错位。全量重建牺牲了性能，但保证了绝对的正确性。

### 3.6 公开 API

控制流组件的实现基于以下公开 API：

| API                             | 职责                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `context.owner`                 | 组件访问自己的 Owner 引用                                                                                                                 |
| `createScopedOwner(parent, fn)` | 创建 ScopedOwner → 挂载到父 Owner → 执行 `fn` → 将结果的所有权归属到该 ScopedOwner 下。返回 `ScopedOwner` 接口                            |
| `ScopedOwner.elements()`        | 获取该作用域下的所有顶层渲染元素                                                                                                          |
| `ScopedOwner.onCleanup(fn)`     | 注册清理回调，在作用域销毁时执行                                                                                                          |
| `ScopedOwner.adopt(hResult)`    | 将 `HResult` 挂载到该作用域下，返回节点数组                                                                                               |
| `ScopedOwner.dispose()`         | 销毁该作用域及其所有子资源                                                                                                                |
| `adoptHResult(owner, hResult)`  | 静态所有权管理函数：将 `HResult` 中的子 Owner 挂载到目标 Owner 下，合并 `cleanups`，将 `nodes` 加入目标 Owner 的 `elements`。返回节点数组 |
| `disposeOwner(owner)`           | 递归销毁 Owner 及其所有子资源（已公开）                                                                                                   |

### 3.7 Fault 的错误恢复（规划中，暂不实现）

`Fault` 组件计划在后续版本中引入。其设计结论已记录，但当前不实施。核心约定：fallback 放在 children 的最后一个函数位置，为每个分支创建独立 ScopedOwner，支持嵌套。

### 3.8 Loading 的未来规划

`Loading` 组件计划在未来引入，其 API 与 `Show`/`Case`/`Fault` 保持一致。当前暂不实现。

## 四、API 一致性约定

### 4.1 `keyed` 属性

`Each` 使用 `keyed` prop 而非 `key`，以避免与 JSX 编译器的 `key` 属性发生特殊处理。

### 4.2 `fallback` 统一位置

所有控制流组件的 fallback 都放在 children 的最后一个函数位置，且均为可选。

| 组件            | 第一个 child                    | 第二个 child（fallback，可选）        |
| --------------- | ------------------------------- | ------------------------------------- |
| Show            | 主内容函数                      | 条件 false 时显示                     |
| Case            | 映射表对象                      | key 未命中时显示                      |
| Each            | 渲染函数 `(item, index) => ...` | 列表为空时显示                        |
| Fault（规划中） | 主内容函数                      | 错误发生时显示，接收 `(error, reset)` |

### 4.3 惰性渲染

所有控制流组件的 children 分支均为函数形式，保证内容在需要时才被创建。

### 4.4 统一锚点

Show、Case、Each 都始终维护一个注释锚点作为组件 Owner 的 `elements` 的唯一节点。内容节点通过 `before(anchor, node)` 插入。锚点永远留在 DOM 中。

### 4.5 异步资源管理

组件卸载时，框架通过 `disposeOwner` 自动清理资源。对于异步操作，开发者应使用 `onUnmount` 注册清理逻辑，自行管理资源释放。框架不提供自动的异步中断机制。

## 五、全面场景验证

控制流组件的设计经过了全面场景的验证，包括透传组件、多根节点、异步组件嵌套、控制流嵌套、自定义指令混合使用等。在所有场景下，Owner 树都能提供稳定的身份标识和动态的节点视图，确保控制流组件的正确性和简洁性。

## 六、原则的适用范围

| 适用场景        | 如何遵循                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| 用户组件        | 由 `h()` 自动创建 Owner，开发者通过 `context.use` 绑定资源，卸载时自动清理                                        |
| Show/Case       | 为每个活跃分支创建 ScopedOwner，切换时 `dispose()` 销毁旧分支，`createScopedOwner()` 创建新分支                   |
| Each            | 为每个条目创建 ScopedOwner，持有条目数组 `[{ key, scope }]`，diff 后通过 `scope.elements()` 获取节点进行移动/移除 |
| Fault（规划中） | 为主内容和 fallback 分别创建 ScopedOwner，错误发生时切换，`reset` 时恢复                                          |
| Loading（未来） | 为主内容和 fallback 分别创建 ScopedOwner，异步就绪时切换                                                          |
| 透传组件        | Owner 的 `elements` 可能为空，实际节点在子 Owner 中，清理时递归处理                                               |
| 异步组件        | 占位符被替换后，`owner.elements` 自动更新为真实节点                                                               |
| Portal          | 持有 Portal Owner，`onMount` 中移动节点，`onUnmount` 中清理                                                       |
| 跨端组件        | 同用户组件——Owner 树不依赖平台                                                                                    |
| 自定义指令      | **不适用**——指令不创建 Owner，只附加行为到已有元素                                                                |

## 七、原则的意义

**统一性**。所有组件和扩展遵循同一套生命周期管理范式——**一个逻辑作用域，一个 Owner**。`createScopedOwner` 提供了统一的作用域创建入口。

**简化性**。`dispose()` 一次调用即可销毁作用域内的所有资源。锚点机制消除了 DOM 定位的不确定性。

**跨端友好**。Owner 树是纯 JS 数据结构，与平台无关。

**可预测性**。调试时展开 Owner 树，可以看到完整的组件层级、活跃作用域、当前节点和清理回调。

**可扩展性**。`createScopedOwner` 和 `ScopedOwner` 接口为高级组件开发者提供了构建自定义组件的基础能力。

## 八、结论

控制流组件族的设计遵循两个核心原则：

1. **以 Owner 为稳定的身份标识，动态获取节点集合，委托 Owner 树管理全部生命周期。**
2. **为每个分支和每个条目创建独立的作用域——一个逻辑作用域，一个 Owner。**

统一锚点机制保证了 DOM 定位的稳定性。`createScopedOwner` 和 `ScopedOwner` 接口封装了作用域管理的完整逻辑，让控制流组件的实现简洁、统一、可复用。这些设计是 Owner 树架构的自然产物，也是 Kiaoo 后续维护和拓展的基石。
