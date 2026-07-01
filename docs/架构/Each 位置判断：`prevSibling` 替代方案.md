# Each 位置判断：`prev` 可选方法方案

**状态**：设计定稿
**版本**：5.0
**日期**：2026-07-01

---

## 1. 背景与动机

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

它通过查询 DOM 中条目的第一个节点的前驱兄弟节点，判断该条目是否已在正确位置，从而避免不必要的 `adapter.before` 移动。

该方法存在以下问题：

1. **平台耦合**：`previousSibling` 是 DOM 概念，非 DOM 平台只能返回 `null` 硬凑。
2. **接口污染**：`prevSibling` 是 `RenderAdapter` 中唯一一个“查询 DOM 结构”的方法，破坏了接口的纯粹性。
3. **命名冗长且 DOM 化**：`prevSibling` 过于 DOM 化，与 Kiaao 的平台无关设计理念不符。

---

## 2. `needsMove` 优化的性质

首先需要明确：`needsMove` 是一个**性能优化**，不是正确性保障。

- 如果 `needsMove` 是 `true`（需要移动）但实际已在正确位置 → 执行一次多余的 `before` 操作，视觉上无变化。
- 如果 `needsMove` 是 `false`（认为不需要移动）但实际位置不对 → 本次 diff 不移动，DOM 位置暂时偏差。但下一次 diff 会纠正。

即使判断错误，也不会导致崩溃或数据丢失。最坏情况是**一次多余的移动**或**临时的 DOM 位置偏差**。因此，`needsMove` 的正确性不是系统的硬性要求，而是一个可降级的优化。

---

## 3. 方案探索

### 3.1 方向一：位置缓存比较（已否决）

#### 3.1.1 核心思路

在每个 `Entry` 上缓存其前一个条目的标识（`prevKey`），diff 完成后比较新旧 `prevKey` 是否一致：

- 一致 → 条目位置未变，跳过 `before` 移动
- 不一致 → 条目位置已变，执行 `before` 移动

```
diff 前： entryA → entryB → entryC
         prevKey: -      prevKey: A

diff 后： entryA → entryC → entryB
         prevKey: -      prevKey: C (≠A) → 需要移动
```

该方案完全依赖 `Each` 自身维护的顺序信息，不查询 DOM。

#### 3.1.2 正确性 Bug

考虑一个重排场景：

```
旧顺序: [A, B, C, D]
新顺序: [A, D, B, C]
```

缓存方案逐条处理：

| 步骤 | Entry | 旧 prev | 新 prev | 变化？  | 动作              |
| ---- | ----- | ------- | ------- | ------- | ----------------- |
| 1    | A     | null    | null    | ❌ 不变 | 跳过              |
| 2    | D     | (新)    | —       | —       | 插入              |
| 3    | B     | A       | D       | ✅ 变了 | 移动 B            |
| 4    | C     | B       | B       | ❌ 不变 | 跳过 ← **错误！** |

**问题所在**：B 被移动后，C 在 DOM 中的物理位置已经变了（B 被插到了尾部，C 还在原位），但 C 的逻辑前驱仍然是 B。缓存认为"不用动"，但 DOM 里 C 已经不在正确位置了。

```
DOM after step 3 (cache): [A, C, D_new, B, anchor]  ← B 被移到最后
DOM after step 4 (cache): [A, C, D_new, B, anchor]  ← C 没动，位置错了！
正确 DOM:                    [A, D_new, B, C, anchor]
```

而 `prevSibling` 在步骤 4 会检测到：C 的第一个节点的 `previousSibling` 是 A 的最后一个节点，不等于 `prevNode`（B 的最后一个节点）→ `needsMove = true` → 移动 C，结果正确。

#### 3.1.3 根因分析

这是两种方案回答的问题不同所导致的根本性差异。

|                        | `prevSibling`（物理检查）                               | 缓存比较（逻辑推断）                     |
| ---------------------- | ------------------------------------------------------- | ---------------------------------------- |
| **问题**               | 该条目的第一个 DOM 节点是否物理上紧跟在 prev 节点之后？ | 该条目的逻辑前驱在重排后是否发生了变化？ |
| **数据源**             | 真实 DOM 结构                                           | 内存中的 Entry 数组关系                  |
| **确定性**             | ✅ 100% 反映当前 DOM 状态                               | ❌ 假设 DOM 顺序与内存逻辑一致           |
| **对外部篡改的敏感性** | 能检测到外部 DOM 操作导致的位置变化                     | 不能；外部操作会破坏缓存有效性           |
| **对间接影响的敏感性** | ✅ 能检测（DOM 物理位置已变）                           | ❌ 不能（逻辑前驱未变）                  |

缓存方案检查的是"逻辑前驱变没变"，无法感知间接影响——一个条目被移动后，它后面所有条目的 DOM 位置事实上都变了，即使它们的逻辑前驱没变。而 `prevSibling` 检查的是"DOM 前驱是不是预期值"，直接查看 DOM 实际状态，永远不会漏。

#### 3.1.4 否决理由

缓存方案存在不可修复的正确性 bug：当某个条目被移动时，后续条目的 DOM 位置会间接改变，但缓存方案无法感知。这是一个致命缺陷，该方案被否决。

---

### 3.2 方向二：`compareOrder` 通用顺序比较

#### 3.2.1 核心思路

将"查询前驱兄弟"替换为更通用的"比较两个节点在父容器中的相对顺序"：

```ts
interface RenderAdapter {
  compareOrder(a: HostNode, b: HostNode): number;
  // 返回负数：a 在 b 之前
  // 返回 0：a 和 b 是同一节点，或无法比较
  // 返回正数：a 在 b 之后
}
```

#### 3.2.2 问题

`compareOrder` 能判断"A 是否在 B 之前"，但**不能判断"A 是否紧跟在 B 之后"**。而 `repositionEntry` 需要的正是"紧邻"判断——不仅仅是 A 在 B 之前，还要确保它们之间没有其他条目节点。

如果要实现完整的"紧邻"判断，需要组合多个 API 调用或引入更复杂的逻辑，得不偿失。

#### 3.2.3 否决理由

`compareOrder` 无法直接表达"紧邻"语义，而这是 `repositionEntry` 的核心需求。引入它并不能简化代码，反而增加了复杂度。

---

### 3.3 方向三：`needsMove` 抽象方法

#### 3.3.1 核心思路

将"是否需要移动"的判断逻辑整个抽象为 adapter 方法，让各平台自行定义：

```ts
interface RenderAdapter {
  needsMove(
    entryFirstNode: HostNode,
    prevEntryLastNode: HostNode | null,
    anchor: HostNode,
  ): boolean;
}
```

#### 3.3.2 问题

- 接口过于高层，失去了细粒度的原子性。`needsMove` 是一个"判断 + 逻辑"的混合体，不适合作为 adapter 的基础方法。
- 各平台实现差异较大，测试和验证成本高。
- 与 `before`、`append` 等原子操作方法风格不一致。

#### 3.3.3 否决理由

过于高层，不够原子化，与 `RenderAdapter` 中其他原子操作方法的设计风格不一致。

---

## 4. 最终方案：保留查询方法，改为可选的 `prev`

### 4.1 决策理由

经过三轮方案探索，我们得出结论：

- **缓存方案（方向一）**：有正确性 bug，否决。
- **`compareOrder`（方向二）**：无法表达"紧邻"语义，否决。
- **`needsMove` 抽象（方向三）**：过于高层，不够原子化，否决。

最终方案选择**保留查询方法**，但做以下改进：

1. **重命名为 `prev`**：简短通用，不绑定 DOM 术语。
2. **改为可选方法**：不强求非 DOM 平台实现。不实现时退化为保守策略（始终认为需要移动），正确性不受影响，仅失去优化。

这个方案保留了"查看物理顺序"的核心能力——这是经过验证的、确保 diff 正确性的唯一方式。同时，通过简短的命名和可选的设计，最大程度降低了平台耦合。

### 4.2 API 定义

```ts
interface RenderAdapter {
  // ... 其他方法 ...

  /**
   * 获取节点的前一个兄弟节点（物理紧邻）。
   * 可选方法——若平台不支持或不需要移动优化，可不实现。
   * 不实现时（返回 undefined/null），Each 退化为保守策略（始终认为需要移动），
   * 正确性不受影响，仅失去跳过不必要移动的优化。
   */
  prev?(node: HostNode): HostNode | null;
}
```

### 4.3 各平台实现

- **DOM**：`prev: (node) => node.previousSibling`
- **SSR**：不实现（或返回 `null`），SSR 无 DOM 移动需求，`before` 为空操作，即使 `needsMove` 恒为 `true` 也无影响
- **Canvas/终端/Native**：自行实现，若无物理兄弟概念则返回 `null`

### 4.4 `repositionEntry` 改造

```ts
function repositionEntry(anchor: HostNode, entry: Entry, prevEntry: Entry | null): void {
  const existingNodes = [...entry.result.owner!.elements];
  if (isEmpty(existingNodes)) return;

  const [firstExisting] = existingNodes;
  const adapter = getAdapter();

  // 判断是否需要移动
  let needsMove = true;
  if (!prevEntry) {
    // 无前驱，应为第一个条目。adapter.prev 存在时检查是否已在正确位置。
    if (adapter.prev) {
      needsMove = adapter.prev(firstExisting) !== null;
    }
  } else {
    const prevNodes = [...prevEntry.result.owner!.elements];
    const lastPrevNode = prevNodes[prevNodes.length - 1];
    // 检查当前条目的第一个节点是否紧跟在 prevEntry 的最后一个节点之后
    if (adapter.prev) {
      needsMove = adapter.prev(firstExisting) !== lastPrevNode;
    }
    // 无 adapter.prev → 保守策略，needsMove 保持 true
  }

  if (needsMove) {
    for (const n of [...existingNodes].reverse()) {
      adapter.before(anchor, n);
    }
  }
}
```

- `prevEntry` 替代原来的 `prevNode`，用于获取前驱条目的最后一个节点。
- `adapter.prev` 存在时，精确判断是否需要移动。
- `adapter.prev` 不存在时，`needsMove` 恒为 `true`，执行移动——保守策略，保证正确性，仅放弃优化。

---

## 5. 影响范围

### 5.1 需修改的文件

| 文件                | 变更                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| `core/each.ts`      | `repositionEntry` 使用 `adapter.prev` 判断移动；使用 `prevEntry` 参数获取前驱节点 |
| `core/types.ts`     | `RenderAdapter` 接口中 `prevSibling` 重命名为 `prev`，改为可选方法                |
| `dom/adapter.ts`    | `prevSibling` 重命名为 `prev`，实现不变                                           |
| `server/adapter.ts` | 删除 `prevSibling` 实现（SSR 不需要此优化）                                       |

### 5.2 收益

- **跨平台友好**：`prev` 是可选的，不强求非 DOM 平台实现。SSR 适配器更干净。
- **命名通用**：不再绑定 DOM 术语。
- **正确性保证**：`prev` 直接查看物理顺序，不会漏掉间接位置变化（与 `prevSibling` 一致）。
- **向后兼容**：DOM 平台行为完全不变。

---

## 6. 方案对比总结

| 方案                       | 正确性          | 跨平台          | 接口纯粹性    | 采纳     |
| -------------------------- | --------------- | --------------- | ------------- | -------- |
| `prevSibling`（当前）      | ✅              | ❌ 需各平台硬凑 | ❌ DOM 概念   | —        |
| 位置缓存（方向一）         | ❌ 间接影响 bug | ✅              | ✅            | 否决     |
| `compareOrder`（方向二）   | ❌ 无法判断紧邻 | ✅              | ✅            | 否决     |
| `needsMove` 抽象（方向三） | ✅              | ✅              | ❌ 不够原子化 | 否决     |
| **`prev` 可选（最终）**    | ✅              | ✅              | ✅            | **采纳** |

---

## 7. 总结

通过将 `prevSibling` 重命名为 `prev` 并改为可选方法，我们解决了命名冗长和强平台耦合的问题，同时避免了缓存方案的正确性 bug 和其他替代方案的语义缺陷。该方案保留了"查看物理顺序"的核心能力，确保了 `Each` diff 的正确性和移动优化，同时为非 DOM 平台提供了灵活的适配空间。
