# Each 位置判断：`prevSibling` 替代方案

**状态**：设计定稿  
**版本**：3.0  
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

它通过查询 DOM 中条目的第一个节点的前驱兄弟节点，判断该条目是否已在正确位置，从而避免不必要的 `adapter.before` 移动。然而，这一方法存在以下问题：

1. **平台耦合**：`previousSibling` 是 DOM 概念，Canvas、终端、Native 等平台不存在此 API，非 DOM 适配器只能返回 `null` 硬凑。
2. **接口污染**：`prevSibling` 是 `RenderAdapter` 中唯一一个“查询 DOM 结构”的方法，其余皆为“操作”。这破坏了接口的纯粹性。
3. **查询开销**：每次 diff 更新都要调用 DOM API，虽单次开销极小，但在大列表频繁更新时可累积为可观成本。

为此，我们提出**位置缓存比较**方案，用内存中的逻辑关系替代 DOM 查询，移除 `prevSibling`。

---

## 2. `needsMove` 优化的性质：不是正确性保障

首先需要明确：`needsMove` 是一个**性能优化**，不是正确性保障。

- 如果 `needsMove` 是 `true`（需要移动）但实际已在正确位置 → 执行一次多余的 `before` 操作，视觉上无变化。
- 如果 `needsMove` 是 `false`（认为不需要移动）但实际位置不对 → 本次 diff 不移动，DOM 位置暂时偏差。但下一次 diff 会纠正（因为缓存将被更新并发现不一致）。

即使判断错误，也不会导致崩溃、数据丢失或永久错位。最坏情况是**一次多余的移动**或**临时的 DOM 位置偏差**。

这意味着：`needsMove` 的准确性不是系统的正确性要求，而是一个可降级的优化。`prevSibling` 方案提供 100% 的准确性，缓存方案提供接近 100% 的准确性（正常流程中完全同步），而两者的最坏后果相同——一次多余的 DOM 操作。

---

## 3. 核心差异：物理检查 vs 逻辑推断

这是两种方案最本质的差异。

`prevSibling` 是**测量**——直接查看 DOM 的实际状态，结果不可能错。  
缓存比较是**推断**——假设 DOM 顺序与 entry 数组顺序一致，结果在假设成立时正确。

| 场景                            | prevSibling（物理检查）                      | 缓存比较（逻辑推断）                                          |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| 无干扰的正常流程                | ✅ 正确                                      | ✅ 正确                                                       |
| `onMount` 回调中修改了 DOM 顺序 | ✅ 检测到偏差，触发移动                      | ❌ 认为没变，跳过移动（直到下次 diff 纠正）                   |
| 用户代码/第三方库直接操作 DOM   | ✅ 检测到偏差                                | ❌ 同上                                                       |
| 首次渲染                        | ✅ 所有条目均需要插入，`needsMove` 必为 true | ✅ 所有条目 `prevKey` 均为 `undefined`，`needsMove` 必为 true |

**不同步的原因**：缓存依赖于 `Each` 是 DOM 节点的唯一操作者。如果外部代码（`onMount` 回调、直接 DOM 操作、第三方库）移动了 `Each` 管理的列表节点，`Each` 不知道这些操作，因此不会更新缓存的 `prevKey`。下次 diff 时，缓存与实际 DOM 脱节。

**不同步时的影响**：

- `needsMove` 为 `false`（认为不需要移动）但实际 DOM 位置已变 → 本次跳过移动，DOM 暂时错位。
- 下一次 diff 时，缓存将被更新（因为新 `prevKey` 与实际不符，将触发移动），错位得到纠正。
- 最坏情况是**一次临时的视觉抖动**，且在下一次 diff 中自动修复。

**为什么这是可接受的**：

- `Each` 的边界内，DOM 顺序由 `Each` 全权管理，缓存与 DOM 永远同步。
- 外部代码修改 `Each` 管理的 DOM 是**越界行为**。Kiaao 的设计哲学是“不为开发者的越界行为买单”——如同 React 假设 key 对应的 DOM 节点未被外部篡改。
- 退一步说，即使外部篡改发生，后果也只是临时错位而非崩溃，且下次 diff 自动修复。

---

## 4. 替代方案：位置缓存比较

### 4.1 核心思路

`Each` 的 diff 算法在构建新顺序时，已经知道每个条目应该跟在谁后面。我们只需在每个 `Entry` 上缓存其前一个条目的标识（`prevKey`），diff 完成后比较新旧 `prevKey` 是否一致：

- 一致 → 条目位置未变，跳过 `before` 移动
- 不一致 → 条目位置已变，执行 `before` 移动

```
diff 前： entryA → entryB → entryC
         prevKey: -      prevKey: A

diff 后： entryA → entryC → entryB
         prevKey: -      prevKey: C (≠A) → 需要移动
```

该方案完全依赖 `Each` 自身维护的顺序信息，不查询 DOM。

### 4.2 数据结构变更

```ts
interface Entry {
  key: any;
  result: HResult;
  prevKey: any; // 前一个条目的 key，首次渲染时为 undefined
}
```

### 4.3 `repositionEntry` 改造

```ts
function repositionEntry(anchor: HostNode, entry: Entry, prevEntry: Entry | null): void {
  const existingNodes = [...entry.result.owner!.elements];
  if (isEmpty(existingNodes)) return;

  const needsMove = entry.prevKey !== prevEntry?.key;
  if (needsMove) {
    for (const n of [...existingNodes].reverse()) {
      getAdapter().before(anchor, n);
    }
    entry.prevKey = prevEntry?.key; // 移动后立即同步缓存
  }
}
```

- 不再需要 `prevNode` DOM 节点引用，改由 `prevEntry?.key` 提供逻辑前驱。
- 使用 `key` 而非 `Entry` 对象引用进行比较，避免因条目被销毁重建导致的对象引用失效。
- 移动成功后立即更新 `entry.prevKey`，确保缓存与 DOM 同步。

### 4.4 `buildDiffEntries` 中的集成

```ts
function buildDiffEntries(state, items, keyFn) {
  const newKeys = new Set<any>();
  const newEntries: Entry[] = [];
  let prevEntry: Entry | null = null;

  for (const [i, rawValue] of items.entries()) {
    const identity = keyFn(rawValue, i);
    newKeys.add(identity);

    const existingIdx = state.entries.findIndex((e) => e.key === identity);
    if (existingIdx !== -1) {
      // 已存在条目
      const existing = state.entries[existingIdx];
      const sig = state.itemSignalMap.get(identity);
      if (isNotNil(sig)) sig(rawValue);
      repositionEntry(state.anchor, existing, prevEntry);
      newEntries.push(existing);
    } else {
      // 新条目（含被销毁后重建的相同 key 条目）
      const result = renderEachEntry({ state, rawValue, identity, index: i, skipInsert: false });
      const entry: Entry = { key: identity, result, prevKey: prevEntry?.key };
      newEntries.push(entry);
    }
    prevEntry = newEntries[newEntries.length - 1];
  }
  return { newKeys, newEntries };
}
```

- `prevEntry` 变量取代原来的 `prevNode`，用于获取前驱条目的 key。
- 新条目（包括被销毁后重建的相同 key 条目）通过 `prevEntry?.key` 直接初始化 `prevKey`。旧对象的任何缓存引用均不存在，因为新条目是新创建的。
- 已存在条目的 `prevKey` 由 `repositionEntry` 在判断移动后更新。

### 4.5 `prevKey` 的清理时机

`prevKey` 存储的是前一条目的 `key`（标量值），而非 `Entry` 对象引用。因此：

- 当某个条目被 `disposeOwner` 删除时，其他条目中缓存的 `prevKey` 如果指向它，不会变成悬空引用——`prevKey` 是一个值，不是一个指针。
- 下次 diff 时，`prevKey` 的比较是基于值的。如果指向的条目已不存在，新数组的前驱自然不同，比较结果会触发 `needsMove = true`，执行正确的移动。
- 不需要额外的清理逻辑。

使用 `key` 值而非对象引用的设计，天然避免了悬空引用问题。

### 4.6 条目被销毁又重建（key 相同但 Entry 对象不同）

当父组件重建（如 `Show` 切换），`Each` 的所有条目被销毁。父组件重新渲染后，`Each` 重新创建所有条目。此时：

- `state.entries` 为空（因为旧的条目已被销毁）。
- `buildDiffEntries` 中 `findIndex` 找不到任何旧条目。
- 所有条目都走“新条目”路径：`renderEachEntry` 创建新 `Entry`，`prevKey` 初始化为 `prevEntry?.key`。
- 旧 Entry 对象的缓存引用不存在，因为新 Entry 是全新创建的。

这意味着：**条目销毁后重建不会产生过期的缓存引用。** 每次重建都是全新的 Entry，`prevKey` 根据新数组的相邻关系初始化。

---

## 5. Fragment 兼容性分析

### 5.1 Fragment 渲染链路

当条目渲染函数返回 Fragment 时：

```tsx
<Each value={list}>
  {(item) => (
    <>
      <span>A</span>
      <span>B</span>
    </>
  )}
</Each>
```

JSX 编译后变为 `h(Fragment, null, h("span", ...), h("span", ...))`。`Fragment` 作为组件被 `handleComponent` 执行，其内部直接返回 `children` 数组。该数组被 `toHResult` 的数组合并逻辑处理，最终生成一个 `HResult`，`nodes` 为 `[spanA, spanB]`，`owner` 为 Fragment 的 Owner。

在 `Each` 中，`adoptBranch` 拿到这个 HResult，通过 `adoptResult` 将 Fragment 的 Owner 挂接到 `Each` 的 Owner 下。此时，**该条目的 `owner.elements` 包含 `spanA` 和 `spanB`**（因为 `adoptResult` 将 HResult 的所有 nodes 都注册进了 owner.elements）。Set 保持插入顺序，因此 `elements` 遍历顺序与 DOM 顺序一致。

### 5.2 对位置缓存的影响

位置缓存比较的是**条目之间的相对顺序**，不关心条目内部结构。条目的 `prevKey` 缓存的是前一条目的身份标识，而非前一个 DOM 节点。

移动操作通过 `entry.result.owner.elements` 获取该条目的所有 DOM 节点，`[...existingNodes].reverse()` 后逐个 `before(anchor, ...)` 保持内部顺序。**缓存方案只决定“要不要移”，不改变“怎么移”——这两个逻辑完全独立。**

因此，无论条目内部是单个节点、多个节点还是 Fragment，缓存方案的判断逻辑完全不受影响。

---

## 6. SSR 中的行为

SSR 序列化按数组顺序输出节点，节点天然在正确位置，不需要任何 `needsMove` 检查。

- 当前 SSR 适配器的 `prevSibling` 返回 `null`，`needsMove` 判断为 `true`，所有条目均执行 `before`。但 SSR 适配器的 `before` 是空操作，所以“移动”不会出错，只是浪费了一次内存判断。
- 缓存方案在 SSR 下：所有条目的 `prevKey` 初始化为 `prevEntry?.key`（新条目），首次渲染后 `prevKey` 与相邻关系一致。若 SSR 不做 diff（因为不需要），则缓存不被使用。若 SSR 需要 diff（未来场景），缓存比较工作正常——节点顺序天然正确，`needsMove` 为 `false`，不触发操作。
- 与 DOM 平台相比：SSR 适配器的 `before` 为空操作，即使 `needsMove` 错误触发也无后果。因此缓存方案对 SSR 至少与当前方案等价，且更干净（不依赖一个意义不明的 `null` 返回值）。

---

## 7. 影响范围与收益

### 7.1 需修改的文件

| 文件                | 变更                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `core/each.ts`      | `Entry` 接口增加 `prevKey`；`repositionEntry` 改用位置缓存；`buildDiffEntries` 使用 `prevEntry`；删除 `prevNode` 相关逻辑 |
| `core/types.ts`     | `RenderAdapter` 接口移除 `prevSibling` 方法                                                                               |
| `dom/adapter.ts`    | 移除 `prevSibling` 实现                                                                                                   |
| `server/adapter.ts` | 移除 `prevSibling` 实现                                                                                                   |

### 7.2 收益

- **跨平台一致性**：所有平台统一使用内存比较，行为一致。SSR 适配器不再需要返回 `null` 硬凑。
- **接口纯粹性**：`RenderAdapter` 仅保留操作方法，不再包含查询方法，降低适配者学习成本。
- **性能提升**：用纯 JS 引用比较替代 DOM API 调用，尤其在大型列表 diff 时累积收益明显。
- **可测试性**：位置判断逻辑不依赖 DOM，单元测试更容易编写。

---

## 8. 总结

位置缓存方案用纯内存的、基于逻辑关系的位置判断，替代了平台特定的 DOM 查询。两者的核心差异在于“物理检查”与“逻辑推断”——前者 100% 反映 DOM 状态，后者假设 DOM 与逻辑一致。这一假设在 `Each` 独占其所管理 DOM 节点的前提下成立。外部篡改可能导致缓存脱节，但后果仅为临时 DOM 错位（下次 diff 自动修复），非崩溃性错误。这一权衡与框架“不为越界行为兜底”的设计哲学一致。

该方案消除了 `RenderAdapter` 接口中的平台耦合，为 Kiaao 向非 DOM 平台的扩展铺平了道路，且在不改变“怎么移”的前提下保留了“要不要移”的性能优化。
