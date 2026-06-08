# kiaao 控制流指令统一模型设计（方向四）

## 1. 设计目标

将 `when` 和 `each` 的底层实现统一为一个共享的 **identity-tracking 容器**，同时保持两者的对外 API 完全不变。这使得：

- 内部代码消除重复，维护一套核心逻辑。
- `SKIP_UPDATE` 符号自然消亡，被 identity 匹配机制取代。
- `each` 的 `key` 复用能力成为统一模型的内在特性，而非 `each` 独有。
- 为未来扩展（如 `memo` 属性）提供统一基础。

## 2. 核心抽象：动态列表容器

在底层，`when` 和 `each` 都可以被建模为一个 **动态列表容器**——它管理一组由身份（identity）标识的 DOM 节点，并根据数据变化增、删、移动这些节点。

容器接口（内部，不暴露）：

```ts
function createDynamicContainer(config: {
  container: HTMLElement;
  getItems: () => any[]; // 当前数据项数组
  getIdentity: (item: any, index: number) => any; // 获取身份
  renderItem: (item: any, index: number) => Node; // 渲染单个节点
  onMount?: (node: Node) => void; // 节点首次插入 DOM 时调用
  onDispose?: (node: Node) => void; // 节点被移除时调用
}): { stop: () => void };
```

### 2.1 工作流程

1. 在内部 `effect` 中监听数据变化。
2. 获取最新的 `items` 数组。
3. 对每个 item 计算 identity，与上次渲染的 identity 集合比较。
4. **身份匹配**：节点保留在 DOM 中，仅可能改变位置（通过 `insertBefore` 移动）。
5. **新身份**：调用 `renderItem` 创建新节点，插入正确位置，触发 `onMount`。
6. **消失的身份**：调用 `onDispose`，从 DOM 中移除节点。
7. 所有操作完成后，确保节点顺序与 `items` 顺序一致。

### 2.2 关键特性

- **复用 DOM**：身份不变时，DOM 节点被直接复用，内部的所有信号绑定和状态（焦点、输入值）天然保持。
- **无全量重建**：仅在身份变化时才创建或销毁节点。
- **移动优化**：通过 `insertBefore` 处理顺序变化，避免不必要的销毁和创建。

## 3. when 的实现映射

`when` 指令可视为一个 **最大长度为 1 的动态列表容器**。

- `getItems`：当 `when` 条件为真时，返回 `[lazyFn]`（惰性函数作为 item）；为假时返回 `[]`。
- `getIdentity`：始终返回常量（例如 `"_when"`），因为只有一个可能的节点。
- `renderItem`：调用 `lazyFn()` 返回 DOM 节点。

**行为**：

- 条件从假变真：容器发现新 identity，调用 `renderItem` 创建节点。
- 条件保持真但惰性函数重新执行：若 `renderItem` 被再次调用，但 `getItems` 返回的数组长度未变且 identity 相同，容器**不会**重新调用 `renderItem`，而是直接复用已有节点。这意味着惰性函数可以返回 `SKIP_UPDATE` 的逻辑被内置了——`createDynamicContainer` 通过 identity 匹配自动跳过渲染。
- 条件从真变假：容器移除节点。

**对 RouterView 的影响**：RouterView 不再需要自己缓存段和返回 `SKIP_UPDATE`。它只需正常返回惰性函数，`when` 的内部容器会根据 identity（由 RouterView 设置的段）自动决定是否复用布局组件 DOM。

## 4. each 的实现映射

`each` 指令直接映射为动态列表容器。

- `getItems`：`each` 绑定的数组 getter 返回值。
- `getIdentity`：用户提供的 `key` 函数，或者自动推导（见后）。
- `renderItem`：`children` 渲染函数 `(item, index) => Node`。

**自动响应式包装**（内部优化）：

- 对于普通对象 item，`each` 内部用 `define` 包装，使得 `renderItem` 接收到的 `item` 是一个响应式 getter。
- 后续数据更新时，同 identity 的 item 通过 `setter` 更新内部信号值，触发细粒度 DOM 更新，而不需要重新调用 `renderItem`。

**数据源统一**：

- `getItems` 支持返回数组、对象（`Object.entries`）、Map、Set 等，内部统一转成数组形式。
- 对于对象，identity 可以是对象的键；对于数组，默认 identity 是索引（但可通过 `key` 覆盖）。

**key 自动推导**：

- 若未提供 `key`，且 item 是响应式函数（`IS_REACTIVE`），则使用该函数引用作为 identity。
- 若 item 是普通值，且未提供 `key`，则使用索引作为 identity（回退行为，重排时会有全量重建风险，但保证正确性）。

## 5. SKIP_UPDATE 的消亡

在统一模型中，`SKIP_UPDATE` 不再需要。它的职责完全由 identity 匹配机制接管：

- **when**：惰性函数返回的内容被作为列表中的单个 item。当数据不变时，identity 不变，容器直接复用 DOM，等同于 `SKIP_UPDATE` 的效果。
- **each**：同 key 直接复用，自然跳过更新。

框架内部将不再有 `SKIP_UPDATE` 这个符号。

## 6. 对外 API 影响

**完全不变**。用户仍然使用：

- `<div when={condition}>...</div>`
- `<ul each={list} key={fn}>...</ul>`

内部的统一只是实现细节，不影响任何现有的 API 签名、行为或文档。

唯一可感知的改进是：

- 布局组件在嵌套路由中保持焦点和状态（RouterView 行为增强）。
- 列表项在增删时保留内部状态（方向 A 的正确行为）。

## 7. 与 RouterView 的协作

`RouterView` 将改为直接使用 `when` 指令（无内部 `SKIP_UPDATE`）。其惰性函数返回布局组件，`when` 的内部容器根据段 identity 自动决定是否复用 DOM。这样 RouterView 完全不需要关心缓存逻辑，专注于路由匹配。

## 8. 实现路径

1. **阶段一**：实现 `createDynamicContainer`，替换 `each` 的 `renderEach` 逻辑，确保 `each` 在方向 A（同 key 复用）下正确工作，同时支持 `Object.entries` 数据源。
2. **阶段二**：将 `when` 的实现迁移到 `createDynamicContainer`，验证 RouterView 的布局稳定性，确认 `SKIP_UPDATE` 可以被移除。
3. **阶段三**：清理旧代码，统一内部 API，编写测试。

## 9. 设计总结

方向四通过抽象出“动态列表容器”这一通用原语，在不改变任何用户 API 的前提下，统一了 `when` 和 `each` 的底层机制。它消除了内部特殊符号，让 key 复用和 DOM 保持成为框架的自然行为，并为未来的 `memo` 等高级特性奠定了坚实基础。这是 kiaao 控制流指令的最终形态，在简洁性、性能和可维护性之间取得了最优平衡。
