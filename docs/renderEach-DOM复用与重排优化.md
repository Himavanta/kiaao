# renderEach 的 DOM 复用与重排优化

## 背景

`renderEach` 是 kiaao 中管理列表渲染的核心函数，负责根据数据源的变化创建、复用和清理 DOM 节点。它支持 key 增量更新（方向 A），即同 key 的节点不被销毁重建，而是直接复用并移动到正确位置。

但在实际使用中，出现了明显的视觉效果问题——列表更新时所有 `<a>` 元素闪烁。

## 问题描述

在 `packages/example/src/components/layout/nav.tsx` 中，用户通过 `pop`、`push`、`insert` 按钮操作列表时，浏览器中所有列表项都会闪烁。这种闪烁不是节点销毁重建导致的（DOM 节点确实被复用了），而是由大量不必要的 `insertBefore` 调用触发的浏览器重排（reflow）。

## 原因分析

### 原始的插入逻辑

```typescript
if (nodeMap.has(identity)) {
  const node = nodeMap.get(identity)!;
  container.insertBefore(node, anchor); // 每次都移动
}
```

`insertBefore` 的语义是「将节点从当前位置移除，插入到目标位置之前」。即使节点已经位于 `anchor` 之前（即所谓的「正确区域」），`insertBefore` 仍然会执行 remove + insert 操作，每次都会触发浏览器的同步重排。

对于 N 个已有节点，即使它们的位置完全没变（如 push 场景），这段代码仍然会调用 N 次 `insertBefore`，导致 N 次重排。对于用户列表中的十几个 `<a>` 元素，肉眼可见的闪烁由此产生。

### 与方向 B 的对比

方向 B（全量重建）有同样的问题——每次都是先 `disposeNode` 再 `childFn` 重建，DOM 操作次数是 2N。方向 A 复用 DOM 减少了创建开销，但没有消除 `insertBefore` 带来的重排。

## 解决方案

### 关键洞察

对于列表项，判断「是否需要移动」可以通过 `previousSibling` 来判定：

- 第 0 项：如果已经是容器的 `firstChild`，位置正确
- 第 N 项：如果 `previousSibling` 就是第 N-1 项，位置正确

当所有项位置都正确时，不需要任何 `insertBefore` 调用。

### 边界情况

**push（尾部追加）**：已有节点位置全部正确 → 0 次 `insertBefore`，仅新节点插入 1 次
**pop（头部插入）**：所有已有节点向后偏移一位 → 全部需要移动，N 次 `insertBefore`
**重排序**：位置变化的部分需要移动，未变的部分跳过

### 实现

```typescript
// 追踪上一个 DOM 节点
let prevNode: Node | null = null;

for (let i = 0; i < entries.length; i++) {
  // ... 信号处理 ...

  if (nodeMap.has(identity)) {
    const node = nodeMap.get(identity)!;
    // 仅在节点位置发生变化时才移动
    const needsMove =
      prevNode === null ? container.firstChild !== node : node.previousSibling !== prevNode;
    if (needsMove) {
      container.insertBefore(node, anchor);
    }
    prevNode = node;
  } else {
    const node = childFn(itemGetter, index, entryKey);
    if (node instanceof Node) {
      container.insertBefore(node, anchor);
      if (container.isConnected) triggerMount(node);
      nodeMap.set(identity, node);
      prevNode = node;
    }
  }
}
```

### 为什么不用其他判定方式

- **`nextSibling === anchor`**：只对最后一个有效，对中间节点无意义
- **`compareDocumentPosition`**：可判断节点是否在 anchor 之前，但开销大于 `previousSibling`，且同样不能判断「位置是否改变」
- **`insertBefore` 的幂等性判断**：DOM 规范中 `insertBefore` 在节点已在目标位置时不会抛出错误，但浏览器仍然会触发布局更新，无法跳过重排

## 效果

| 场景                | 移动次数（优化前） | 移动次数（优化后） |
| ------------------- | ------------------ | ------------------ |
| push 到已有列表末尾 | N                  | 1（仅新节点）      |
| pop 头部插入        | N+1                | N+1（不可避免）    |
| 重排序              | N                  | 位置变化的项数     |
| 稳定列表不更新      | N                  | 0                  |

对于最常见的「末尾追加」场景，优化效果最明显——从 N+1 次 `insertBefore` 降为 1 次，彻底消除闪烁。

## 边角情况

### 1. `childFn` 返回 `DocumentFragment`

`DocumentFragment` 的 `insertBefore` 会将子节点移入容器，fragment 本身变为空。`nodeMap` 中若保留空 fragment 引用，下次复用时会插入空节点，内容丢失。

当前处理：检测 `nodeType === Node.DOCUMENT_FRAGMENT_NODE`，跳过 `nodeMap` 追踪。后续同 identity 出现时会重新调用 `childFn` 创建。这是安全的退化行为。

### 2. `keyFn` 动态变化

`keyFn` 返回值变化会导致同一逻辑条目的 identity 漂移：旧 identity 的节点被清理，新 identity 的节点被创建。没有泄漏，符合预期。

### 3. 不可变数据约束

`eachFn` 必须返回新的数组引用才能触发更新。直接 mutate 数组不会被 `define` 的 setter 检测到。这是 kiaao 的既定约束，不属于本模块的问题。

## 后续优化（不影响当前正确性）

### 1. 批量移除

清理消失节点时逐个 `removeChild` 会触发多次重排。可将待移除节点先移入 `DocumentFragment`，再一次性从 DOM 移除。不影响正确性。

### 2. `createWhenElement` 惰性路径的清空循环

惰性路径中的 `while (el.firstChild) { disposeNode; removeChild }` 同样存在逐次重排问题，可以用相同思路优化。
