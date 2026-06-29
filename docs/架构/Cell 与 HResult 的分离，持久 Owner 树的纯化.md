# Kiaao 核心架构重构文档：引入 Cell 概念

**状态**：最终设计  
**版本**：3.0  
**日期**：2026-06-29

---

## 一、文档概述

本文档描述对 kiaao 框架核心渲染与生命周期模型的重大重构。重构的核心是引入 **Cell** 作为临时资源收集容器，将 **Owner** 严格限制为持久生命周期单元，并重新定义 **HResult** 作为统一的渲染结果载体。重构旨在消除原有“轻量 Owner”的语义模糊、合并冗余的数据传递路径、减少内部遍历次数，同时保持用户公共 API 完全不变。

本文档包含完整的设计推导、最终接口定义、各核心函数的详细行为描述、迁移步骤以及针对所有讨论点的明确回应。

---

## 二、设计目标与原则

### 目标

1. **概念清晰化**：彻底分离“临时资源运输”与“持久生命周期管理”。
2. **消除重复路径**：统一待挂接 Owner 的传递机制，仅通过 `Cell.pendingOwners` 冒泡。
3. **简化内部遍历**：将原先的 `nestBind` 二次遍历合并到 `h()` 递归中，由框架自动完成。
4. **保持用户 API 不变**：组件编写方式、`h()` 调用、指令用法、控制流组件均无感知。
5. **保持核心约束**：异步安全、显式传递、后置绑定。

### 原则

- **严禁全局隐式上下文**（如 currentOwner 栈），确保异步安全。
- **持久 Owner 仅由组件/指令产生**，原生 DOM 元素绝无持久 Owner。
- **父子 Owner 绑定后置**：仅在父作用域（如 `handleComponent`、`adoptResult`）中进行，`h()` 内部不向上连接父 Owner。
- **框架全权负责生命周期整合**：用户只需返回渲染内容。

---

## 三、核心概念定义

### 3.1 Owner —— 持久生命周期单元

**职责**：组件或指令的独立生命周期作用域。

**特征**：

- 具有 `children`（子 Owner）、`cleanups`、`mountCallbacks`、`unmountCallbacks`、`elements` 集合。
- 标记：`OWNER_SYMBOL`。
- 参与递归的 `triggerMount` / `disposeOwner`。
- 不再有“轻量”或“临时”概念，所有 Owner 地位平等。

**接口**：

```ts
interface Owner {
  [OWNER_SYMBOL]: true;
  parent: Owner | null;
  children: Owner[];
  cleanups: CleanupFn[];
  mountCallbacks: CleanupFn[];
  unmountCallbacks: CleanupFn[];
  elements: Set<HostNode>;
  disposed: boolean;
}
```

### 3.2 Cell —— 暂存资源箱

**职责**：`h()` 递归期间临时收集 DOM 节点、待上浮的持久 Owner 以及清理函数的一次性容器。

**特征**：

- 标记：`CELL_SYMBOL`。
- 生命周期极短：在创建它的 `h()` 调用返回后，由父级（DOM 元素的 `h()` 或组件的 `adoptResult`）拆解吸收，随即丢弃。
- **不参与**任何生命周期回调（无 `mountCallbacks`、`unmountCallbacks`）。
- 能够逐层合并子 Cell 的内容，实现资源向上冒泡。

**接口**：

```ts
interface Cell {
  [CELL_SYMBOL]: true;
  nodes: HostNode[]; // 当前元素及其子树的所有 DOM 节点
  pendingOwners: Owner[]; // 待父级挂接的持久 Owner（子组件/指令）
  cleanups: CleanupFn[]; // 子树中产生的清理函数（事件解绑、信号 stop 等）
}
```

### 3.3 HResult —— 渲染结果携带者

**职责**：`h()` 函数的标准返回值，封装一次渲染调用的产出，供父级进行后置绑定。

**最终接口**：

```ts
interface HResult {
  [HRESULT_SYMBOL]: true;
  cell: Cell; // 总是存在，即便为空 Cell
  owner: Owner | null; // 仅当本次 h() 直接对应组件或指令时非空
}
```

**关键点**：

- `cell` 始终包含，省去空值检查。
- `owner` 携带当前层产生的持久 Owner（如果有），但该 Owner 的挂接仍需通过 `cell.pendingOwners` 上浮。
- 移除了旧的 `nodes`、`childResults`、`pending` 独立字段。

**构造器**：

```ts
function createHResult(cell: Cell, owner: Owner | null): HResult {
  return { [HRESULT_SYMBOL]: true, cell, owner };
}
```

---

## 四、核心函数行为定义

### 4.1 `h()` 函数重写

`h()` 根据标签类型分三条路径，均返回 `HResult`。

#### 4.1.1 分支一：DOM 原生元素（字符串标签）

**流程**：

1. 创建新 `cell`。
2. 调用 `adapter.el(tag)` 生成 `el`，将 `el` 加入 `cell.nodes`。
3. 调用 `setProps(el, props, cleanupsArray)`，将产生的清理函数推入 `cell.cleanups`。
4. 遍历 `children`，对每个 child 执行：
   - 若 child 是 `HResult`（通过 `isHResult` 判断）：递归至此处已由 `h()` 构建完成，得到 `childHr`。
   - 若 child 是信号（`isUse`）：创建信号绑定文本节点，将其包装为 `HResult`（cell 包含该文本节点）。
   - 若 child 是函数：调用 `child()` 得到返回值，递归此流程。
   - 若 child 是原始值或数组：包装为文本节点或递归摊平。
5. 对于每个子 `HResult`（上述规范化后）：
   - 将 `childHr.cell.nodes` 全部追加到当前 `cell.nodes`。
   - 将 `childHr.cell.pendingOwners` 全部追加到当前 `cell.pendingOwners`。
   - 将 `childHr.cell.cleanups` 全部追加到当前 `cell.cleanups`。
   - 如果 `childHr.owner` 非空，**将其推入 `cell.pendingOwners`**。
6. 将 `cell.nodes` 中除第一个外的所有子节点通过 `adapter.append(el, node)` 插入当前元素。
7. 返回 `createHResult(cell, null)`。

**伪代码**：

```ts
function handleDomMode(tag, props, children): HResult {
  const cell = createCell();
  const el = adapter.el(tag);
  cell.nodes.push(el);

  const propCleanups = [];
  setProps(el, props, propCleanups);
  cell.cleanups.push(...propCleanups);

  // 规范化 children 并处理
  const childHrs = normalizeChildren(children).map((child) => toHResult(child));

  for (const childHr of childHrs) {
    cell.nodes.push(...childHr.cell.nodes);
    cell.pendingOwners.push(...childHr.cell.pendingOwners);
    cell.cleanups.push(...childHr.cell.cleanups);
    if (childHr.owner) {
      cell.pendingOwners.push(childHr.owner);
    }
  }

  // 将子节点插入 DOM（跳过 el 自身）
  for (const node of cell.nodes.slice(1)) {
    adapter.append(el, node);
  }

  return createHResult(cell, null);
}
```

`toHResult` 工具负责将各种类型的 child 转为 `HResult`（对字符串创建文本 Cell，对信号创建绑定文本 Cell，对数组递归摊平等）。

#### 4.1.2 分支二：组件 / 指令（函数标签）

当 `tag` 是函数时：

1. 判断是否为指令（`isDirective`），分别调用 `handleDirectiveMode` 或 `handleComponent`，均返回 `childHr`。
   - `childHr.cell` 包含该组件/指令子树的所有节点和未挂接的子 Owner。
   - `childHr.owner` 是组件/指令自身的持久 Owner。
2. 在 `h()` 层，我们需要让这个组件/指令 Owner 继续向上冒泡，同时传递其节点：
   - 从 `childHr.cell` 取出 `cell` 作为基础。
   - 将 `childHr.owner` 推入 `cell.pendingOwners`。
   - 返回 `createHResult(cell, null)`。

**伪代码**：

```ts
// 在 h() 的分支中
if (isFunction(tag)) {
  const childHr = isDirective(tag)
    ? handleDirectiveMode(tag, props, children)
    : handleComponent(tag, props, children);

  childHr.cell.pendingOwners.push(childHr.owner);
  return createHResult(childHr.cell, null);
}
```

**说明**：`handleComponent` / `handleDirectiveMode` 内部已经通过 `adoptResult` 完成了其子树内所有子内容的整合，因此 `childHr.cell.pendingOwners` 中已经包含了更深层的待挂接 Owner。这里只把组件自身 Owner 加入，使其进入冒泡链。

#### 4.1.3 分支三：Fragment / 纯内容

Fragment 组件本身直接返回 `children`，这些 children 在上一层的 `h()` 中被规范化处理，因此最终都会落入 DOM 元素分支或组件分支。我们无需为 Fragment 创建单独路径。

纯文本、注释等：创建 Cell 包含对应节点，返回 `createHResult(cell, null)`。

### 4.2 `handleComponent` —— 组件执行环境

**职责**：创建组件 Owner，调用组件函数，并整合返回结果。

**流程**：

1. `const owner = createOwner()`
2. `const ctx = createContext(owner)`
3. `const raw = component(props, ctx)`
4. `const childHr = normalizeToHResult(raw)` — 将组件返回值转为 HResult（若已是 HResult 则直接使用，否则包装为 Cell 的 HResult）。
5. `const childNodes = adoptResult(owner, childHr)` — 将 childHr 的资源吸收到 `owner`，并获取需要插入父容器的节点列表。
6. 构造本组件对外展现的 HResult：
   - 创建新 Cell：`const exposedCell = createCell()`
   - 将 `childNodes` 加入 `exposedCell.nodes`
   - （`exposedCell.pendingOwners` 及 `cleanups` 此时为空，因为已在步骤5中全部吸收）
   - 返回 `createHResult(exposedCell, owner)`

**关键**：返回的 HResult 中，`owner` 指向组件自身，`cell.nodes` 为整合后的直接子节点，供父级插入。组件 Owner 会在父级的 `h()` 步骤（4.1.2）中被推入 `cell.pendingOwners`，最终挂接到祖先。

**`adoptResult` 函数**（内部）：

```ts
function adoptResult(owner: Owner, hr: HResult): HostNode[] {
  const cell = hr.cell;
  // 将节点注册到 elements（用于 dispose 时清理）
  for (const node of cell.nodes) {
    owner.elements.add(node);
  }
  // 挂接所有待定 Owner
  for (const childOwner of cell.pendingOwners) {
    if (!childOwner.disposed) {
      owner.children.push(childOwner);
      childOwner.parent = owner;
    }
  }
  // 合并清理函数
  owner.cleanups.push(...cell.cleanups);
  // 返回节点列表，供父级插入到 DOM
  return cell.nodes;
}
```

**异步组件**：当 `raw` 为 Promise 时，进入 `handleAsyncComponent` 流程（见 4.4）。

### 4.3 `handleDirectiveMode` —— 指令执行环境

指令与组件类似，拥有独立的持久 Owner，但不产生新的 DOM 封装。

**流程**：

1. 创建指令 Owner：`const owner = createOwner()`。
2. 创建指令上下文：`const ctx = createDirectiveContext(owner)`。
3. 准备指令 props，包括 `children`。
4. 处理 `children`：将所有子项转换为 HResult 列表（使用 `normalizeChildren` + `toHResult`）。
5. 对于每个子 HResult：
   - 使用 `adoptResult(owner, childHr)` 将子资源整合到指令 Owner 下。
   - 将返回的节点列表收集到一个 `allNodes` 数组中。
6. 对 `allNodes` 中的每个**真实 DOM 元素**（通过 `adapter.isNode` 判断），调用指令函数 `tag(element, dirProps, ctx)`。
   - 指令函数内部可通过 `ctx.onMount` / `ctx.onUnmount` 注册副作用，这些已绑定到 `owner`。
7. 构造指令的 HResult：
   - 创建新 Cell，将 `allNodes` 放入 `cell.nodes`。
   - 返回 `createHResult(cell, owner)`。

**说明**：指令不产生自己的容器元素，因此返回的 `cell.nodes` 就是传入的子节点。指令 Owner 会在父级 `h()` 中推入 `cell.pendingOwners`，正常挂接。

### 4.4 异步组件

当 `handleComponent` 检测到返回值是 Promise 时：

1. 仍然创建组件 Owner，并先返回一个占位 HResult：
   - 创建占位注释节点 `placeholder`。
   - `const cell = createCell()`，`cell.nodes.push(placeholder)`。
   - 返回 `createHResult(cell, owner)`，使组件 Owner 挂入树中，占位符插入 DOM。
2. Promise resolve 后，在 `.then` 回调中：
   - 检查 `owner.disposed`，若已卸载则跳过。
   - 将 resolve 值规范化为 HResult（`resolvedHr`）。
   - 调用 `adoptResult(owner, resolvedHr)`，吸收子内容，同时更新 `owner.elements`。
   - 通过 `adapter.replace(placeholder, ...resolvedHr.cell.nodes)` 替换占位符。
3. 错误处理：`.catch` 中显示错误信息并可能替换为错误提示节点。

### 4.5 Portal 组件

Portal 将子节点移动至目标容器，不产生自己的持久 Owner。其处理方式：

1. 调用 `h(props.children)` 或直接处理 children，得到子 HResult。
2. 将子 HResult 的节点通过 `adapter.append` 插入目标容器。
3. 注册清理：利用父组件的 Owner（通过 `context.onUnmount` 或直接 push 到父 Owner 的 `cleanups`）在卸载时从目标容器移除这些节点。
4. 返回一个 HResult：cell 中可能仅包含一个注释锚点，owner 为 null。
5. 由于 Portal 没有自己的 Owner，它返回的 HResult 在父级 `adoptResult` 时会被正常吸收，其清理函数会合并到父 Owner。

---

## 五、完整数据流示例

以组件 `App` 渲染 `<div><Child/></div>` 为例。

1. `h(App)` → 进入 `handleComponent(App)`：
   - 创建 `appOwner`。
   - 调用 `App()`，内部返回 `h("div", null, h(Child))`。
2. `App` 内部 `h("div", ...)`：
   - 创建 `cellDiv`，`el` = `<div>`。
   - 处理 children：`h(Child)`。
3. `h(Child)` → 进入 `handleComponent(Child)`：
   - 创建 `childOwner`。
   - 调用 `Child()`，返回内容（假设返回 `h("span", null, "text")`）。
4. `Child` 内部 `h("span", ...)`：
   - 创建 `cellSpan`，`el` = `<span>`，`nodes` = `<span>`、`text`。
   - 返回 `HResult { cell: cellSpan, owner: null }`。
5. 回到 `handleComponent(Child)`：
   - `adoptResult(childOwner, spanHr)`：吸收 span 节点到 `childOwner.elements`，挂接子 Owner（无），合并 cleanups。
   - 构造 Child 的 HResult：`exposedCell` nodes 包含 span 和 text，`owner` = `childOwner`。
   - 返回 `HResult { cell: exposedCell, owner: childOwner }`。
6. 回到 `h(Child)`（步骤3）：
   - 将 `childOwner` 推入 `exposedCell.pendingOwners`。
   - 返回 `HResult { cell: exposedCell, owner: null }`（因为 `h()` 本身不产生持久 Owner）。
7. 回到 `h("div")`（步骤2）：
   - 吸收子 HResult（来自 Child）到 `cellDiv`：`nodes` 合并 span/text，`pendingOwners` 获得 `childOwner`。
   - 将子节点插入 `<div>`。
   - 返回 `HResult { cell: cellDiv, owner: null }`。
8. 回到 `handleComponent(App)`（步骤1）：
   - `adoptResult(appOwner, divHr)`：吸收 div 及子节点到 `appOwner.elements`，挂接 `childOwner` 到 `appOwner.children`。
   - 构造 App HResult：`exposedCell` nodes 包含 `<div>...`，`owner` = `appOwner`。
   - 返回 `HResult { cell: exposedCell, owner: appOwner }`。
9. 回到顶层 `h(App)`：
   - 将 `appOwner` 推入 `exposedCell.pendingOwners`。
   - 最终返回 `HResult { cell: exposedCell, owner: null }`。
10. `createApp` 拿到该 HResult，通过 `adoptResult(rootOwner, finalHr)` 完成根挂载，节点插入容器。

**最终持久 Owner 树**：`rootOwner` → `appOwner` → `childOwner`。所有 DOM 节点归属最近的持久 Owner 的 `elements`。

---

## 六、设计决策附录（回应审查问题）

### 6.1 统一 pending 路径

**问题**：`HResult.pending` 与 `Cell.pendingOwners` 冗余。  
**决策**：完全取消 `HResult.pending` 字段。所有待挂接的 Owner 只能存在于 `Cell.pendingOwners` 中。组件分支也构造最小 Cell 来装其 Owner，从而 `adoptResult` 仅查看 `cell.pendingOwners`。

### 6.2 `handleComponent` 返回结构明确

返回 `createHResult(cell, owner)`，其中 `cell.nodes` 为子内容整合后的节点集合，`cell.pendingOwners` 在 `adoptResult` 后为空（因子 Owner 已挂入组件 Owner）。组件 Owner 在上层 `h()` 中会被推入该 `cell.pendingOwners`，实现继续上浮。

### 6.3 异步组件 adoptResult 时机

`handleAsyncComponent` 持有 `owner` 引用，在 Promise resolve 后执行 `adoptResult(owner, resolvedHr)`，然后用 `adapter.replace` 更新 DOM。需检查 `owner.disposed` 防止挂载到已卸载组件。

### 6.4 Portal 不产生持久 Owner

Portal 利用父组件 Owner 的 `cleanups` 管理目标容器内节点的移除。它返回的 HResult 的 `cell` 仅包含锚点，`owner` 为 null。这符合“无独立生命周期”的定位。

### 6.5 信号清理的归属

信号绑定产生的 `stop` 函数会沿着 Cell 链上浮，最终通过 `adoptResult` 并入最近持久 Owner 的 `cleanups`。`createContextUse` 的逻辑不受 Cell 影响，继续正常追踪组件内部信号。

### 6.6 指令的嵌套处理

`handleDirectiveMode` 内部对每个 child HResult 调用 `adoptResult(owner, childHr)`，从而将子组件/指令的 Owner 挂入指令 Owner，并收集节点。指令 Owner 会被父级挂接，确保指令副作用随条件渲染正确卸载。

### 6.7 childResults 废弃

旧的 `childResults` 用于 `nestBind` 二次遍历。新模型中，`h()` 内部递归时直接处理 children 并合并 Cell，不再需要 `childResults`。`handleDomMode` 返回的 HResult 中不再含此字段。

### 6.8 removeNode 非节点保护

`elements` 中的节点均通过 `adapter.isNode` 或 Cell 收集时确保合法性，因此理论上不再需要 `isNil` 守卫。但出于防御性编程，可保留轻量检查，无负面影响。

### 6.9 Cell GC 压力

每个 DOM 元素创建一个 Cell，立即在父级 h() 或 adoptResult 中被吸收，存活时间极短（仅存在调用栈内）。与原有 `nestBind` 中的临时数组分配相比，总对象数相当或略少，GC 压力可控。

### 6.10 混合 children 处理细节

`h()` 的 DOM 分支需对 children 进行类型分发：

- **HResult**：直接合并其 Cell。
- **Signal**：创建绑定的文本节点，再包装为 HResult。
- **Function**：调用后递归处理返回值。
- **Array**：摊平后递归。
- **原始值**：创建文本节点。

该逻辑封装在 `normalizeChildren` 和 `toHResult` 工具函数中，确保一致性。

---

## 七、迁移步骤

1. **类型定义更新**（`core/types.ts`）：
   - 新增 `CELL_SYMBOL`、`Cell` 接口。
   - 移除 `Owner.isLightweight`。
   - 修改 `HResult` 为 `{ cell: Cell; owner: Owner | null }`，移除其他字段。
2. **Owner 系统**（`core/owner.ts`）：
   - `createOwner()` 去掉参数。
   - `disposeOwner` 移除 `isLightweight` 分支。
   - `triggerMount` 移除轻量透传。
3. **核心 h 函数**（`core/h.ts`）：
   - 重写 `handleDomMode` 使用 Cell 和子 HResult 合并。
   - 调整组件/指令分支为统一的上浮逻辑。
   - 移除 `nestBind` 调用。
4. **组件与指令处理**（`core/component.ts`, `core/direct.ts`）：
   - `handleComponent` 内部调用 `adoptResult`，返回新 HResult。
   - `handleDirectiveMode` 调整为新流程。
   - 新增 `toHResult`、`normalizeChildren` 辅助函数。
5. **控制流组件**（`show`, `case`, `each`）：
   - 使用 `adoptResult` 挂接分支 Owner。
   - 移除对轻量 Owner 的依赖。
6. **DOM 适配层**（`dom/adapter.ts`, `dom/create-app.ts`）：
   - `createApp` 基于 `hr.cell.nodes` 挂载。
7. **SSR 适配器**（`server/adapter.ts`, `server/index.ts`）：
   - Cell 在 SSR 下同样适用，无需特殊处理。
8. **测试与兼容性**：
   - 单元测试覆盖各类 children 组合、异步组件、指令嵌套。
   - 确保现有应用无破坏。

---

## 八、风险与缓解

- **现有第三方指令/组件**：如果外部代码直接依赖 `HResult` 的旧形状，需通过类型导出过渡。但内部结构不对外暴露，概率低。
- **异步组件竞态**：已通过 `owner.disposed` 检查防护。
- **性能退化**：Cell 对象分配频繁，但现代引擎对短生命周期对象优化良好；测量确认，不预判问题。

---

## 九、结论

本次重构通过引入 Cell 将临时运输与持久生命周期清晰解耦，统一了待挂接 Owner 的上浮通道，消除了轻量 Owner 和二次遍历，使框架内核更简洁、健壮。所有设计决策均围绕保持公共 API 不变和强化核心原则展开，为未来扩展奠定了清晰的基础。

**文档结束**，可按此进行实施。
