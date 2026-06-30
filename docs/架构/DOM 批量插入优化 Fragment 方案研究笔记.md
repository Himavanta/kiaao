# DOM 批量插入优化：DocumentFragment 方案

**状态**：🟡 研究笔记  
**创建日期**：2026-06-30  
**关联**：[控制流组件首次渲染时机优化](./控制流组件首次渲染时机优化专题文档.md)

---

## 一、动机

当前框架在批量插入 DOM 节点时采用逐次 `adapter.append` / `adapter.before` 的方式，每个节点独立触发一次 DOM 操作。在大列表场景（如 `<Each>` 的 1000 项重排）下可能产生布局抖动。

DocumentFragment 可以将多次 DOM 操作合并为一次插入，浏览器只需触发一次重排/重绘。

---

## 二、当前批量插入点

| 位置                                        | 操作                                 | 场景                          |
| ------------------------------------------- | ------------------------------------ | ----------------------------- |
| `core/h.ts` `handleDomMode`                 | `adapter.append(el, node)` 循环      | 所有 DOM 元素的 children 插入 |
| `core/flow-shared.ts` `adoptBranch`（更新） | `adapter.before(anchor, node)` 循环  | Show/Case/Each 切换分支       |
| `core/each.ts` `repositionEntry`            | `adapter.before(anchor, n)` 逆序循环 | Each 条目重排                 |
| `dom/portal.ts` `Portal`                    | `target.append(node)` 循环           | Portal 挂载内容               |

---

## 三、Fragment 方案

### 接口变更

在 `RenderAdapter` 中新增：

```ts
interface RenderAdapter {
  // 现有
  append(parent: HostNode, child: HostNode): void;
  before(ref: HostNode, child: HostNode): void;

  // 新增
  createFragment(): HostNode;
  appendFragment(frag: HostNode, child: HostNode): void;
}
```

### DOM 实现

```ts
// dom/adapter.ts
createFragment(): DocumentFragment {
  return document.createDocumentFragment();
}

appendFragment(frag: DocumentFragment, child: Node): void {
  frag.append(child);  // 摘下 + 挂到 Fragment
}
```

### SSR 实现

```ts
// server/adapter.ts
createFragment(): SSRNode {
  return { type: "fragment", children: [] };  // 轻量容器
}

appendFragment(frag: SSRFragment, child: SSRNode): void {
  frag.children.push(child);
}
```

然后在实际 `append` 到 DOM 时，SSR 将 fragment 的 children 摊平。

### 使用示例（handleDomMode）

```ts
// 当前
for (const child of children.flat()) {
  const hr = toHResult(child);
  for (const node of hr.nodes) {
    adapter.append(el, node);
  }
}

// 优化后
const frag = adapter.createFragment();
for (const child of children.flat()) {
  const hr = toHResult(child);
  for (const node of hr.nodes) {
    adapter.appendFragment(frag, node);
  }
}
adapter.append(el, frag);
```

---

## 四、影响范围

| 模块                       | 改动量 | 内容                                            |
| -------------------------- | ------ | ----------------------------------------------- |
| `adapter/index.ts`（类型） | 小     | 接口加 `createFragment`、`appendFragment`       |
| `dom/adapter.ts`           | 小     | 两个方法的 DOM 实现                             |
| `server/adapter.ts`        | 小     | 两个方法的 SSR 实现                             |
| `core/h.ts`                | 中     | `handleDomMode` 改用 Fragment 收集              |
| `core/flow-shared.ts`      | 中     | `adoptBranch` 的 `before` 循环改用 Fragment     |
| `core/each.ts`             | 中     | `repositionEntry` 的 `before` 循环改用 Fragment |

---

## 五、风险与难点

### 5.1 生命周期与 DOM 状态的耦合

Fragment 延迟了节点进入真实 DOM 的时间。如果某个生命周期回调（如指令的 `onMount`）依赖节点已在 DOM 中（例如读取 `offsetHeight`），则 Fragment 方案可能破坏此假设。

**当前验证**：Motion 指令的 `playEnterAnimation` 在 `onMount` 中调用 `animate(el, ...)`，需要 `el` 在 DOM 中才能工作。如果改用 Fragment，`onMount` 触发时 `el` 可能仍在 Fragment 中，尚未挂载。

**可能的解决方案**：`adapter.append(el, frag)` 后统一触发 `triggerMount`，或确保 Fragment 在 `triggerMount` 之前被 flush。

### 5.2 SSR 一致性

Fragment 是浏览器 DOM API，SSR 下没有对应概念。SSR adapter 需要提供一个等效的"收集后摊平"机制，保证 SSR 输出与 DOM 输出一致。

### 5.3 小列表无收益

条目数量少于几十个时，Fragment 与逐次 `append` 的性能差异可以忽略。Fragment 主要针对百级以上列表的 reposition 场景。

---

## 六、结论与建议

| 维度     | 评价                                   |
| -------- | -------------------------------------- |
| 性能收益 | 大列表场景显著                         |
| 影响范围 | 6 个文件，中等                         |
| 风险     | 中（生命周期时机 + SSR 一致性）        |
| 优先级   | **低**——在遇到真实性能瓶颈之前不值得做 |

**建议**：记录此方案，等到出现大列表性能报告时再实施。届时可基于此笔记快速实现。当前 Each 的 1000 项测试已经通过，功能正确。
