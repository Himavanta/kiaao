# 控制流组件初始内容节点在 Owner 链中的累积问题

**日期**：2026-06-27
**状态**：讨论中，待决策

---

## 问题描述

Show/Case/Each 在**初始渲染**返回 `[...initialContent, anchor]` 后，经过 `handleComponent` 的 `mergeResults` + `elements.add` 流程，内容节点与锚点一起被加入各级父 Owner 的 `elements` 集合。

### 链路追踪

```
h(Primary)
  → primaryOwner.elements = [div]                          ← ③

h(Show, ...)
  → Show 返回 [div, anchor]
  → mergeResults([div, anchor], showOwner)
    → showOwner.elements = {div, anchor}                    ← ②
  → return createHResult(showOwner, [div, anchor])

h(Panel, ...)
  → Panel 返回 showResult
  → mergeResults(showResult, panelOwner)
    → showResult.nodes = [div, anchor]
    → panelOwner.elements = {div, anchor}                   ← ①
```

同一个 `div` 节点同时被 `primaryOwner`、`showOwner`、`panelOwner` 三个 Owner 的 `elements` 引用。

### 信号切换时的积累

每次 Show 切换分支时：

```
cleanOwnerElements(showOwner)
  → 从 showOwner.elements 清除旧 div（只留 anchor）          ✅

disposeOwner(primaryOwner)
  → 从 DOM 移除旧 div，清除 primaryOwner.elements            ✅

adoptBranch → 新 div 插入锚点前
  → showOwner.elements = {anchor}                            ✅
  → panelOwner.elements = {oldDiv, newDiv, anchor}           ❌ 积累！
```

第 N 次切换后：`panelOwner.elements = {divA, divB, ..., divN, anchor}`

### 是否严重？

| 方面       | 评估                                          |
| ---------- | --------------------------------------------- |
| 内存泄漏   | **否**——`disposeOwner(panelOwner)` 时全部清除 |
| 功能正确性 | **是**——无影响，旧节点已从 DOM 移除           |
| 销毁性能   | 低——每次 dispose 多几次 `removeNode` 空操作   |
| 调试干扰   | 中——展开 Owner 树看到一堆过期节点             |

---

## 根因

Show 在初始渲染时锚点**不在 DOM 中**，导致 `adapter.before(anchor, node)` 空操作。内容节点必须通过返回值 `[...content, anchor]` 经由 `mergeResults` 送入父级 DOM。

`mergeResults` +
`handleComponent` 的 `nodes.forEach(n => owner.elements.add(n))` 对所有返回节点一视同仁——内容节点被错误地纳入了 `showOwner.elements`，进而传播到上层 Owner。

根本限制是 `adapter.before(anchor, node)` 在锚点无父节点时无法工作。

---

## 讨论过程

### 方案 A：当前实现（anchor 在最后）

`return [...initialContent, anchor]`

- ✅ 功能正确
- ❌ 内容节点沉积在各级父 Owner 的 `elements` 中

### 方案 A'：anchor 在最前

`return [anchor, ...initialContent]`

- ❌ `mergeResults` 对所有节点一视同仁，顺序不影响 `elements.add` 行为
- 不解决问题

### 方案 B：组件只返回 `[anchor]`，由派生初始计算渲染内容

- ❌ 派生初始计算在 `use()` 内部同步执行，此时锚点仍未在 DOM 中
- `before()` 仍然空操作
- ❌ 静态值（非信号）无派生，内容永远不渲染

### 方案 C：`Context.onElementsProcessed` 后处理钩子

```ts
context.onElementsProcessed = (owner) => cleanOwnerElements(owner, anchor);
```

在 `handleComponent` 的 `mergeResults` + `elements.add` 之后、`createHResult` 之前调用。

- ❌ `cleanOwnerElements` 只清理 `showOwner.elements`。父级的 `mergeResults` 读取的是 `result.nodes`（仍包含内容节点），不是 `owner.elements`。内容仍然会传播到上层。

### 方案 D：`ephemeralNodes` 字段（推荐）

给 HResult 增加一个 `ephemeralNodes?: HostNode[]` 字段——这些节点参与 `result.nodes` 供父级 DOM 定位，但不加入 `owner.elements`。

```ts
interface HResult {
  [HRESULT_SYMBOL]: true;
  owner: Owner | null;
  nodes: HostNode[]; // 常规节点→加入 Owner.elements
  cleanups?: CleanupFn[];
  ephemeralNodes?: HostNode[]; // 临时节点→不加入 Owner.elements，仍出现在 result.nodes
}
```

#### createHResult 改动

```ts
export function createHResult(
  owner: Owner | null,
  nodes: HostNode[],
  cleanups?: CleanupFn[],
  ephemeralNodes?: HostNode[],
): HResult {
  const result: HResult = {
    [HRESULT_SYMBOL]: true as const,
    owner,
    nodes,
  };
  if (isNotNil(cleanups) && isNotEmpty(cleanups)) {
    result.cleanups = cleanups;
  }
  if (isNotNil(ephemeralNodes) && isNotEmpty(ephemeralNodes)) {
    result.ephemeralNodes = ephemeralNodes;
    // 将临时节点追加到 nodes 供父级 DOM 使用
    result.nodes = [...nodes, ...ephemeralNodes];
  }
  return result;
}
```

#### handleComponent 改动

```ts
const nodes = mergeResults(result, owner);
// 只将常规节点加入 Owner.elements，跳过 ephemeralNodes
nodes.forEach((n) => owner.elements.add(n));
// ephemeralNodes 已在 result.nodes 中，但不在此处加入 elements

return createHResult(owner, nodes);
```

不对——`handleComponent` 本身不创建 `ephemeralNodes`。`ephemeralNodes` 是由 Show 在返回值中指定的。`handleComponent` 需要检测 `result.ephemeralNodes` 并处理。

实际上流程应该是：

```ts
// handleComponent 中
const normalNodes = mergeResults(result, owner);
normalNodes.forEach((n) => owner.elements.add(n));

// 合并临时节点到最终 nodes 中
const allNodes = [...normalNodes, ...(result.ephemeralNodes || [])];
return createHResult(owner, allNodes);
```

Show 内部：

```ts
// 将初始内容作为 ephemeralNodes 返回
const result = createHResult(context.owner, [anchor], undefined, initialContent);
return result;
```

最终效果：

```
Show return createHResult(showOwner, [anchor], undefined, [div])
  → result.nodes = [anchor, div]                                     ← 给父级用
  → handleComponent:
      mergeResults([anchor], showOwner)                               ← 只处理常规 nodes
        → showOwner.elements = {anchor}                              ✅
      + ephemeralNodes = [div]                                        ← 拼入 finalNodes
      → createHResult(showOwner, [anchor, div])

  → parent.mergeResults(showResult, panelOwner)
    → showResult.nodes = [anchor, div]
    → panelOwner.elements = {anchor, div}                             ← ❌ 仍然有 div！

```

等等——问题还是没有解决！父级 `mergeResults` 读的是 `result.nodes`，而 `result.nodes` **包含**临时节点（因为 `createHResult` 把它们合并了）。所以 `panelOwner.elements` 仍然会积累 `div`。

---

### 问题本质

内容节点的传播路径是 `result.nodes` → 父级 `mergeResults` → `panelOwner.elements.add`，不是通过 `showOwner.elements`。只要内容节点在 `result.nodes` 里，**任何清理 `showOwner.elements` 的方案都无法阻止它往上冒**。

要让内容节点不进入 `panelOwner.elements`，它必须不在 `result.nodes` 中。

但是——如果内容节点不在 `result.nodes` 中，父级就无法将它插入 DOM。回到了最初的问题。

**这是一个根本性矛盾：既要父级帮我们插 DOM，又不让父级知道这个节点。**

---

## 结论

**当前架构下无法完全消除初始内容节点在父级 Owner.elements 中的引用**，原因：

1. 初始渲染时锚点无 DOM 父节点 → `before()` 空操作 → 内容必须通过返回值传递
2. `result.nodes` 是内容节点进入父级 DOM 的唯一通道
3. `mergeResults` 读取 `result.nodes` → 内容节点必然进入父级 `elements`

这是初始化时序限制与所有权模型之间的固有张力。React 有同样的模式——`useEffect` 中的 DOM 操作发生在首次 commit 之后，因为内容必须先出现在 vDOM 树中才能被操作。

**对于 kiaao，如果锚点能在组件函数执行时就在 DOM 中，这个问题就不存在。** 解决这个问题的正确方式是让锚点通过 `h()` 在更早的时机进入 DOM——例如在 `handleDomMode` 中预处理，或通过类似 `onMount` 的两阶段渲染。

---

## 待处理决策

- [x] ~~是否接受当前行为~~ **已采用 onMount 方案解决**
- [ ] 是否需要补充开发指南

---

## 实现状态

**2026-06-27：已按此方案实现**

变更：

- `show.ts`、`case.ts`、`each.ts`：初始渲染移至 `context.onMount()`，组件只返回 `[anchor]`
- `flow-shared.ts`：移除 `cleanOwnerElements`（不再需要）
- 测试：新增 `mount()` 辅助函数，内联 `triggerMount` 调用

效果：

- `showOwner.elements` 只含 `{anchor}` ✅
- 内容节点仅在 `primaryOwner.elements` ✅
- 内容节点不进入任何父级 Owner 的 `elements` ✅
- 各项测试 14/14 通过，原 13 个预存失败未受影响 ✅
