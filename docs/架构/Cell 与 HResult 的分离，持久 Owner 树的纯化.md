# Kiaao 核心架构重构文档：Cell 与 HResult 的分离，持久 Owner 树的纯化

**状态**：设计草案  
**版本**：1.0  
**作者**：对话共同体  
**日期**：2026-06-29

---

## 一、动机与目标

当前 `kiaao` 框架内部存在“轻量 Owner”（`isLightweight`）用于表示 DOM 原生元素在 `h()` 期间产生的临时生命周期容器。它与真正的持久 Owner（组件/指令）共享同一套接口和遍历逻辑，但在 `disposeOwner` 和 `triggerMount` 中需要通过 `isLightweight` 进行特殊分支处理。此外，`nestBind` 承担了在结果树构建完成后统一连接 Owner 关系的职责，这导致了两次遍历和概念上的模糊。

经过深入讨论，我们明确：

- **反对全局栈式隐式上下文**：框架对异步的绝对支持要求所有上下文传递必须显式，不允许 `h()` 内部隐式依赖父 Owner。
- **反对所有元素都持有 Owner**：那将退化为 VDOM，并丧失轻量级渲染和灵活性。
- **坚持后置绑定**：`h()` 内部只处理当前单元与其直接子单元的连接，向上绑定必须由父级在拿到 `h()` 返回值后完成。

基于这些约束，我们重构核心概念，引入 **Cell** 来表示 `h()` 期间的临时资源收集器，彻底与 `Owner` 分离，并重组 `HResult` 使职责更单一。

---

## 二、概念重定义

### 1. Owner（持久生命周期单元）

- **定义**：组件和指令的专属生命周期作用域。拥有 `children`（子 Owner）、`cleanups`、`mountCallbacks`、`unmountCallbacks`、`elements` 集合以及 `disposed` 标志。
- **进入持久 Owner 树**，参与递归的 `triggerMount` 和 `disposeOwner`。
- 永远不会是“轻量”或“临时”的；每个 Owner 的地位平等。
- 标记：`OWNER_SYMBOL`（私有 Symbol）。

### 2. Cell（暂存资源箱）

- **定义**：`h()` 递归期间用于临时收集 DOM 节点、待上浮的持久 Owner 引用、以及同步产生的清理函数的**一次性结构**。
- **生命周期**：在 `h()` 中创建（通常对应一个原生 DOM 元素），在父级处理（`adoptResult`）时被拆解吸收，随后丢弃。它**从不进入持久 Owner 树**。
- **不包含**：`mountCallbacks` / `unmountCallbacks` / `disposed`。它不参与生命周期管理。
- **能力**：能够收集和向上冒泡 `nodes`、`pendingOwners`、`cleanups`，以处理多层嵌套的组件/元素混合。
- 标记：`CELL_SYMBOL`（私有 Symbol）。

### 3. HResult（渲染结果携带者）

- **定义**：`h()` 函数的标准返回值。它封装了本次渲染调用的产出，供父级进行后置绑定。
- **结构**（重构后）：
  - `cell: Cell | null` —— 若本次 `h()` 生成的是一个 DOM 原生元素（或等价的无持久 Owner 输出），则包含一个 Cell。
  - `owner: Owner | null` —— 若本次 `h()` 生成的是组件或指令，则这里放置其持久 Owner（此时 `cell` 为空）。
  - `nodes: HostNode[]` —— 需要插入到父容器中的 DOM 节点集合（来自 `cell.nodes` 或直接为纯节点）。
  - `pending: Owner[]` —— 需要由父级挂接到持久 Owner 树中的持久 Owner 列表（至少包含本次生成的组件/指令 Owner，也可能包含子 Cell 中冒泡上来的持久 Owner）。

- 职责：仅携带数据，**不做任何连接操作**。

---

## 三、设计原则回顾

以下原则在重构中保持不变：

- **异步安全**：无全局 `currentOwner`，`h()` 和组件函数均不能假设当前存在“活跃父 Owner”。
- **后置绑定**：任何持久 Owner 的父子关系确立，必须发生在父作用域（如父组件函数体内）调用 `adoptResult(hr, parentOwner)` 的时刻，而不能在 `h()` 内部发生。
- **显式传递**：所有依赖通过参数或返回值传递，不使用模块级可变状态作为上下文。
- **最小持久 Owner**：只有组件和指令会产生持久 Owner；原生元素绝无持久 Owner，它们只通过 Cell 汇集资源。

---

## 四、数据结构定义

```typescript
// 符号标记
export const OWNER_SYMBOL = Symbol("kiaao.owner");
export const CELL_SYMBOL = Symbol("kiaao.cell");
export const HRESULT_SYMBOL = Symbol("kiaao.hresult");

// ── Owner ──────────────────────────────
export interface Owner {
  [OWNER_SYMBOL]: true;
  parent: Owner | null;
  children: Owner[];
  cleanups: CleanupFn[];
  mountCallbacks: CleanupFn[];
  unmountCallbacks: CleanupFn[];
  elements: Set<HostNode>;
  disposed: boolean;
}
// 注：移除 isLightweight，所有 Owner 均平等。

// ── Cell ───────────────────────────────
export interface Cell {
  [CELL_SYMBOL]: true;
  nodes: HostNode[];          // 当前元素及其子树的所有 DOM 节点
  pendingOwners: Owner[];     // 待父级挂接的持久 Owner（子组件/指令）
  cleanups: CleanupFn[];      // 子树中收集的清理函数（事件解绑、信号 stop 等）
}

// ── HResult ────────────────────────────
export interface HResult {
  [HRESULT_SYMBOL]: true;
  cell: Cell | null;
  owner: Owner | null;
  nodes: HostNode[];          // 等同于 cell?.nodes 或直接节点
  pending: Owner[];           // 等同于 cell?.pendingOwners 或当前组件/指令 Owner 的单独数组
}

// 构造器
export function createHResult(
  cell: Cell | null,
  owner: Owner | null,
  nodes: HostNode[],
  pending: Owner[],
): HResult { ... }
```

---

## 五、h() 内部各分支逻辑（重构后）

### 5.1 组件 / 指令调用

```ts
// h(tag, props, ...children) 分支：isFunction(tag)
const childHr = tag(compProps, ctx); // 执行组件或指令逻辑，得到 HResult
const childOwner = childHr.owner; // 组件/指令有 owner（指令通过 handleDirectiveMode 产生）
return createHResult(
  null, // cell 为 null，因为组件/指令不产生 Cell
  null, // 返回值的 owner 为 null，由父级设置
  childHr.nodes, // 节点透传
  childOwner ? [childOwner] : [], // pending 仅包含自己，不包含孙级（孙级已在 childHr.pending 中）
);
```

这里的关键点：我们不再在 `h()` 内部连接父 Owner，而是把 `childOwner` 放入 `pending`，留给父级。

### 5.2 DOM 原生元素

```ts
// h(tag, props, ...children) 分支：isString(tag)
const cell: Cell = { [CELL_SYMBOL]: true, nodes: [], pendingOwners: [], cleanups: [] };
const el = adapter.el(tag);
cell.nodes.push(el);

// 处理 props（事件、属性）
const propCleanups: CleanupFn[] = [];
setProps(el, props, propCleanups);
cell.cleanups.push(...propCleanups);

// 递归处理 children
const childHrs = children.map((child) => h(child));

// 遍历子 HResult，提取资源到 cell
for (const childHr of childHrs) {
  // 1) 吸收子 Cell（如果有）
  if (childHr.cell) {
    cell.nodes.push(...childHr.cell.nodes);
    cell.pendingOwners.push(...childHr.cell.pendingOwners);
    cell.cleanups.push(...childHr.cell.cleanups);
    // childHr.cell 已无用处，可被 GC
  }
  // 2) 收集 pending 中的持久 Owner（来自子组件/指令）
  //    这些持久 Owner 目前还未挂接到任何树，我们在 cell 的 pendingOwners 中继续向上冒泡
  cell.pendingOwners.push(...childHr.pending);
  // 3) 收集直接 nodes（例如纯文本节点，其 cell=null, owner=null）
  if (childHr.cell === null && childHr.owner === null) {
    cell.nodes.push(...childHr.nodes);
  }
  // 4) 收集直接 cleanups（来自纯信号绑定等）
  //    注意：子组件 Owner 自身的 cleanups 不在此处转移，它们由子 Owner 负责。
  //    但子 HResult 可能携带一些不属于任何 Owner 的孤立 cleanups，需要上浮。
  //    为简化，我们要求所有 cleanups 都与某个 Cell 或 Owner 关联，因此在递归中，
  //    所有 cleanups 最终会归入某个 cell.cleanups 或某个 Owner.cleanups。
}

// 将 children 的节点插入当前元素
for (const childNode of cell.nodes.slice(1)) {
  // 跳过 el 自身
  adapter.append(el, childNode);
}

return createHResult(cell, null, cell.nodes, []);
```

**注意**：`cell.pendingOwners` 中包含子组件/指令的持久 Owner，它们在当前层级内并不与任何父 Owner 连接，而是继续冒泡。最终，某个拥有组件 `Owner` 的父级（通过 `adoptResult`）会将这些 pending 全部挂接到自己的 `children` 中。

### 5.3 纯文本 / 注释 / 信号绑定

```ts
const node = adapter.text(str);
return createHResult(null, null, [node], []);
```

这些不产生 Cell 也不产生 Owner，`nodes` 由父 Cell 收集。

---

## 六、父级统一处理逻辑：adoptResult

在组件函数内部或控制流组件的挂载逻辑中，当得到子 `HResult` 后，需要将其整合进当前组件 `Owner`。这通过 `adoptResult(parentOwner, childHr)` 完成。

```ts
function adoptResult(parentOwner: Owner, childHr: HResult): void {
  // 1. 处理 Cell
  if (childHr.cell) {
    const cell = childHr.cell;
    // 吸收 Cell 中的节点到 elements（用于 dispose 时清理）
    for (const node of cell.nodes) {
      parentOwner.elements.add(node);
    }
    // 吸收 pendingOwners：挂接到 parentOwner 下
    for (const childOwner of cell.pendingOwners) {
      if (childOwner.disposed) continue;
      parentOwner.children.push(childOwner);
      childOwner.parent = parentOwner;
    }
    // 吸收 cleanups
    parentOwner.cleanups.push(...cell.cleanups);
  }

  // 2. 处理直接 pending（子组件/指令的 Owner，通常当 childHr.cell 为 null 时出现）
  for (const childOwner of childHr.pending) {
    if (childOwner.disposed) continue;
    parentOwner.children.push(childOwner);
    childOwner.parent = parentOwner;
  }

  // 3. 如果有直接 nodes（如纯文本）且之前未被 Cell 吸收（应在递归中已处理，但作为兜底）
  if (!childHr.cell && childHr.nodes.length > 0) {
    // 这些节点通常已在上一层的 Cell 中被收集，但如果直接出现在组件返回中，确保加入 elements
    for (const node of childHr.nodes) {
      parentOwner.elements.add(node);
    }
  }
}
```

这一函数取代了原有的 `nestBind`，**只处理一层**，不递归进入子 Owner 内部，因为子 Owner 内部已在各自的 `h()` 递归中完成了其子树的 Cell 吸收。

---

## 七、组件函数的标准写法

```ts
function MyComponent(props, ctx: Context) {
  const owner = ctx.owner;
  // 使用 h() 构建子内容
  const childHr = h('div', { onClick: ... },
    h(ChildComponent, { someProp })
  );
  // 整合
  adoptResult(owner, childHr);
  // 返回 HResult（通常返回 childHr 或基于其修改的 HResult）
  return childHr; // 或者包裹后返回
}
```

实际上，为了便利，可以提供一个 `render` 辅助函数，自动调用 `adoptResult`。

---

## 八、指令的 Owner 与组件 Owner 的异同

- **指令 Owner** 与组件 Owner 完全一致，拥有完整的生命周期回调。
- 区别在于**生成方式**和**渲染职责**：
  - 组件函数通过 `return h(...)` 生成子 HResult，再由父级整合。
  - 指令函数在 `handleDirectiveMode` 中被调用时，会接收**已存在的元素列表**作为参数，副作用直接作用于这些元素，且返回的 `HResult` 其 `owner` 是指令自身，`nodes` 就是这些传入的元素。
- 指令不能直接用组件替代，因为组件必须返回内容，而指令是“零 DOM 足迹”的副作用附着器。保留指令概念是设计上的有意选择。

---

## 九、持久 Owner 树示例

假设组件树：

```tsx
<App>
  <Header>
    <NavItem onClick={...}>Home</NavItem>
  </Header>
  <Body>
    <Card motion:from={{ opacity: 0 }}>Content</Card>
  </Body>
</App>
```

- `App`：持久 Owner
- `Header`：持久 Owner
- `NavItem`：持久 Owner
- `Body`：持久 Owner
- `Card`：原生 `div`，不产生持久 Owner；`motion:from` 是指令，产生持久 Owner（Motion 指令）。
- `onClick` 清理函数最终由 `NavItem` 或 `Header` 的持久 Owner 吸收（取决于 `h()` 递归时最近的 Cell 由哪个持久 Owner 处理）。

最终持久 Owner 树：

```
AppOwner
├── HeaderOwner
│   └── NavItemOwner
├── BodyOwner
└── MotionDirectiveOwner
```

---

## 十、受影响模块与迁移步骤

1. **core/types.ts**
   - 新增 `CELL_SYMBOL`、`Cell` 接口。
   - 移除 `Owner.isLightweight`。
   - 修改 `HResult` 定义，增加 `cell`、`pending`，`childResults` 废弃。
   - `createHResult` 签名调整。

2. **core/owner.ts**
   - `createOwner` 移除 `lightweight` 参数。
   - `disposeOwner` 移除 `isLightweight` 特殊逻辑（不再跳过 elements 清理）。
   - `triggerMount` 移除轻量 Owner 透传逻辑。

3. **core/h.ts**
   - `handleDomMode` 重写，创建 `Cell` 并处理子 HResult 的合并。
   - `handleComponent` 和 `handleDirectiveMode` 不再创建轻量 Owner，而是创建标准 Owner 或返回 `pending`。
   - `h()` 的三条分支调整返回值为新 HResult。
   - 删除旧的 `nestBind` 调用，改为在外部调用 `adoptResult`。

4. **core/component.ts**
   - `handleComponent` 内部，在获得组件返回值后，需调用 `adoptResult(owner, resultHr)`。
   - 移除 `nestBind` 相关代码。
   - `handleAsyncComponent` 也需要适配。

5. **core/flow-shared.ts** 和 **控制流组件** (`show.ts`, `case.ts`, `each.ts`)
   - 将使用 `adoptResult` 挂接分支组件 Owner。
   - `adoptBranch` 可直接返回 `HResult`，由调用方使用 `adoptResult` 处理。
   - 不再需要 `initAnchor` 返回的轻量 Owner（锚点注释节点可被 Cell 吸收或直接归父 Owner）。

6. **dom/** 层无结构变化，只影响 `createApp` 需适配新 HResult。

7. **SSR adapter** 同样需要适配新结构，但 Cell 在 SSR 下仍适用（nodes 为 SSRNode 列表）。

---

## 十一、风险与后续

- **异步组件**：`handleAsyncComponent` 中的占位注释节点和后续 `replace` 操作需要明确归属。可以创建一个临时 Cell 或直接交由组件 Owner 管理。
- **Portal**：`Portal` 组件目前直接操作 DOM 并返回轻量 Owner。重构后，Portal 可返回一个特殊的 HResult，其 `cell` 包含 Portal 内容节点，但由 Portal 组件自身负责挂载到目标容器，并注册 `onUnmount` 移除。Portal 本身仍可作为持久 Owner。
- **性能**：Cell 的引入增加了一些临时对象分配，但由于其生命周期极短且随即被 GC，内存压力可控。相对原来的 `nestBind` 全树递归，现在只有一次 `h()` 递归，总开销相当或略优。
- **社区兼容**：现有第三方指令和组件依赖于 `isLightweight` 或原有 HResult 结构，需提供过渡期类型导出。

---

## 十二、术语表

| 术语            | 定义                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| **Owner**       | 持久生命周期作用域，绑定组件或指令的挂载/卸载/清理逻辑。                        |
| **Cell**        | 一次性的资源收集箱，在 `h()` 内部暂存 DOM 节点、待上浮的持久 Owner 和清理函数。 |
| **HResult**     | `h()` 的标准返回结构，携带 `cell`、`owner`、`nodes` 和 `pending`。              |
| **pending**     | 需要父级挂接到持久 Owner 树上的 Owner 列表。                                    |
| **adoptResult** | 父级吸收子 HResult（拆解 Cell、挂接 pending、合并 cleanups）的函数。            |
| **后置绑定**    | 持久 Owner 的父子关系确立发生在父作用域，而非 `h()` 内部。                      |

---

## 十三、结语

本次重构通过引入 **Cell** 清晰分离了“临时资源运输”与“持久生命周期管理”，强化了框架的设计原则（无隐式上下文、最小持久 Owner、后置绑定）。重构后的代码路径更直接，概念负载更小，且完全保留了现有公共 API 和指令/组件的使用方式。未来的平台适配和功能扩展也将因此更加便利。

---

**文档结束**。可依据此文档进行下一步的详细编码设计。
