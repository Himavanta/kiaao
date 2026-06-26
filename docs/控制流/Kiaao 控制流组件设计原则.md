# Kiaao 控制流组件设计原则

**状态**：定稿
**日期**：2026年6月26日
**版本**：2.2

## 一、背景

在 Owner 树架构重构完成后，`when` 和 `each` 属性指令与新的框架理念产生了明显的不一致：

- **属性指令依赖宿主元素**：`<div when={visible}>` 需要宿主元素来承载条件逻辑，条件为 false 时宿主元素仍然存在于 DOM 中。
- **跨端实现困难**：属性指令直接操作宿主元素的子节点，在非 DOM 平台需要特殊处理。
- **源码耦合度高**：`when`/`each` 的实现深度嵌入 `h()` 的 DOM 模式，承担了组件实例创建、派生订阅、分支清理等本应由更上层抽象负责的职责。

因此，将 `when` 的布尔模式提取为 `Show` 组件，映射表模式提取为 `Case` 组件，`each` 提取为 `Each` 组件。这三个组件与计划中的 `Fault` 组件（错误边界）和 `Loading` 组件（异步边界）一起，构成 Kiaao 的控制流组件族，统一通过 Owner 树管理生命周期。

## 二、核心挑战：节点引用的不稳定性

控制流组件需要在条件切换或列表变化时操作节点（插入、移动、移除）。如果组件维护的是节点快照，就会面临节点身份不稳定的问题。

### 2.1 节点身份不稳定的根源

1. **异步组件的注释占位符**：初始渲染时返回注释占位符，稍后被替换为真实节点。任何基于创建时快照的引用都会失效。
2. **Show/Case 的节点集合**：条件变化时，旧分支内容被销毁，新分支内容被创建。持有切换前的节点引用会导致操作已脱离文档的节点。
3. **透传组件**：自身不创建节点，其 `elements` 为空。真正的节点在更内层的组件中。
4. **指令的宿主元素**：指令可能修改宿主元素的内部结构，其内部子节点可能因嵌套控制流而发生变化。
5. **多根节点**：Fragment 返回多个并列的顶层节点，形成一个节点集合而非单个节点。
6. **Fault 错误恢复**（规划中）：当 `reset` 被调用时，销毁当前的 fallback 内容并重新渲染主内容，节点引用可能被完全替换。

**根本原因**：在 Kiaao 中，节点的身份可能在其生命周期中发生替换。任何基于“创建时快照”的引用管理都会在面对这些场景时失效。

## 三、解决方案：以 Owner 为稳定引用，分支独立 Owner

控制流组件的核心设计原则是：**以 Owner 为稳定的身份标识，为每个分支和每个条目创建独立的 Owner，委托 Owner 树管理全部生命周期。**

### 3.1 原则内涵

1. **Owner 是稳定的**。从创建到销毁，Owner 对象不变。无论内部发生什么——异步组件替换占位符、Show 切换分支、Each 移动条目——Owner 始终代表同一个逻辑作用域。

2. **分支拥有独立 Owner**。Show 的每个活跃分支（主内容、fallback）、Each 的每个条目，都拥有自己的 Owner。这与 `handleComponent` 为每个组件函数创建 Owner 的原则一致——**一个逻辑作用域，一个 Owner**。

3. **`owner.elements` 是动态的**。它始终包含当前的真实顶层节点集合。异步组件 resolve 后，占位符被移出 `elements`，真实节点被加入。Show 切换分支后，旧分支 Owner 被整体销毁，新分支 Owner 持有新节点。不需要维护任何节点快照。

4. **清理是递归且完整的**。`disposeOwner(owner)` 递归清理所有子 Owner、执行清理回调、断开信号订阅、移除 `elements` 中的所有渲染元素。分支切换时只需 `disposeOwner(branchOwner)` 即可销毁该分支内的所有资源，不需要手动清空 `elements` 或 `cleanups`。

### 3.2 当前架构的天然支持

控制流组件的设计不需要引入新机制。当前 `handleComponent`（定义于 `core/component.ts`）已经实现了完整的 Owner 挂载逻辑：

```
const result = tag(props, context);
// result 是 HResult 或 Promise<HResult>
// mergeResults(result, owner) 将子 Owner 挂载到当前 Owner 的 children，
// 合并 nodes 和 cleanups
```

控制流组件可以复用相同的模式——为每个分支或条目创建 Owner，通过 `adoptHResult`（`mergeResults` 的公开封装）将渲染结果挂载到该 Owner 下。

### 3.3 Each 的条目管理

Each 维护一个条目数组，每个条目对象包含 `key` 和 `owner`：

```ts
const entries = [
  { key: "item-1", owner: itemOwner1 },
  { key: "item-2", owner: itemOwner2 },
];
```

- **`key`**：条目的身份标识（由 `keyed` prop 计算），用于 diff。
- **`owner`**：条目 Owner 的引用。这是稳定的——从条目创建到销毁，Owner 对象不变。
- **节点集合**：不存储在条目对象中，而是在需要时从 `owner.elements` 动态获取。

**Each 自身的 `elements` 仅包含锚点注释节点**。条目的所有 DOM 节点归属于各自的条目 Owner 的 `elements`。Each 通过锚点定位位置，通过条目 Owner 管理生命周期。两者职责分明。

**Diff 流程**：Each 内部通过 `use(value, () => ...)` 订阅数组信号。当信号变化时，派生回调触发：

1. 计算新旧 key 集合的差异。
2. **移除条目**：调用 `disposeOwner(item.owner)` 销毁旧条目 Owner，自动清理内部所有内容（包括异步组件、Show/Case、指令等）。然后从条目数组中删除该条目对象。
3. **移动条目**：从 `item.owner.elements` 获取**当前**的顶层节点集合，通过 adapter 批量移动到新位置。
4. **新增条目**：创建条目 Owner，调用渲染函数，通过 `adoptHResult` 将新节点的所有权归属到条目 Owner 下，插入 DOM。

**`use(value, callback)` 机制**：控制流组件内部使用全局 `use` 的派生模式 `use(signal, fn)` 来订阅信号变化。这会创建一个派生信号，`fn` 作为计算函数在依赖变化时执行。控制流组件不关心派生信号的返回值，仅利用其副作用机制（`fn` 中执行 DOM 操作和 Owner 管理）。

**与现有 each 指令的对比**：当前 `each` 属性指令在 `renderEachOnElement` 中维护了 `itemNodeMap: Map<unknown, HostNode[]>`，用于追踪条目节点和判断重排。组件形式的 Each 直接从 `owner.elements` 获取节点，不需要额外的映射表。迁移后可以减少一层冗余数据结构。

**关于 `index` 参数**：渲染函数的 `index` 参数是条目的**创建索引**，在条目首次渲染时确定，之后不会随列表重排而更新。如果用户需要显示实时序号，应在渲染函数中根据 `item` 自行查找或计算。

**无 `keyed` 时的全量重建**：不传 `keyed` 时，Each 默认进行全量重建（销毁所有旧条目 Owner，创建新条目 Owner），而非使用索引作为隐式 identity。原因是：索引 identity 在列表中间插入或删除时会导致所有后续条目的身份错位，可能引发微妙的 UI 状态错乱。全量重建牺牲了性能，但保证了绝对的正确性。用户如需高效增量更新，应提供 `keyed`。

### 3.4 Show 和 Case 的分支管理

Show 和 Case 每次只管理一个活跃分支。它们为每个分支（主内容、fallback）创建独立的 Owner。这与 `handleComponent` 为组件函数创建 Owner 的模式完全一致。

Show 内部维护当前活跃分支的 Owner 引用。当 `value` 变化时，通过 `use(value, () => ...)` 订阅信号，回调中：

1. **销毁旧分支**：调用 `disposeOwner(activeBranchOwner)`，自动清理该分支内部的所有子 Owner、`elements`、`cleanups` 和 DOM 节点。Show 不需要手动清空自己的 `elements`——这些节点归属在分支 Owner 下，由 `disposeOwner` 一并处理。
2. **创建新分支**：调用 `createOwner()` 创建新的分支 Owner，执行对应的 children 函数（主内容或 fallback），得到新的 `HResult`。
3. **挂载**：调用 `adoptHResult(branchOwner, newHResult)` 将新内容的所有权归属到分支 Owner 下，并将分支 Owner 挂载到 Show 的 Owner 的 `children` 下。
4. **替换 DOM**：通过 adapter 将新节点替换旧节点（移除旧 DOM，插入新 DOM）。
5. **更新引用**：`activeBranchOwner = branchOwner`。

Case 同理，增加了映射表的 key 匹配步骤。如果新 key 与旧 key 相同，不触发任何更新（复用已渲染的 DOM）。

**Show 自身的 Owner 在整个生命周期中是稳定的**——它只持有 `children` 引用，不直接持有内容节点的 `elements`。内容的节点归属在分支 Owner 下。这使得 Show 的逻辑从“手动管理内容”简化为“切换子 Owner”，与 `handleComponent` 处理子组件的模式完全一致。

**关于注释占位符**：当 Show 首次渲染时条件为 false 且没有提供 fallback，应创建一个注释占位符并将其所有权归属到分支 Owner 的 `elements` 中，以保留 DOM 位置。后续条件切换时，`disposeOwner` 会销毁该分支 Owner（包括占位符），新分支 Owner 持有新节点。Each 在列表为空且无 fallback 时同理。

### 3.5 实现所需的基础 API

控制流组件的实现需要以下公开 API，这些 API 在当前代码库中已存在或仅需微小调整：

1. **`context.owner`**：组件通过 `context` 访问自己的 Owner 引用。当前 `Context` 接口只暴露 `use`、`onMount`、`onUnmount`，需新增 `owner: Owner` 属性。这为控制流组件和高级组件提供了灵活操作自身 Owner 的能力。

2. **`adoptHResult`**：封装 `mergeResults` 的逻辑，将 `HResult` 中的子 Owner 挂载到目标 Owner 下，合并 `cleanups` 和 `nodes` 到目标 Owner 的对应集合中。它是纯粹的所有权管理函数，不涉及 DOM 操作。其精确语义为：
   - 若 `child.owner` 存在，将其挂载到目标 Owner 的 `children` 下，设置 `parent` 引用。
   - 若 `child.cleanups` 存在，将其合并到目标 Owner 的 `cleanups` 中。
   - 将 `child.nodes` 加入目标 Owner 的 `elements` 集合。
   - 返回 `child.nodes` 数组，供调用方进行 DOM 插入操作。

3. **`disposeOwner` 已公开**：`core/owner.ts` 中 `disposeOwner` 已导出，可直接用于清理旧分支和旧条目。

4. **adapter 操作**：控制流组件通过 adapter（`getAdapter()`）进行 DOM 操作（`before`、`replaceWith`、`remove` 等），保持平台无关。

### 3.6 Fault 的错误恢复（规划中，暂不实现）

`Fault` 组件（对应其他框架的错误边界）计划在后续版本中引入。其设计结论已记录如下，但当前不实施：

- `Fault` 包裹一个可能出错的主内容子树和一个 fallback 函数。当主内容抛出错误时，Fault 捕获错误并渲染 fallback。用户可以通过 `reset` 函数重试主内容的渲染。
- `Fault` 的 fallback 放在 children 的最后一个函数位置，与 `Show`/`Case`/`Each` 保持 API 一致性。fallback 接收 `error` 和 `reset` 两个参数。
- `Fault` 不需要 `value` 属性——它是包裹性组件，切换由内部错误驱动。
- `Fault` 支持嵌套使用——内层的 Fault 先捕获错误，如果内层 Fault 自身也失败，外层 Fault 会捕获。
- 命名仍在讨论中（候选：`Fault`），最终名称将在实现时确定。

### 3.7 Loading 的未来规划

`Loading` 组件（对应其他框架的异步边界）计划在未来引入，用于处理异步内容的加载状态。其 API 应与 `Show`/`Case`/`Fault` 保持一致，children 第一个函数为主内容，第二个函数为 fallback。当前暂不实现。

## 四、API 一致性约定

### 4.1 `keyed` 属性

`Each` 使用 `keyed` prop 而非 `key`，以避免与 JSX 编译器的 `key` 属性发生特殊处理。`keyed` 直接接收一个函数 `(item, index) => any`，用于计算每个条目的稳定标识。

### 4.2 `fallback` 统一位置

所有控制流组件的 fallback 都放在 children 的最后一个函数位置，且均为可选。这消除了在 JSX 属性中嵌入 XML 的视觉噪音，保持了 children 区域的对称性和可读性。

| 组件            | 第一个 child                    | 第二个 child（fallback，可选）        |
| --------------- | ------------------------------- | ------------------------------------- |
| Show            | 主内容函数                      | 条件 false 时显示                     |
| Case            | 映射表对象                      | key 未命中时显示                      |
| Each            | 渲染函数 `(item, index) => ...` | 列表为空时显示                        |
| Fault（规划中） | 主内容函数                      | 错误发生时显示，接收 `(error, reset)` |

### 4.3 惰性渲染

所有控制流组件的 children 分支均为函数形式，保证内容在需要时才被创建。这与 Kiaao 的“显式、可预测”哲学一致——用户显式地用函数包裹延迟求值的内容，框架不会在条件不满足时提前执行。

### 4.4 注释占位符的使用条件

当控制流组件有内容渲染时，活跃分支 Owner 的 `elements` 中的节点本身就是锚点——替换时可直接定位。只有在完全没有内容渲染时（条件不满足且无 fallback，列表为空且无 fallback），才需要返回注释占位符以保留 DOM 位置。占位符的所有权归属到对应的分支 Owner 或 Each 自身 Owner 的 `elements` 中。

### 4.5 异步资源管理

组件卸载时，框架通过 `disposeOwner` 自动清理资源（停止派生、移除 DOM、执行 `onUnmount` 回调）。对于异步操作（如 `fetch`、`WebSocket`），开发者应使用 `onUnmount` 注册清理逻辑，自行管理资源释放。框架不提供自动的异步中断机制，以保持 API 的最小化和开发者对资源管理的显式控制。

## 五、全面场景验证

### 5.1 透传组件

透传组件的 `elements` 为空，实际节点在其子 Owner 中。控制流组件不需要特殊处理——如果某个条目的 `owner.elements` 为空，实际节点在其子 Owner 中，清理时递归处理。

### 5.2 多根节点

Fragment 返回多个并列节点，全部注册在同一个 Owner 的 `elements` 中。控制流组件操作条目时，从 `owner.elements` 获取的是一组节点，通过 adapter 批量操作。

### 5.3 异步组件嵌套控制流

Each 在创建条目时，条目渲染函数可能返回异步组件的注释占位符。当异步组件 resolve 后，条目 Owner 的 `elements` 自动更新为真实节点。Each 在后续 diff 中操作该条目时，从 `owner.elements` 获取的是最新节点集合。如果 Each 在异步组件 resolve 之前就需要移除该条目，`disposeOwner(itemOwner)` 会递归清理条目内部的所有内容，包括尚未 resolve 的异步组件的占位符。异步组件的 Promise 回调会检查 `owner.disposed` 而跳过，不会产生泄漏。

### 5.4 控制流嵌套控制流

每层控制流都创建自己的 Owner。外层控制流切换分支时，`disposeOwner` 递归清理所有内部嵌套的控制流 Owner。不需要跨层级的协调。

### 5.5 自定义指令混合使用

指令不创建 Owner，其清理回调注册到宿主元素所属的 Owner 的 `cleanups` 队列中。控制流组件不需要感知指令的存在——当宿主元素被移除时，宿主 Owner 的清理逻辑自动执行指令的 `onUnmount` 回调。

## 六、原则的适用范围

| 适用场景        | 如何遵循                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 用户组件        | 由 `h()` 自动创建 Owner，开发者通过 `context.use` 绑定资源，卸载时自动清理                                                          |
| Show/Case       | 为每个活跃分支创建分支 Owner，切换时 `disposeOwner` 销毁旧分支，`createOwner` + `adoptHResult` 挂载新分支                           |
| Each            | 为每个条目创建条目 Owner，持有条目数组 `[{ key, owner }]`，diff 后通过 `owner.elements` 获取节点进行移动/移除，新增时创建条目 Owner |
| Fault（规划中） | 为主内容和 fallback 分别创建 Owner，错误发生时切换，`reset` 时恢复                                                                  |
| Loading（未来） | 为主内容和 fallback 分别创建 Owner，异步就绪时切换                                                                                  |
| 透传组件        | Owner 的 `elements` 可能为空，实际节点在子 Owner 中，清理时递归处理                                                                 |
| 异步组件        | 占位符被替换后，`owner.elements` 自动更新为真实节点                                                                                 |
| Portal          | 持有 Portal Owner，`onMount` 中移动节点，`onUnmount` 中清理                                                                         |
| lazy            | 内部返回异步组件，逻辑由 Owner 树自然处理                                                                                           |
| 动画扩展        | 通过 `context.use` 绑定动画信号到组件 Owner，卸载时自动清理                                                                         |
| 跨端组件        | 同用户组件——Owner 树不依赖平台，`owner.elements` 的类型由 adapter 决定                                                              |
| 自定义指令      | **不适用**——指令不创建 Owner，只附加行为到已有元素                                                                                  |

## 七、原则的意义

**统一性**。所有组件和扩展遵循同一套生命周期管理范式——**一个逻辑作用域，一个 Owner**。控制流组件不再需要手动管理 `elements` 和 `cleanups`，只需要切换子 Owner。

**简化性**。`disposeOwner(branchOwner)` 一次调用即可销毁分支内的所有资源（子 Owner、DOM 节点、清理回调），不需要分层手动清理。

**跨端友好**。Owner 树是纯 JS 数据结构，与平台无关。

**可预测性**。调试时展开 Owner 树，可以看到完整的组件层级、活跃分支、当前节点、注册的清理回调。

**可扩展性**。未来任何新组件只需理解这条原则，就能与现有组件一致地工作。

## 八、结论

控制流组件族（Show/Case/Each，以及规划中的 Fault 和 Loading）的设计遵循两个核心原则：

1. **以 Owner 为稳定的身份标识，动态获取节点集合，委托 Owner 树管理全部生命周期。**
2. **为每个分支和每个条目创建独立的 Owner——一个逻辑作用域，一个 Owner。**

分支独立 Owner 的设计从根源上消除了手动管理 `elements` 和 `cleanups` 的复杂性，让控制流组件的实现与 `handleComponent` 的组件模型完全一致。`adoptHResult` 作为所有权管理函数，封装了挂载、合并和节点注册的逻辑，调用方只需负责 DOM 操作。`disposeOwner` 提供完整的递归清理，一次调用即可销毁分支内的所有资源。

`Fault` 组件作为错误边界，其设计结论已记录，但当前暂不实现。`keyed` 属性用于 `Each` 的身份标识，避免与 JSX 编译器冲突。`fallback` 统一放在 children 的最后一个函数位置，且均为可选。注释占位符仅在完全没有内容渲染时使用，有内容时活跃分支 Owner 的 `elements` 中的节点即为天然锚点。异步资源管理通过 `onUnmount` 显式注册清理逻辑，框架不提供自动中断机制。

这一原则经过了全面场景的验证，覆盖了异步组件、控制流嵌套、透传组件、多根节点、自定义指令的组合使用和多层级混合嵌套。它是 Owner 树架构的自然产物，也是 Kiaoo 后续维护和拓展的基石。
