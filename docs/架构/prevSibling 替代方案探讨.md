# Each 位置判断：`prevSibling` 替代方案探讨

## 背景

`prevSibling` 是 `RenderAdapter` 接口中的一个方法，当前唯一用途在 `core/each.ts` 的 `repositionEntry` 中：

```ts
function repositionEntry(anchor: HostNode, entry: Entry, prevNode: any): any {
  const existingNodes = [...entry.result.owner!.elements];
  if (isEmpty(existingNodes)) return prevNode;
  const [firstExisting] = existingNodes;
  const needsMove = isNotNil(prevNode) && getAdapter().prevSibling(firstExisting) !== prevNode;
  if (needsMove) {
    for (const n of [...existingNodes].reverse()) {
      getAdapter().before(anchor, n);
    }
  }
  return existingNodes[existingNodes.length - 1];
}
```

作用是判断 entry 的 DOM 节点是否已经在正确位置，避免不必要的 `adapter.before` 移动。

## 现有方案的问题

1. **平台耦合**：`previousSibling` 是 DOM 概念，canvas/terminal/native 等平台不存在此 API，跨端时需要每个平台各自实现（或像 SSR 那样返回 `null` 硬凑）
2. **查询开销**：每次 diff 更新都要调用 DOM API 查询前驱兄弟节点，虽然开销小，但纯内存比较更快

## 替代方案

### 方案 A：位置缓存比较

#### 核心思路

Diff 算法在计算新顺序时，已经知道每个 entry 的前一个 entry 是谁。不需要问 DOM，而是问自己维护的位置关系：

```
diff 前： entryA → entryB → entryC
diff 后： entryA → entryC → entryB
          ^^^^^    ^^^^^
          prev 没变  prev 变了 → 需要移动
```

#### 实现要点

- 每个 entry 缓存其前一个 entry 的 ID 或引用
- Diff 完成新顺序后，比较新老 `prevEntry` 是否一致
- 如果一致 → 节点已经在正确位置，跳过移动
- 如果不一致 → 需要执行 `before` 移动

#### 方案 A 的正确性缺陷（关键发现）

当某个 entry 被移动后，它后面所有 entry 的 DOM 物理位置都会改变。即使它们的逻辑前驱没变，DOM 里的实际位置也已经错了。

**示例**：`[A, B, C, D]` → `[A, D, B, C]`

| 步骤 | Entry | 旧 prev | 新 prev | 变化？  | 缓存方案动作 |
| ---- | ----- | ------- | ------- | ------- | ------------ |
| 1    | A     | null    | null    | ❌ 不变 | 跳过         |
| 2    | D     | (新)    | —       | —       | 插入到尾     |
| 3    | B     | A       | D       | ✅ 变了 | 移动 B       |
| 4    | C     | **B**   | **B**   | ❌ 不变 | **跳过 ✗**   |

步骤 3 移动 B 后，DOM 变成 `[A, C, D, B, anchor]`。C 被夹在 A 和 D 之间，但缓存认为 C 的前驱没变（还是 B），跳过移动。
最终 DOM 是 `[A, C, D, B, anchor]`，正确顺序是 `[A, D, B, C, anchor]`。**错位**。

`prevSibling` 没有此问题：步骤 4 检测到 C 的首节点的 `previousSibling`（A 的末节点）不等于 `prevNode`（B 的末节点）→ 触发移动，结果正确。

#### 结论：`prevSibling` 无法被缓存比较直接替代

`prevSibling` 检查的是**物理 DOM 状态**，缓存比较检查的是**逻辑 entry 关系**。

- 逻辑关系变化 → DOM 一定需要调整
- 但**逻辑关系不变，不代表 DOM 不需要调整**（如上例的 C）

任何试图替代 `prevSibling` 的方案，都必须能感知到"前置的某个 entry 被移动过"这一间接影响。

### 方案 B：逆向迭代

从后往前处理新顺序，试图避免前置移动对后续条目的影响。但仍会失败：

```
新顺序 [A, D, B, C]，逆向 [C, B, D, A]
```

| 步骤 | Entry | 动作                          | 处理后 DOM                          |
| ---- | ----- | ----------------------------- | ----------------------------------- |
| 1    | C     | 跳过（prev 没变，还没人动过） | `[A, B, C, D, anchor]`              |
| 2    | B     | 移动（prev A→D）              | `[A, C, D, B, anchor]` ← C 被落下了 |
| 3    | D     | 插入                          | `[A, C, D, B, anchor]`              |
| 4    | A     | 跳过                          | `[A, C, D, B, anchor]` ✗            |

结论：**逆向迭代不能修复**。只要一个 entry 被移动，所有它（在 DOM 中）后面的 entry 的物理位置都会受影响，无论迭代方向。

### 方案 C：脏标记传播

每个 entry 移动时，标记一个"脏"标志，后面所有 entry 都强制移动。正确但退化为"每次都移动"，等于放弃了优化。

### 方案 D：保留 `prevSibling` 作为 adapter 方法

这才是真正的跨端方案——不替换 `prevSibling`，而是**让每个平台适配器提供自己的实现**：

| 平台     | `prevSibling` 实现     | 语义                   |
| -------- | ---------------------- | ---------------------- |
| DOM      | `node.previousSibling` | 实际 DOM 顺序          |
| SSR      | `() => null`           | 不需要，序列化顺序固定 |
| Canvas   | 按 z-order / 绘制顺序  | 平台自有坐标系统       |
| Terminal | 按单元格索引           | 栅格坐标               |
| Native   | 按视图层级             | 平台原生               |

`prevSibling` 的开销（一次 DOM API 调用）在性能敏感场景下微乎其微。保留它可以**零成本获取最准确的 DOM 状态**，避免引入复杂的逻辑推断。

## 对比

|                  | `prevSibling`（保留）    | 位置缓存比较（方案 A） |
| ---------------- | ------------------------ | ---------------------- |
| 平台依赖         | 各 adapter 实现          | 无，纯内存             |
| 速度             | DOM API 调用             | 纯 JS 引用比较         |
| 跨端             | ✅ 各平台实现自己的      | ✅ 零额外工作          |
| 正确性           | ✅ 始终反映 DOM 实际状态 | ❌ 有已知的正确性缺陷  |
| 复杂度           | 简单                     | 需处理间接影响问题     |
| Fragment         | ✅ 正常工作              | 需额外验证             |
| onMount/DOM 修改 | ✅ 自动感知              | ❌ 缓存过期            |

## 潜在风险与边界情况

### 1. `prevSibling` 是纯优化，不是正确性保障

`needsMove` 判断错了（应该移动但没移），最多导致一次不必要的 DOM 错位——下次 diff 时会纠正。不会崩溃。所以即使方案有缺陷，影响范围有限。

### 2. entry 删除重建（相同 key）

`buildDiffEntries` 通过 `findIndex` 查找已有 entry。如果没找到（被外部重建），走新 entry 路径——没有缓存引用，直接插入。行为正确，不受影响。

### 3. onMount / 用户代码修改 DOM

如果 `onMount` 或用户代码直接操作 DOM 改变了节点顺序，`prevSibling` 能感知并触发移动。缓存方案不会感知，会错误地跳过移动。

### 4. `prevEntry` 缓存的清理

entry 被 `disposeOwner` 删除时，其他 entry 中的 `prevEntry` 引用变成 dangling。需约定清理策略。

### 5. Fragment 条目

`owner.elements` 包含所有 Fragment 节点，Set 保持插入顺序。`prevSibling` 操作的是 DOM 实际顺序，不受 Fragment 多节点影响。方案 A 需要额外验证。

### 6. `anchor` / `before` 同样是平台相关

`prevSibling` 的平台耦合不是孤立问题——`anchor`（comment 节点）、`adapter.before` 同样依赖平台实现。跨端改造应统一考虑，不能只替换 `prevSibling`。

## 当前状态

- 问题发现于 kiaao 跨端架构准备过程中的 API 审查
- `prevSibling` 当前仅一处使用（`each.ts`），影响范围有限
- 方案 A（缓存比较）有正确性缺陷，不建议采用
- 推荐方案 D（保留 `prevSibling` 作为 adapter 方法，各平台自行实现）
- 留作后续决策
