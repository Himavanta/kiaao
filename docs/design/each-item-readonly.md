# Each item 只读派生方案

## 动机

当前 `<Each>` 的 `item` 是定义信号：`item(newVal)` 可以写入，但不会同步回源数组。这与 kiaao 的"投影即是只读派生"的哲学不一致——`currentUser`、字段派生都是逻辑只读，`item` 是唯一的例外。这种不一致造成文档负担和用户困惑。

将 `item` 改为逻辑只读派生：始终等于源数组该位置的最新值，写入被忽略。

## 实现

### 核心思路

`item` 不直接暴露信号，而是在桥接信号上包一层逻辑只读派生。两个信号都通过 `context.use` 挂靠在 Each 的 Owner 上，Each 卸载时框架自动清理所有条目信号。

```
bridge = context.use(rawValue)               // Each 内部写入（diff 时更新），挂靠 Each Owner
item   = context.use(bridge, () => bridge()) // 逻辑只读，传给组件，挂靠 Each Owner
```

`itemSignalMap` 存 bridge（供 diff 路径写），组件收到的 `props.item` 是派生。

### 改动文件

**`src/core/each.ts`**

`EachState` 加 `context` 字段，`Each` 函数内赋值 `context`，`renderEachEntry` 改用 `context.use`：

```ts
// 旧
const itemSignal = definitionMode(rawValue);
state.itemSignalMap.set(identity, itemSignal);
return adoptBranch({
  componentProps: { item: itemSignal, index },
});

// 新
const bridge = state.context.use(rawValue);
const item = state.context.use(bridge, () => bridge());
state.itemSignalMap.set(identity, bridge);
return adoptBranch({
  componentProps: { item, index },
});
```

### 不受影响的部分

- diff 路径：`buildDiffEntries` 中 `sig(rawValue)` 写的仍是 `itemSignalMap` 中的信号（现在是 bridge），行为不变
- 类型声明：组件接收的仍是 `Signal<T>`，types 层无变化
- fallback、keyed、无 keyed 全量重建路径：均不受影响

### 清理行为变化

|                   | 旧                                  | 新                                                  |
| ----------------- | ----------------------------------- | --------------------------------------------------- |
| 信号清理          | `definitionMode` 浮动信号，永不清理 | `context.use` 挂靠 Each Owner，Each 卸载时统一 stop |
| 条目移除后 bridge | 浮动残留                            | 存活到 Each 卸载（可接受——有明确归属）              |

### 行为变化

|                | 旧                                  | 新                                               |
| -------------- | ----------------------------------- | ------------------------------------------------ |
| `item()`       | 返回当前值                          | 返回当前值                                       |
| `item(newVal)` | 写入定义信号，值变化                | 写入被忽略，值不变                               |
| 源数组更新     | diff 写 `sig(rawValue)` → item 更新 | bridge 写 `sig(rawValue)` → 派生重算 → item 更新 |
| 局部 UI 状态   | 写 item                             | 需自己建独立信号                                 |

### 文档变更

- `guide/control-flow.md`：删除"item 可写"说明，改为"item 是逻辑只读派生"
- `agent/anti-patterns.md`：无需变更

### 测试

- 现有控制流测试不变（`item()` 读取行为不变）
- 新增：写入 `item(newVal)` 为 no-op，值仍等于源数组的最新值
