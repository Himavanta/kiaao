# Kiaao 核心架构重构文档：引入 Cell 概念

**状态**：最终设计  
**版本**：5.0  
**日期**：2026-06-29

---

## 目录

1. 重构动机与设计目标
2. 核心概念定义
   - 2.1 Owner —— 持久生命周期单元
   - 2.2 Cell —— 暂存资源箱
   - 2.3 HResult —— 渲染结果携带者
3. 设计原则
4. 核心函数行为定义
   - 4.1 `h()` 函数
     - 4.1.1 DOM 原生元素
     - 4.1.2 组件 / 指令
     - 4.1.3 Fragment
   - 4.2 `handleComponent` —— 组件执行环境
   - 4.3 `handleDirectiveMode` —— 指令执行环境
   - 4.4 异步组件
   - 4.5 Portal 组件
5. `toHResult` 详细实现
6. `adoptResult` 详细实现
7. 完整数据流示例
8. 持久 Owner 产生者总结
9. RenderAdapter 接口变更
10. 迁移步骤
11. 设计限制与注意事项
12. 附录：设计决策记录

---

## 1. 重构动机与设计目标

当前框架内部存在“轻量 Owner” (`isLightweight`) 用于表示 DOM 原生元素在 `h()` 期间产生的临时生命周期容器。它与真正的持久 Owner（组件/指令）共享同一套接口，导致 `disposeOwner` 和 `triggerMount` 中需要特殊分支处理。另外，`nestBind` 在构建树后统一连接 Owner 关系，造成了两次遍历和概念上的模糊。

本次重构的目标：

1. **引入 Cell 概念**，专门负责 `h()` 递归期间临时收集节点、待挂接 Owner 和清理函数，彻底与 Owner 分离。
2. **纯化 Owner**：移除 `isLightweight`，所有 Owner 地位平等，仅由组件、指令、Portal 产生，进入持久生命周期树。
3. **统一数据流**：`h()` 始终返回包含 `Cell` 的 HResult，后置绑定由框架内部 `adoptResult` 完成，用户无感知。
4. **保持现有公共 API 不变**。

---

## 2. 核心概念定义

### 2.1 Owner —— 持久生命周期单元

**职责**：组件、指令或 Portal 的独立生命周期作用域。

**特征**：

- 拥有 `children`（子 Owner）、`cleanups`、`mountCallbacks`、`unmountCallbacks`、`elements` 集合。
- 标记：`OWNER_SYMBOL`。
- 参与递归的 `triggerMount` / `disposeOwner`。
- 所有 Owner 地位平等，无“轻量”或“临时”变体。

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

### 2.2 Cell —— 暂存资源箱

**职责**：`h()` 递归期间临时收集 DOM 节点、待上浮的持久 Owner 以及清理函数的一次性容器。

**特征**：

- 标记：`CELL_SYMBOL`。
- 生命周期极短：在父级 `adoptResult` 时被拆解吸收，随即丢弃，**永不进入持久 Owner 树**。
- 不含生命周期回调（无 `mountCallbacks` / `unmountCallbacks`）。
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

### 2.3 HResult —— 渲染结果携带者

**职责**：`h()` 函数的标准返回值，封装本次渲染调用的产出，供父级进行后置绑定。

**最终接口**：

```ts
interface HResult {
  [HRESULT_SYMBOL]: true;
  cell: Cell; // 总是存在，即便为空 Cell
  owner: Owner | null; // 仅当本次 h() 直接对应组件或指令时非空
}
```

**构造器**：

```ts
function createHResult(cell: Cell, owner: Owner | null): HResult {
  return { [HRESULT_SYMBOL]: true, cell, owner };
}
```

**重要**：HResult 及其内部 Cell 是可变对象，**不可共享**给多个父级（会导致重复挂接），与旧模型限制一致。

---

## 3. 设计原则

- **异步安全**：严禁全局栈式隐式上下文（如 currentOwner），所有依赖通过参数或返回值显式传递。
- **后置绑定**：持久 Owner 的父子关系确立必须在父作用域（如 `handleComponent` 调用 `adoptResult` 时），`h()` 内部绝不向上连接。
- **最小持久 Owner**：只有组件、指令、Portal 产生持久 Owner；原生元素仅使用 Cell。
- **用户透明**：框架自动化生命周期管理，用户只需描述渲染意图。

---

## 4. 核心函数行为定义

### 4.1 `h()` 函数

`h()` 根据标签类型分三条路径，均返回 `HResult`。

#### 4.1.1 DOM 原生元素（字符串标签）

**流程**：

1. 创建新 `cell`。
2. `const el = adapter.el(tag)`，将 `el` 加入 `cell.nodes`。
3. 调用 `setProps(el, props, cleanupsArray)`，将产生的清理函数推入 `cell.cleanups`。
4. 遍历 `children`，对每个 child 使用 `toHResult(child)` 转换为 HResult。
5. 对于每个子 HResult `childHr`：
   - 合并 `childHr.cell.nodes` 到 `cell.nodes`。
   - 合并 `childHr.cell.pendingOwners` 到 `cell.pendingOwners`。
   - 合并 `childHr.cell.cleanups` 到 `cell.cleanups`。
   - 如果 `childHr.owner` 非空，将其推入 `cell.pendingOwners`。
6. 将 `cell.nodes` 中除第一个（el 自身）外的所有子节点通过 `adapter.append(el, node)` 插入当前元素。
7. 返回 `createHResult(cell, null)`。

#### 4.1.2 组件 / 指令（函数标签）

当 `tag` 是函数时：

1. 判断是否为指令（`isDirective`），分别调用 `handleDirectiveMode` 或 `handleComponent`，得到 `childHr`。
   - `childHr.cell` 包含该组件/指令子树的所有节点和未挂接的子 Owner。
   - `childHr.owner` 是组件/指令自身的持久 Owner。
2. 在 `h()` 层，让该 Owner 继续向上冒泡：
   - 将 `childHr.owner` 推入 `childHr.cell.pendingOwners`。
   - 返回 `createHResult(childHr.cell, null)`。

#### 4.1.3 Fragment

Fragment 组件直接返回 `children`，这些 children 在上层 `h()` 中被 `toHResult` 处理，无需特殊路径。

### 4.2 `handleComponent` —— 组件执行环境

**职责**：创建组件 Owner，调用组件函数，整合返回结果。

**流程**：

1. `const owner = createOwner()`
2. `const ctx = createContext(owner)`
3. `const raw = component(props, ctx)`
4. `const childHr = toHResult(raw)` — 将返回值转为 HResult。
5. `const childNodes = adoptResult(owner, childHr)` — 吸收子内容，建立子 Owner 关系。
6. 构造组件对外暴露的 HResult：
   - `const exposedCell = createCell()`
   - `exposedCell.nodes = childNodes`
   - 返回 `createHResult(exposedCell, owner)`

**关键**：返回的 HResult 的 `owner` 指向组件自身，`cell.nodes` 是整合后的直接子节点，供父级插入。组件 Owner 会在上层 `h()`（4.1.2）中被推入 `cell.pendingOwners`，最终挂接到祖先。

### 4.3 `handleDirectiveMode` —— 指令执行环境

**流程**：

1. 创建指令 Owner `const owner = createOwner()`。
2. 创建指令上下文 `const ctx = createDirectiveContext(owner)`。
3. 处理 `children`：所有子项通过 `toHResult` 转为 HResult 列表 `childHrs`。
4. 对每个子 HResult，调用 `const nodes = adoptResult(owner, childHr)` 收集到 `allNodes` 数组。
5. 遍历 `allNodes`，对每个节点使用 **`adapter.isElement(node)`** 判断：
   - 若为 `true`：调用指令函数 `tag(element, dirProps, ctx)`。
   - 若为 `false`（文本、注释节点）：跳过，开发环境可给出警告。
6. 构造指令的 HResult：
   - `const cell = createCell()`
   - `cell.nodes = allNodes`
   - 返回 `createHResult(cell, owner)`

**指令与控制流嵌套**：指令收集子节点时，若子节点是控制流组件的锚点（注释节点），因不是 Element，指令函数不会被调用。正确用法是将指令放在控制流内部，这是有意的设计边界。

### 4.4 异步组件

当 `handleComponent` 检测到返回值是 Promise 时：

1. 仍然创建组件 Owner，先返回一个占位 HResult：
   - 创建占位注释节点 `placeholder`。
   - `const cell = createCell()`，`cell.nodes.push(placeholder)`。
   - 返回 `createHResult(cell, owner)`。
2. Promise resolve 后，在 `.then` 回调中：
   - 检查 `owner.disposed`，若已卸载则跳过。
   - `const resolvedHr = toHResult(resolvedValue)`
   - `const newNodes = adoptResult(owner, resolvedHr)`
   - `adapter.replace(placeholder, ...newNodes)`
3. `.catch` 中错误处理，可替换为错误提示。

### 4.5 Portal 组件

Portal 拥有自己的持久 Owner，负责将子节点搬运到目标容器并在卸载时清理。

**流程**：

1. 作为普通组件被 `handleComponent` 调用，创建 `portalOwner`。
2. Portal 内部：
   - 解析 `props.to` 得到目标容器 `target`。
   - `const childHr = toHResult(props.children)`
   - 调用 `adoptResult(portalOwner, childHr)` —— 吸收子内容，节点自动加入 `portalOwner.elements`。
   - **提取并清空源 Cell 节点**：`const portalNodes = childHr.cell.nodes.splice(0)`。
   - （此时 `portalOwner.elements` 已包含这些节点，无需再次添加）
   - 将 `portalNodes` 通过 `adapter.append` 移动到 `target`。
   - 若 `target` 不存在，可创建注释锚点占位并异步处理。
3. Portal 返回 HResult：
   - `const cell = createCell()`
   - `cell.nodes` 包含一个 Portal 注释锚点（可选，用于标记位置）
   - 返回 `createHResult(cell, portalOwner)`
4. 卸载时，`disposeOwner(portalOwner)` 会自动执行 `elements` 清理，从目标容器移除 `portalNodes`，无需额外 `onUnmount` 回调。

---

## 5. `toHResult` 详细实现

`toHResult` 将各种类型的子内容统一转换为 `HResult`，是原 `nestBindPrimitive` 职责的承载者。

```ts
function toHResult(child: any): HResult {
  // 已是 HResult，直接返回
  if (isHResult(child)) return child;

  // 信号：创建绑定文本节点，stop 归入 Cell.cleanups
  if (isUse(child)) {
    const cell = createCell();
    const textNode = adapter.text("");
    cell.nodes.push(textNode);
    const derived = use(child, () => adapter.setText(textNode, String(child())));
    const stop = getSignalState(derived)?.stop;
    if (stop) cell.cleanups.push(stop);
    return createHResult(cell, null);
  }

  // 函数：调用后递归处理返回值
  if (isFunction(child)) {
    return toHResult(child());
  }

  // 数组：扁平化一层后递归处理每个元素，合并 Cell
  if (isArray(child)) {
    const cell = createCell();
    for (const item of child.flat()) {
      // flat() 仅扁平一层
      const itemHr = toHResult(item);
      cell.nodes.push(...itemHr.cell.nodes);
      cell.pendingOwners.push(...itemHr.cell.pendingOwners);
      cell.cleanups.push(...itemHr.cell.cleanups);
      if (itemHr.owner) cell.pendingOwners.push(itemHr.owner);
    }
    return createHResult(cell, null);
  }

  // null / undefined：过滤，不产生节点
  if (isNil(child)) {
    return createHResult(createCell(), null); // nodes 为空
  }

  // 其他原始值：转为文本节点
  const cell = createCell();
  cell.nodes.push(adapter.text(String(child)));
  return createHResult(cell, null);
}
```

**行为说明**：

- `false` 渲染为 `"false"` 文本（与旧模型一致，本次未改变）。
- `null`/`undefined` 被静默过滤，不产生任何 DOM 节点（保持旧模型行为）。

---

## 6. `adoptResult` 详细实现

`adoptResult` 是内部函数，由 `handleComponent`、`handleDirectiveMode`、控制流组件等调用，负责将 HResult 中的 Cell 资源吸收到指定 Owner。

```ts
function adoptResult(owner: Owner, hr: HResult): HostNode[] {
  const cell = hr.cell;
  // 节点注册到 elements（用于 dispose 时清理）
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
  // 返回节点列表供父级插入
  return cell.nodes;
}
```

**注意**：`adoptResult` 仅处理一层，不递归。因为 Cell 中嵌套的子 Owner 已经在各自的 `h()` 递归中完成了内部整合，只需挂接到当前 Owner 即可。

---

## 7. 完整数据流示例

组件结构：`<App><div><Child/></div></App>`，Child 渲染 `<span>text</span>`。

1. `h(App)` → `handleComponent(App)`：
   - 创建 `appOwner`。
   - 调用 `App()`，返回 `h("div", null, h(Child))`。
2. `h("div")`（DOM 分支）：
   - 创建 `cellDiv`，`el = <div>`。
   - 处理 children：`h(Child)`。
3. `h(Child)` → `handleComponent(Child)`：
   - 创建 `childOwner`。
   - 调用 `Child()`，返回 `h("span", null, "text")`。
4. `h("span")`（DOM 分支）：
   - 创建 `cellSpan`，`el = <span>`，`nodes` 包含 `<span>` 和 text 节点。
   - 返回 `HResult { cell: cellSpan, owner: null }`。
5. 回到 `handleComponent(Child)`：
   - `adoptResult(childOwner, spanHr)`：吸收 `<span>` 和 text 到 `childOwner.elements`。
   - 构造 Child 暴露 HResult：`exposedCell.nodes = [<span>, text]`，`owner = childOwner`。
   - 返回 `HResult { cell: exposedCell, owner: childOwner }`。
6. 回到 `h(Child)`（步骤3）：
   - 将 `childOwner` 推入 `exposedCell.pendingOwners`。
   - 返回 `HResult { cell: exposedCell, owner: null }`。
7. 回到 `h("div")`（步骤2）：
   - 吸收子 HResult 到 `cellDiv`：`nodes` 合并，`pendingOwners` 获得 `childOwner`。
   - 将子节点插入 `<div>`。
   - 返回 `HResult { cell: cellDiv, owner: null }`。
8. 回到 `handleComponent(App)`（步骤1）：
   - `adoptResult(appOwner, divHr)`：吸收 `<div>` 及子节点，挂接 `childOwner`。
   - 构造 App HResult：`exposedCell.nodes = [<div>...]`，`owner = appOwner`。
   - 返回 `HResult { cell: exposedCell, owner: appOwner }`。
9. 回到顶层 `h(App)`：
   - 将 `appOwner` 推入 `exposedCell.pendingOwners`。
   - 最终返回 `HResult { cell: exposedCell, owner: null }`。
10. `createApp` 通过 `adoptResult(rootOwner, finalHr)` 完成根挂载。

**最终持久 Owner 树**：`rootOwner` → `appOwner` → `childOwner`。

---

## 8. 持久 Owner 产生者总结

| 产生者      | Owner 类型 | 说明                                        |
| ----------- | ---------- | ------------------------------------------- |
| 组件        | 持久 Owner | 由 `handleComponent` 创建，完整生命周期。   |
| 指令        | 持久 Owner | 由 `handleDirectiveMode` 创建，管理副作用。 |
| Portal      | 持久 Owner | 管理节点搬运，卸载时自动清理目标容器节点。  |
| 原生元素    | 无 Owner   | 仅使用 Cell 收集节点和资源。                |
| 文本/注释等 | 无 Owner   | 直接生成节点，被父 Cell 吸收。              |

---

## 9. RenderAdapter 接口变更

新增方法：

```ts
isElement(value: unknown): value is HostNode;
```

- DOM adapter: `value instanceof Element`
- SSR adapter: `isObject(value) && value.type === 'element'`

用途：在 `handleDirectiveMode` 中过滤非 Element 节点。

---

## 10. 迁移步骤

1. **类型定义** (`core/types.ts`)：
   - 新增 `CELL_SYMBOL`、`Cell` 接口。
   - 移除 `Owner.isLightweight`。
   - 修改 `HResult` 为 `{ cell: Cell; owner: Owner | null }`，移除 `nodes`、`childResults`、`cleanups` 独立字段。
2. **Owner 系统** (`core/owner.ts`)：
   - `createOwner` 移除参数。
   - `disposeOwner` 移除 `isLightweight` 分支。
   - `triggerMount` 移除轻量 Owner 透传。
3. **核心 `h()` 函数** (`core/h.ts`)：
   - 重写 `handleDomMode`，使用 Cell 合并。
   - 调整组件/指令分支逻辑。
   - 移除 `nestBind` 相关调用。
4. **组件处理** (`core/component.ts`)：
   - `handleComponent` 实现新流程，内置 `adoptResult`。
   - 移除 `nestBind` 函数。
   - 新增 `toHResult` 辅助函数。
5. **指令处理** (`core/direct.ts`)：
   - `handleDirectiveMode` 按新流程重写。
6. **控制流组件** (`show.ts`, `case.ts`, `each.ts`)：
   - 使用 `adoptResult` 挂接分支 Owner。
7. **Portal** (`dom/portal.ts`)：
   - 改为持久 Owner 组件，节点所有权转移，移除冗余添加。
8. **DOM 适配器** (`dom/adapter.ts`)：
   - 新增 `isElement` 实现。
9. **SSR 适配器** (`server/adapter.ts`)：
   - 新增 `isElement` 实现。
10. **测试**：覆盖各类嵌套、异步、Portal、指令、控制流混合场景。

---

## 11. 设计限制与注意事项

- **HResult 不可共享**：`h()` 返回的 HResult 内部 Cell 是可变对象，同一实例不可挂载到多个父级，否则导致 Owner 重复挂接（与旧模型一致）。
- **指令不穿透控制流**：指令只能作用于直接子节点中的 `Element`，包裹 `Show`/`Case`/`Each` 时将因锚点为注释节点而无效。正确用法是指令在内层。
- **`null`/`undefined` 被过滤**：不产生节点，用于支持 `{condition && <Comp/>}` 模式（`false` 渲染为 `"false"` 文本，未改变）。
- **异步组件**：确保 `adoptResult` 在 `owner.disposed === false` 时执行，避免卸载后挂载。
- **Cell GC**：Cell 对象存活极短，压力可控，无需额外优化。

---

## 12. 附录：设计决策记录

| 问题                    | 决策                                                        | 理由                                      |
| ----------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| 统一 pending 路径       | 仅使用 `Cell.pendingOwners`，删除 HResult 的 `pending` 字段 | 消除冗余，`adoptResult` 只查看一条路径    |
| Portal 是否产生 Owner   | 是，使用持久 Owner                                          | 所有权清晰，清理内聚，与指令一致          |
| 指令对非 Element 处理   | 使用 `adapter.isElement` 过滤，跳过非 Element               | 指令语义是副作用附着元素，文本/注释无意义 |
| 指令+控制流嵌套         | 设计限制，指令不穿透锚点；文档说明                          | 保护控制流封装，正确用法是指令在内层      |
| `null`/`undefined` 渲染 | 过滤，不产生节点                                            | 保持旧行为，支持 `condition && <Comp/>`   |
| `false` 渲染            | 保持为 `"false"` 文本                                       | 与旧模型一致，未在本重构中改动            |
| 数组扁平化              | `toHResult` 中使用 `flat()` 仅扁平一层                      | 避免过度递归，性能平衡                    |
| Portal 节点所有权       | `splice(0)` 清空源 Cell，不再重复 `elements.add`            | 避免冗余操作，所有权转移清晰              |
| 共享 HResult 限制       | 文档标注，不进行结构性修复                                  | 与旧限制一致，正常使用不会触发            |

---

**文档结束**。以上为最终完整版设计，可直接指导编码实施。
