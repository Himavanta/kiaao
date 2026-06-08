# each 指令改造方案 v1.2

## 一、改造目标

对 `each` 指令进行底层重构，实现三个核心改进：

1. **支持多种数据源**：使用统一入口处理数组、对象、Map、Set、字符串、数字等类型
2. **内部自动响应式包装**：将普通 item 自动包装为响应式 getter，使 `childFn` 接收到的始终是响应式函数
3. **方向 A：同 key 复用 DOM**：身份匹配时直接复用 DOM 节点，不重新调用 `childFn`，保留内部状态和焦点

改造后用户 API 完全不变，但列表项在增删移动时将保留内部状态，且属性级更新将自动细粒度生效。

## 二、数据源统一处理

### 2.1 支持的输入类型

| 输入类型 | 处理方式                                                         | entries 结果                      |
| -------- | ---------------------------------------------------------------- | --------------------------------- |
| `Array`  | `Object.entries(arr)`                                            | `[["0", item], ["1", item], ...]` |
| `Object` | `Object.entries(obj)`                                            | `[["key", value], ...]`           |
| `Map`    | `[...map.entries()]`                                             | `[["key", value], ...]`           |
| `Set`    | `[...set].map((v, i) => [i, v])`                                 | `[[0, item], [1, item], ...]`     |
| `number` | `Array.from({ length: n }, (_, i) => [String(i), undefined, i])` | `[["0", undefined], ...]`         |
| `string` | `[...str].map((v, i) => [String(i), v, i])`                      | `[["0", char], ...]`              |

### 2.2 统一转换函数

```typescript
function normalizeEachSource(source: any): Array<[any, any, number]> {
  if (source instanceof Map) {
    return [...source.entries()].map(([k, v], i) => [k, v, i]);
  }
  if (source instanceof Set) {
    return [...source].map((v, i) => [i, v, i]);
  }
  if (typeof source === "number") {
    return Array.from({ length: source }, (_, i) => [String(i), undefined, i]);
  }
  if (typeof source === "string") {
    return [...source].map((v, i) => [String(i), v, i]);
  }
  // 数组、对象及其他
  const entries = Object.entries(source ?? {});
  return entries.map(([k, v], i) => [k, v, i]);
}
```

### 2.3 childFn 参数扩展

`childFn` 的签名扩展为 `(value: any, key: any, index: number) => Node`：

- `value`：entries 的值（响应式包装后的 getter）
- `key`：entries 的键（对象属性名、数组索引等）
- `index`：从 0 开始的序号

用户可以选择性使用这些参数，向后兼容现有的 `(item, index)` 写法。

## 三、内部响应式自动包装

### 3.1 包装策略

`each` 内部维护一个 `Map<identity, [getter, setter]>`，用于存储每个列表项的响应式信号：

- **首次出现**：用 `define(normalizedItem)` 创建信号，存入缓存
- **再次出现**（同 identity）：用 `setter(normalizedItem)` 更新信号值，不创建新信号
- **消失**：从缓存中移除，对应信号随 DOM 节点一起被回收

### 3.2 已响应式 item 的处理

如果 item 本身已经是响应式函数（携带 `IS_REACTIVE` 标记），则不进行二次包装，直接使用其作为 getter，此时不会创建 setter（或创建一个空的 setter）。

### 3.3 内外同步机制

当外部通过 `setList` 更新整个列表时，`each` 的 effect 会自动触发，遍历新 entries，对每个同 identity 的 item 调用 `setter` 更新内部信号，随后信号变化驱动细粒度 DOM 更新。用户不需要手动调用任何更新函数。

## 四、方向 A：同 key 复用 DOM

### 4.1 复用规则

`each` 内部维护一个 `nodeMap: Map<identity, Node>`，记录每个身份对应的 DOM 节点。

当 `each` 的 effect 重新运行时：

1. 遍历新的 entries 列表，对每个 entry 计算 identity
2. **身份匹配**：从 `nodeMap` 中取出已有 DOM 节点，通过 `insertBefore` 移动到正确位置。**不调用 `childFn`，不触发 `disposeNode`**
3. **新身份**：调用 `childFn` 创建新节点，插入正确位置，触发 `triggerMount`
4. **消失的身份**：调用 `disposeNode` 清理，从 `nodeMap` 和 `itemSignalMap` 中移除

### 4.2 与响应式包装的配合

因为 `childFn` 只在首次创建时被调用一次，后续更新完全通过 `setter` 更新内部信号值来触发细粒度 DOM 更新，所以：

- 列表项内部的信号绑定保持有效
- 输入框焦点不丢失
- 滚动位置保持
- 动画状态不被中断

### 4.3 数据正确性保证

即使 `childFn` 不被重新调用，数据也始终保持正确，因为：

- 同 identity 的 item 数据变化通过 `setter` 更新到同一个 `define` 信号中
- 该信号的所有订阅者（DOM 绑定）会自动收到新值
- 属性级更新绕过 `each`，直接由信号系统处理

## 五、key 的自动推导

### 5.1 推导规则

| 场景                                             | key 推导                                       |
| ------------------------------------------------ | ---------------------------------------------- |
| 用户提供了 `keyFn`                               | 使用 `keyFn(item, index, entriesKey)` 的返回值 |
| 未提供 `keyFn`，数据源是对象                     | 使用 entries 的键（对象属性名）                |
| 未提供 `keyFn`，数据源是数组且 item 是响应式函数 | 使用 item 函数引用                             |
| 未提供 `keyFn`，数据源是数组且 item 是普通值     | 使用数组索引（回退行为）                       |

### 5.2 回退行为说明

使用数组索引作为 key 时，在数组重排（排序、反转等）场景下，同索引可能指向不同的数据项，导致 DOM 被错误复用。但数据正确性不受影响——因为 `setter` 会更新内部信号值。只是在这种情况下无法享受“保持焦点”的收益。用户如果需要重排时保持焦点，应提供稳定的 `key`。

## 六、keyFn 参数扩展

`keyFn` 签名扩展为 `(item: any, index: number, entriesKey: any) => any`。新增的第三个参数 `entriesKey` 是 `normalizeEachSource` 中 entries 的原始键，对于对象来说是属性名，对于数组来说是索引字符串。这允许用户构建更灵活的 identity。

## 七、实现要点

### 7.1 renderEach 重构

```typescript
function renderEach(
  container: HTMLElement,
  eachFn: () => any,
  childFn: (value: any, key: any, index: number) => Node,
  keyFn?: (item: any, index: number, entriesKey: any) => any,
): { stop: () => void } {
  const anchor = document.createComment("each");
  container.appendChild(anchor);

  const nodeMap = new Map<any, Node>(); // key → DOM
  const itemSignalMap = new Map<any, [Getter, Setter]>(); // key → [getter, setter]

  const stop = effect(() => {
    const source = typeof eachFn === "function" ? eachFn() : eachFn;
    const entries = normalizeEachSource(source);
    const newKeys = new Set<any>();

    for (let i = 0; i < entries.length; i++) {
      const [entryKey, rawValue, index] = entries[i];
      const identity = keyFn ? keyFn(rawValue, index, entryKey) : entryKey;
      newKeys.add(identity);

      // 获取或创建响应式 item getter
      let itemGetter: any;
      if (itemSignalMap.has(identity)) {
        const [, setter] = itemSignalMap.get(identity)!;
        // 更新已有信号（同步外部变化）
        setter(rawValue);
        itemGetter = itemSignalMap.get(identity)![0];
      } else {
        // 已响应式则不二次包装
        const isReactive = rawValue != null && (rawValue as any)[IS_REACTIVE];
        const [getter, setter] = isReactive ? [rawValue, () => {}] : define(rawValue);
        itemSignalMap.set(identity, [getter, setter]);
        itemGetter = getter;
      }

      // 复用或创建 DOM
      if (nodeMap.has(identity)) {
        const node = nodeMap.get(identity)!;
        container.insertBefore(node, anchor);
      } else {
        const node = childFn(itemGetter, entryKey, index);
        if (node instanceof Node) {
          container.insertBefore(node, anchor);
          if (container.isConnected) triggerMount(node);
          nodeMap.set(identity, node);
        }
      }
    }

    // 清理消失的 identity
    for (const [key, node] of nodeMap) {
      if (!newKeys.has(key)) {
        disposeNode(node);
        if (node.parentNode) node.parentNode.removeChild(node);
        nodeMap.delete(key);
        itemSignalMap.delete(key);
      }
    }
  });

  addLocalEffect(container, stop);
  return { stop };
}
```

### 7.2 createEachElement 简化

`createEachElement` 只需创建元素、设置属性、调用 `renderEach`，不再包含列表逻辑。

### 7.3 when + each + key 共存

在 `createWhenElement` 中，当 `when` 与 `each` 共存时（`hasEach` 为 `true`），直接调用 `renderEach`，并将 `keyFn` 传递给 `renderEach`。这样：

- `when` 作为外层守卫，控制整个列表的挂载/卸载
- `each` 在 `when` 为 true 时接管内部渲染，使用 key 进行增量 DOM 复用
- key 的优化能力完全覆盖此场景，与单独使用 `each` 的行为一致

```typescript
// createWhenElement 中的 hasEach 分支
if (hasEach) {
  const childFn = children[0];
  const { stop: eachStop } = renderEach(el, eachFn, childFn, keyFn);
  eachStopRef = eachStop; // 保存以便 when 切换时停止
}
```

**行为总结表**：

| when 条件              | each 数据变化                               | 行为 |
| ---------------------- | ------------------------------------------- | ---- |
| true → true 且数据变   | 同 key 复用 DOM，新 key 创建，消失 key 清理 |
| true → true 且数据未变 | identity 匹配，跳过更新                     |
| false → true           | `renderEach` 首次启动，所有节点新建         |
| true → false           | `eachStop()` 停止，节点清理，缓存释放       |
| 保持 false             | 无操作                                      |

## 八、与现有代码的兼容性

- **API 不变**：`each` 和 `key` 属性保持不变
- **childFn 签名扩展**：新增第二个参数 `key`，但现有只用 `(item, index)` 的代码完全兼容
- **行为变化**：同 key 的列表项在更新时保留 DOM，这是预期增强
- **数据源扩展**：现有数组用法完全不变，新增对象/Map/Set/字符串/数字支持

## 九、后续扩展

此改造完成后，`each` 内部已经具备完整的 identity-tracking 能力。后续可以：

- 将 `when` 迁移到同一套基础设施（方向四第二阶段）
- 基于 identity 机制引入 `memo` 属性
- 支持列表项的移动动画（`TransitionGroup`）
