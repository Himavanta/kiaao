# Kiaao 核心架构重构文档：HResult 统一化与 Owner 纯化

**状态**：最终设计  
**版本**：6.0  
**日期**：2026-06-29

---

## 目录

1. 重构动机与目标
2. 核心概念定义
   - 2.1 Owner —— 持久生命周期单元
   - 2.2 HResult —— 统一结果携带者
3. 设计原则
4. 核心函数行为定义
   - 4.1 `h()` 函数
     - 4.1.1 DOM 原生元素
     - 4.1.2 组件 / 指令
     - 4.1.3 Fragment
   - 4.2 `handleComponent` —— 组件执行环境
   - 4.3 `handleDirectiveMode` —— 指令执行环境
   - 4.4 `adoptResult` —— 内部吸收函数
   - 4.5 `toHResult` —— 子内容标准化
   - 4.6 异步组件
   - 4.7 Portal 组件
5. 完整数据流示例
6. 持久 Owner 产生者总结
7. RenderAdapter 接口变更
8. 迁移步骤
9. 设计限制与注意事项
10. 附录：设计决策记录

---

## 1. 重构动机与目标

原有框架使用“轻量 Owner”（`isLightweight`）表示 DOM 原生元素在 `h()` 期间的临时容器，与真正的持久 Owner 共享接口，导致 `disposeOwner` 和 `triggerMount` 需特殊分支处理。另外，`nestBind` 在后置阶段全树递归连接 Owner，造成二次遍历。

本次重构的目标：

1. **纯化 Owner**：移除 `isLightweight`，所有 Owner 平等，仅由组件、指令、Portal 产生。
2. **消除二次遍历**：将后置连接逻辑内化到 `h()` 递归和组件边界，不再需要 `nestBind`。
3. **统一结果结构**：HResult 统一携带节点、待挂接 Owner、清理函数；组件边界 HResult 的 `owner` 非空，资源已被吸收。
4. **保持公共 API 不变**。

---

## 2. 核心概念定义

### 2.1 Owner —— 持久生命周期单元

**职责**：组件、指令或 Portal 的独立生命周期作用域。

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

- 不再有 `isLightweight`。
- 所有 Owner 地位平等，参与递归 `triggerMount` / `disposeOwner`。
- 仅组件、指令、Portal 产生 Owner。

### 2.2 HResult —— 统一结果携带者

**职责**：`h()` 函数的标准返回值，封装渲染产出。在 `owner` 为 `null` 时充当临时资源包（原轻量 Owner 的职责），向上冒泡待挂接 Owner 和清理函数；在 `owner` 非空时表示组件/指令边界，资源已被内部吸收。

**接口**：

```ts
interface HResult {
  [HRESULT_SYMBOL]: true;
  owner: Owner | null; // 非空 = 组件/指令边界（资源已吸收）
  nodes: HostNode[]; // 需要插入父容器的节点（始终存在）
  pending: Owner[]; // 待挂接的子 Owner（仅当 owner 为 null 时有意义）
  cleanups: CleanupFn[]; // 待合并的清理函数（仅当 owner 为 null 时有意义）
}
```

**规则**：

- `owner !== null`：`pending` 和 `cleanups` 为空数组（资源已被该 Owner 通过 `adoptResult` 吸收）。
- `owner === null`：`pending` 和 `cleanups` 携带需继续向上冒泡的资源，直到被某个持久 Owner 吸收。

---

## 3. 设计原则

- **异步安全**：严禁全局隐式上下文，所有依赖通过参数或返回值显式传递。
- **后置绑定**：父子 Owner 关系在父作用域（组件/指令/控制流处理内部）通过 `adoptResult` 建立。
- **最小持久 Owner**：只有组件、指令、Portal 产生 Owner；原生元素仅使用 HResult。
- **用户透明**：框架自动完成整合，用户只需返回渲染内容。
- **HResult 不可共享**：同一 HResult 不可挂载到多个父级（内部数组会被修改，导致重复挂接）。

---

## 4. 核心函数行为定义

### 4.1 `h()` 函数

`h()` 根据标签类型分发，均返回 `HResult`。

#### 4.1.1 DOM 原生元素（字符串标签）

**流程**：

1. `const el = adapter.el(tag)`
2. 初始化 `pending: Owner[]`、`cleanups: CleanupFn[]`、`allNodes: HostNode[] = [el]`。
3. 调用 `setProps(el, props, propCleanups)`，将结果推入 `cleanups`。
4. 遍历 `children`，对每个 child 调用 `toHResult(child)` 得到 `childHr`：
   - 若 `childHr.owner !== null`：将其推入 `pending`（待继续冒泡或由上层挂接）。
   - 若 `childHr.owner === null`：合并 `childHr.pending` 到 `pending`，合并 `childHr.cleanups` 到 `cleanups`。
   - 将 `childHr.nodes` 中的每个节点通过 `adapter.append(el, node)` 插入当前元素，并加入 `allNodes`。
5. 返回 `{ [HRESULT_SYMBOL]: true, owner: null, nodes: allNodes, pending, cleanups }`。

**伪代码**：

```ts
function handleDomMode(tag, props, children) {
  const el = adapter.el(tag);
  const pending = [];
  const cleanups = [];
  const allNodes = [el];

  const propCleanups = [];
  setProps(el, props, propCleanups);
  cleanups.push(...propCleanups);

  for (const child of normalizeChildren(children)) {
    const hr = toHResult(child);
    if (hr.owner) {
      pending.push(hr.owner);
    } else {
      pending.push(...hr.pending);
      cleanups.push(...hr.cleanups);
    }
    for (const node of hr.nodes) {
      adapter.append(el, node);
      allNodes.push(node);
    }
  }

  return createHResult(null, allNodes, pending, cleanups);
}
```

#### 4.1.2 组件 / 指令（函数标签）

1. 若为指令，调用 `handleDirectiveMode`；否则调用 `handleComponent`，均返回 `childHr`（其 `owner` 已赋值，`pending`/`cleanups` 为空）。
2. 直接返回 `childHr`（将其向上传递，不进行任何额外处理）。

#### 4.1.3 Fragment

Fragment 直接返回 `children`，上层通过 `toHResult` 处理，无需特殊路径。

### 4.2 `handleComponent` —— 组件执行环境

**流程**：

1. `const owner = createOwner()`
2. `const ctx = createContext(owner)`
3. `const raw = component(props, ctx)`
4. `const childHr = toHResult(raw)`
5. `adoptResult(owner, childHr)` —— 吸收子内容（注册节点到 `owner.elements`，挂接 `pending` 中的 Owner，合并 `cleanups`）。
6. 返回 `createHResult(owner, childHr.nodes, [], [])` —— `owner` 非空，`pending` 和 `cleanups` 为空，表示边界。

### 4.3 `handleDirectiveMode` —— 指令执行环境

**流程**：

1. `const owner = createOwner()`
2. 创建指令上下文 `ctx`。
3. 处理 `children`，调用 `toHResult` 转为 HResult 列表 `childHrs`。
4. 对每个 `childHr`，调用 `adoptResult(owner, childHr)` 吸收，并收集返回的节点到 `allNodes`。
5. 遍历 `allNodes`，使用 **`adapter.isElement`** 判断是否为 Element。对 Element 调用指令函数 `tag(element, props, ctx)`；非 Element 跳过（开发环境警告）。
6. 返回 `createHResult(owner, allNodes, [], [])`。

### 4.4 `adoptResult` —— 内部吸收函数

由 `handleComponent`、`handleDirectiveMode`、控制流组件等调用，只处理当前层。

```ts
function adoptResult(owner: Owner, hr: HResult): HostNode[] {
  // 注册节点到 elements（用于 dispose 清理）
  for (const node of hr.nodes) {
    owner.elements.add(node);
  }
  // 挂接 pending 中的 Owner
  for (const childOwner of hr.pending) {
    if (!childOwner.disposed) {
      owner.children.push(childOwner);
      childOwner.parent = owner;
    }
  }
  // 合并清理
  owner.cleanups.push(...hr.cleanups);
  return hr.nodes;
}
```

**关键**：`adoptResult` 不递归。子 Owner 内部已通过各自组件/指令的处理完成吸收。

### 4.5 `toHResult` —— 子内容标准化

```ts
function toHResult(child: any): HResult {
  if (isHResult(child)) return child;

  if (isUse(child)) {
    const textNode = adapter.text("");
    const derived = use(child, () => adapter.setText(textNode, String(child())));
    const stop = getSignalState(derived)?.stop;
    const cleanups = stop ? [stop] : [];
    return createHResult(null, [textNode], [], cleanups);
  }

  if (isFunction(child)) {
    return toHResult(child());
  }

  if (isArray(child)) {
    const pending: Owner[] = [];
    const cleanups: CleanupFn[] = [];
    const nodes: HostNode[] = [];
    for (const item of child.flat()) {
      const hr = toHResult(item);
      nodes.push(...hr.nodes);
      if (hr.owner) pending.push(hr.owner);
      else {
        pending.push(...hr.pending);
        cleanups.push(...hr.cleanups);
      }
    }
    return createHResult(null, nodes, pending, cleanups);
  }

  if (isNil(child)) {
    return createHResult(null, [], [], []);
  }

  return createHResult(null, [adapter.text(String(child))], [], []);
}
```

### 4.6 异步组件

`handleComponent` 检测到 Promise 返回值时：

1. 创建占位注释节点 `placeholder`。
2. 先返回 `createHResult(owner, [placeholder], [], [])`（边界 HResult）。
3. Promise resolve 后：
   - 检查 `owner.disposed`，若已卸载则跳过。
   - `const resolvedHr = toHResult(result)`
   - `const newNodes = adoptResult(owner, resolvedHr)`
   - `adapter.replace(placeholder, ...newNodes)`

### 4.7 Portal 组件

Portal 作为普通组件，拥有持久 Owner。

**内部流程**：

1. `const owner = createOwner()`
2. `const childHr = toHResult(props.children)`
3. `adoptResult(owner, childHr)` —— 吸收子内容，节点进入 `owner.elements`。
4. 提取节点：`const portalNodes = childHr.nodes.splice(0)`（清空源 HResult，转移所有权）。
5. 将 `portalNodes` 移动到 `props.to` 容器。
6. 返回 `createHResult(owner, [adapter.comment("portal")], [], [])`。

卸载时 `disposeOwner(portalOwner)` 从目标容器移除节点，无需额外清理。

---

## 5. 完整数据流示例

组件结构：`<App><div><Child/></div></App>`，Child 渲染 `<span>text</span>`。

1. `h(App)` → `handleComponent(App)`：
   - 创建 `appOwner`。
   - 调用 `App()`，返回 `h("div", null, h(Child))`。
2. `h("div")`（DOM）：
   - `el = <div>`，`allNodes = [<div>]`，`pending = []`，`cleanups = []`。
   - 处理 child: `h(Child)`。
3. `h(Child)` → `handleComponent(Child)`：
   - 创建 `childOwner`。
   - 调用 `Child()`，返回 `h("span", null, "text")`。
4. `h("span")`（DOM）：
   - `el = <span>`，处理 children 中的 `"text"`：生成文本节点，`allNodes = [<span>, text]`。
   - 返回 `HResult(null, [<span>, text], [], [])`。
5. 回到 `handleComponent(Child)`：
   - `adoptResult(childOwner, spanHr)`：`<span>` 和 text 进入 `childOwner.elements`，无 pending。
   - 返回 `HResult(childOwner, [<span>, text], [], [])` —— 边界。
6. 回到 `h(Child)`：直接返回这个边界 HResult。
7. 回到 `h("div")`：
   - `childHr.owner = childOwner`，推入 `pending`。
   - 将 `<span>`、text 插入 `<div>`，加入 `allNodes`。
   - 最终 `h("div")` 返回：`HResult(null, [<div>, <span>, text], [childOwner], [])`。
8. 回到 `handleComponent(App)`：
   - `adoptResult(appOwner, divHr)`：`<div>`、`<span>`、text 进入 `appOwner.elements`；挂接 `childOwner` 到 `appOwner.children`。
   - 返回 `HResult(appOwner, [<div>, <span>, text], [], [])` —— 边界。
9. 回到顶层 `h(App)`：直接返回 App 边界 HResult。
10. `createApp` 挂载节点，调用 `triggerMount(rootOwner)`。

**最终 Owner 树**：`rootOwner` → `appOwner` → `childOwner`。

**节点所有权**：

- `<div>`、`<span>`、text 属于 `appOwner.elements`。
- `childOwner.elements` 为空（因为它只管理自己的直接 DOM 产物，而它没有直接产生 DOM，子节点已上浮给父组件）。  
  _注：此处按明确边界，<span> 和 text 是 Child 的渲染产物，但由于 Child 的 `adoptResult` 将它们加入 `childOwner.elements`，所以它们属于 `childOwner`。但在步骤8中，App 的 `adoptResult` 不再重复添加节点（因为 `hr.owner` 非空，直接挂接 owner 而非吸收节点）。因此实际上 `<span>` 和 text 只属于 `childOwner.elements`。App 的 elements 仅包含 `<div>`。_
- 上例应修正：步骤8中，`divHr` 的 `owner` 为 null，因此 App 的 `adoptResult` 会将 `[<div>, <span>, text]` 全部加入 `appOwner.elements`。但 `<span>` 和 text 同时已在 `childOwner.elements` 中，这会导致重复归属。这正是我们之前讨论的冗余问题。

为避免冗余，我们在 `handleComponent` 的边界 HResult 中，不再将子节点传递给父级吸收，而是将节点所有权保留在子组件内。解决方法：**边界 HResult 的 `nodes` 仅用于父级 DOM 插入，不再通过父级 `adoptResult` 进入父 `elements`。** 因此需引入 `bounded` 标记或修改 `adoptResult` 逻辑：当 `hr.owner` 非空时，只挂接 owner，**不吸收节点到当前 owner.elements**。

最终设计明确：

- `adoptResult` 中：
  - 若 `hr.owner !== null`：仅将 `hr.owner` 挂入 `owner.children`，**不操作 `hr.nodes`**（节点所有权归子 Owner）。
  - 若 `hr.owner === null`：将 `hr.nodes` 加入 `owner.elements`，并处理 pending 和 cleanups。
- 这保证了每个 DOM 节点只属于最近的组件 Owner。

修正后的 `adoptResult`：

```ts
function adoptResult(owner: Owner, hr: HResult): HostNode[] {
  if (hr.owner) {
    // 边界：只挂接组件 Owner，节点所有权归子 Owner
    if (!hr.owner.disposed) {
      owner.children.push(hr.owner);
      hr.owner.parent = owner;
    }
    return hr.nodes; // 节点仅用于插入，不注册
  }
  // 非边界：吸收所有资源
  for (const node of hr.nodes) {
    owner.elements.add(node);
  }
  for (const childOwner of hr.pending) {
    if (!childOwner.disposed) {
      owner.children.push(childOwner);
      childOwner.parent = owner;
    }
  }
  owner.cleanups.push(...hr.cleanups);
  return hr.nodes;
}
```

最终所有权清晰，完全消除冗余。

---

## 6. 持久 Owner 产生者总结

| 产生者    | Owner      | 说明                                     |
| --------- | ---------- | ---------------------------------------- |
| 组件      | 持久 Owner | `handleComponent` 创建，完整生命周期。   |
| 指令      | 持久 Owner | `handleDirectiveMode` 创建，管理副作用。 |
| Portal    | 持久 Owner | 管理节点搬运，卸载时自动清理。           |
| 原生元素  | 无         | 仅使用 HResult 携带节点与资源。          |
| 文本/注释 | 无         | 节点被父 HResult 收集。                  |

---

## 7. RenderAdapter 接口变更

新增：

```ts
isElement(value: unknown): value is HostNode;
```

- DOM: `value instanceof Element`
- SSR: `isObject(value) && value.type === 'element'`

用于指令过滤非 Element 节点。

---

## 8. 迁移步骤

1. **`core/types.ts`**：修改 `HResult` 为 `{ owner, nodes, pending, cleanups }`，移除 `cell`、`childResults`、`isLightweight` 等。
2. **`core/owner.ts`**：去除 `createOwner` 参数，`disposeOwner` 和 `triggerMount` 移除轻量分支。
3. **`core/h.ts`**：重写 `handleDomMode`、组件/指令分支，移除 `nestBind`。
4. **`core/component.ts`**：更新 `handleComponent`，新增 `adoptResult`，移除 `nestBind`。
5. **`core/direct.ts`**：更新 `handleDirectiveMode`，使用 `isElement`。
6. **控制流组件**：适配新 HResult 和 `adoptResult`。
7. **Portal**：改为持久 Owner 组件。
8. **适配器**：增加 `isElement`。
9. **测试**：覆盖所有场景。

---

## 9. 设计限制与注意事项

- **HResult 不可共享**：内部数组可变，多次使用会重复挂接。
- **指令不穿透控制流**：控制流锚点为注释，非 Element，指令无效。应把指令放在控制流内部。
- **`null`/`undefined` 过滤**：不产生节点。`false` 渲染为 `"false"` 文本（未改变）。
- **节点所有权清晰**：每个节点只属于一个持久 Owner 的 `elements`，无冗余。

---

## 10. 附录：设计决策记录

| 问题           | 决策                                  | 理由                       |
| -------------- | ------------------------------------- | -------------------------- |
| 轻量 Owner     | 移除，由 HResult 替代                 | 概念统一，减少分支         |
| Cell           | 不引入，HResult 自身承担临时资源包    | 避免额外概念和对象分配     |
| 节点所有权重叠 | 通过 `adoptResult` 区分边界，避免重叠 | 所有权清晰，便于调试和扩展 |
| Portal Owner   | 使用持久 Owner                        | 内聚清理逻辑               |
| 指令非 Element | `adapter.isElement` 过滤              | 语义正确，避免无效操作     |
| null/undefined | 过滤不产生节点                        | 保持旧行为                 |
| 数组扁平       | `flat()` 一层                         | 性能平衡                   |
| 共享 HResult   | 设计限制，文档标注                    | 与旧限制一致               |

---

**文档结束**，可据此进入编码实施。
