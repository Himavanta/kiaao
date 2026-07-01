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

## 问题

1. **平台耦合**：`previousSibling` 是 DOM 概念，canvas/terminal/native 等平台不存在此 API，跨端时需要每个平台各自实现（或像 SSR 那样返回 `null` 硬凑）
2. **查询开销**：每次 diff 更新都要调用 DOM API 查询前驱兄弟节点，虽然开销小，但纯内存比较更快

## 替代方案：位置缓存比较

### 核心思路

Diff 算法在计算新顺序时，已经知道每个 entry 的前一个 entry 是谁。不需要问 DOM，而是问自己维护的位置关系：

```
diff 前： entryA → entryB → entryC
diff 后： entryA → entryC → entryB
          ^^^^^    ^^^^^
          prev 没变  prev 变了 → 需要移动
```

### 实现要点

- 每个 entry 缓存其前一个 entry 的 ID 或引用
- Diff 完成新顺序后，比较新老 `prevEntry` 是否一致
- 如果一致 → 节点已经在正确位置，跳过移动
- 如果不一致 → 需要执行 `before` 移动

### 对比

|            | `prevSibling`（当前） | 位置缓存比较（提议）                     |
| ---------- | --------------------- | ---------------------------------------- |
| 平台依赖   | DOM `previousSibling` | 无，纯内存                               |
| 速度       | DOM API 调用          | 纯 JS 引用比较                           |
| 跨端       | ❌ 需各平台实现       | ✅ 零额外工作                            |
| 实现复杂度 | 简单                  | 稍增 bookkeeping（entry 结构多一个字段） |
| 正确性     | 取决于 DOM 顺序       | 取决于 entry 顺序与 DOM 顺序的同步       |

### 潜在风险

- entry 的 DOM 顺序与 entry 数组顺序可能不一致的边界情况需要验证
- 首次渲染时 `prevEntry` 为空，相当于 `needsMove = true`（触发插入），语义正确

## 当前状态

- 问题发现于 kiaao 跨端架构准备过程中的 API 审查
- `prevSibling` 当前仅一处使用（`each.ts`），影响范围有限
- 替代方案已经讨论但未编码，留作后续决策
