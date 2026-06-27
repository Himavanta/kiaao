# 控制流组件：Owner 链断裂与初始化时序的解决方案

**状态**：定稿
**关联**：[控制流组件设计原则](./控制流组件设计原则.md)、[控制流组件 API 规范](./控制流组件API规范.md)
**日期**：2026年6月27日
**版本**：1.0

## 一、问题陈述

### 1.1 核心矛盾

控制流组件（`Show`、`Case`、`Each`）需要满足两个互相冲突的要求：

1. **初始内容必须出现在 DOM 中**：用户期望首次渲染时就能看到条件为 true 的内容或列表条目。
2. **后续更新需要稳定的 DOM 锚点**：条件切换或列表变化时，需要在原有位置插入新内容，这要求锚点始终留在 DOM 中。

控制流组件通过**只返回锚点**解决了要求 2——锚点永远留在 DOM 中作为定位参考。但这导致初始内容无法通过返回值传递给父级插入 DOM（要求 1）。如果初始内容也通过返回值传递，它会进入各级父 Owner 的 `elements` 集合，造成“同一节点被多个 Owner 引用”的累积问题，每次信号切换都会留下过期节点引用。

### 1.2 为什么异步组件没有这个问题

异步组件的初始内容虽然也是延迟渲染的（Promise resolve 之前是占位符），但它的 Owner 是在 `handleComponent` 同步帧内创建的。`mergeResults` 处理异步组件的返回值时，占位符节点和 `asyncOwner` 被正确挂载到父 Owner 下。后续 Promise resolve 只是填充内容——`realNodes` 替换占位符，子组件的 Owner 被挂载到 `asyncOwner.children` 下。所有权链从未断裂。

控制流组件的子组件却是在组件函数返回之后（`onMount` 回调或信号回调）创建的。此时 `handleComponent(Show)` 早已执行完毕，`mergeResults` 没有机会将子 Owner 挂载到 `showOwner.children` 下。这导致子组件的 Owner 在 Owner 树中孤立，`triggerMount` 无法从根 Owner 出发递归到达，`onMount` 回调永不触发。

### 1.3 尝试过的路径

我们探索了多种解决方案：

- **让 DOM 元素也创建 Owner**：在 `handleDomMode` 中为每个 DOM 元素创建 Owner，作为 Owner 链的桥梁。这解决了链断裂问题，但导致每个 `<div>`、`<section>` 都有一个 Owner，概念上与 VDOM 等效但没有 VDOM 的收益，且引入了双重跟踪（同一节点同时属于 DOM Owner 和组件 Owner）。
- **反转返回顺序**：Show 返回 `[contentNodes, anchor]`，初始内容通过返回值传递。这解决了初始渲染问题，但内容节点进入 `showOwner.elements` 后无法在后续更新中被清理，造成累积。
- **伪装成异步组件**：Show 返回 Promise，在 `onMount` 中 resolve。技术上可行，但引入了不必要的异步开销，对 SSR 不友好，且概念不一致。

这些方案都在某一个方向上做出了妥协。我们需要一个更根本的解法。

## 二、解决方案：手动挂载子 Owner + 局部 `triggerMount`

### 2.1 核心洞察

控制流组件的初始化流程本质上是**两个独立且互补的操作**：

1. **Owner 链的建立**：将子组件的 Owner 挂载到控制流组件的 Owner 的 `children` 下。这是纯逻辑操作，不依赖 DOM。
2. **内容节点的 DOM 插入**：通过 `adapter.before(anchor, node)` 将节点插入 DOM。这依赖锚点已在 DOM 中。

这两个操作可以由控制流组件**自己完成**，不需要 DOM 元素介入作为桥梁。唯一需要解决的时序问题是：初始渲染时锚点还没有在 DOM 中，`adapter.before()` 无法工作。这个问题可以通过将初始内容的渲染推迟到 `onMount` 回调中来彻底解决——`onMount` 触发时锚点已在 DOM 中。

### 2.2 完整流程

```
1. Show 组件函数执行
   → 创建锚点（createComment）
   → 只返回 [anchor]
   → 不渲染任何子组件

2. handleComponent(Show) 处理返回值
   → showOwner 挂载到父 Owner.children
   → 锚点插入 DOM

3. triggerMount 从根 Owner 递归
   → 到达 showOwner
   → 触发 Show 的 onMount 回调

4. Show 的 onMount 回调
   → 调用 h(Primary) 渲染主内容组件
   → 将 primaryOwner 挂载到 showOwner.children 下
   → 遍历 primaryResult.nodes，通过 adapter.before(anchor, node) 插入 DOM
   → 调用 triggerMount(primaryOwner) 局部触发 Primary 及其子组件的挂载
   → 保存 primaryResult 到 currentResult

5. 后续条件切换（信号回调）
   → disposeOwner(currentResult.owner) 清理旧分支
   → 调用 h(NewComponent) 渲染新分支
   → 将 newOwner 挂载到 showOwner.children 下
   → 通过 adapter.before(anchor, node) 插入 DOM
   → 调用 triggerMount(newOwner) 局部触发挂载
   → 更新 currentResult
```

### 2.3 关键机制

**手动挂载子 Owner**：

```ts
// Show 的 onMount 或信号回调中
const newResult = h(Component);
if (newResult.owner) {
  newResult.owner.parent = context.owner;
  context.owner.children.push(newResult.owner);
}
```

`context.owner` 是 Show 自身的 Owner，由 `handleComponent(Show)` 创建并挂载到父组件 Owner 下。手动挂载子 Owner 到 `context.owner.children` 后，`triggerMount` 和 `disposeOwner` 都能正常递归遍历。

**局部触发 `triggerMount`**：

```ts
// 触发新子组件的挂载回调
triggerMount(newResult.owner);
```

`triggerMount` 从指定 Owner 出发，递归遍历其 `children` 树，触发所有未执行的 `mountCallbacks`。不需要从根 Owner 开始全量遍历——局部触发足够。

**`onMount` 确保锚点就绪**：

初始内容的渲染推迟到 `onMount` 回调中。此时锚点已通过 `handleComponent(Show)` → `mergeResults` → 父级 `processChildren` 插入到 DOM 中。`adapter.before(anchor, node)` 可正常工作。

### 2.4 伪代码

```ts
function Show({ value, children }, { owner, onMount }) {
  const anchor = createComment("show");
  owner.elements.add(anchor);
  let currentResult = null;

  const renderBranch = () => {
    const Component = toValue(value) ? children[0] : children[1];

    // 清理旧分支
    if (currentResult) {
      disposeOwner(currentResult.owner);
      currentResult = null;
    }

    if (!Component) return;

    // 渲染新分支
    const newResult = h(Component);

    // 手动挂载子 Owner 到 Show 的 Owner 下
    if (newResult.owner) {
      newResult.owner.parent = owner;
      owner.children.push(newResult.owner);
    }

    // 插入 DOM（锚点已在 DOM 中）
    for (const node of newResult.nodes) {
      adapter.before(anchor, node);
    }

    // 局部触发子组件的挂载回调
    if (newResult.owner) {
      triggerMount(newResult.owner);
    }

    currentResult = newResult;
  };

  // 初始渲染推迟到 onMount
  onMount(() => renderBranch());

  // 后续切换在信号回调中触发
  use(value, () => renderBranch());

  return [anchor];
}
```

Case 和 Each 同理。Each 的 `sync` 逻辑在 `onMount` 和信号回调中复用，每个条目手动挂载条目 Owner、插入 DOM、局部触发挂载。

## 三、方案优势

### 3.1 不需要 DOM 元素有 Owner

控制流组件手动完成所有 Owner 管理。`showOwner → primaryOwner` 的链已经足够让 `triggerMount` 和 `disposeOwner` 递归到达所有需要处理的组件。DOM 元素（`<div>`、`<section>`）不需要创建 Owner，不需要介入生命周期管理。

### 3.2 `elements` 保持清洁

内容节点通过 `adapter.before(anchor, node)` 插入 DOM，不经过 `result.nodes`，因此不会进入 `showOwner.elements` 和所有上级 Owner 的 `elements`。`showOwner.elements` 中只有锚点。每次信号切换时，`disposeOwner` 清理旧分支的 `elements`，不影响 Show 自身的 `elements`。

### 3.3 初始化与更新逻辑统一

初始渲染（`onMount` 回调）和后续更新（信号回调）都调用同一个 `renderBranch` 函数。两者的唯一区别是调用时机——初始渲染在 `onMount` 中（锚点已就绪），后续更新在信号回调中（锚点同样已就绪）。Owner 挂载、DOM 插入、`triggerMount` 触发的逻辑完全一致。

### 3.4 完全基于现有 API

不需要引入任何新概念或新机制。所有操作基于现有 API：

| API                            | 用途                               |
| ------------------------------ | ---------------------------------- |
| `h(Component)`                 | 渲染子组件，自动管理其完整生命周期 |
| `context.owner`                | 访问控制流组件自身的 Owner         |
| `context.onMount(fn)`          | 延迟初始渲染到锚点就绪后           |
| `disposeOwner(owner)`          | 销毁旧分支的所有资源               |
| `triggerMount(owner)`          | 局部触发子组件的挂载回调           |
| `adapter.before(anchor, node)` | 插入内容节点到 DOM                 |

## 四、对 SSR 的影响

SSR 模式下 `onMount` 不会被触发。控制流组件需要在组件函数中检测渲染模式，在 SSR 模式下同步渲染初始内容并通过返回值传递。这与客户端模式的核心逻辑（`renderBranch`）完全一致，只是调用时机不同——SSR 在组件函数中同步调用，客户端在 `onMount` 中延迟调用。

```ts
if (getRenderMode() === "ssr") {
  renderBranch(); // 同步渲染
  const contentNodes = currentResult ? currentResult.nodes : [];
  return [anchor, ...contentNodes];
}

// 客户端
onMount(() => renderBranch());
return [anchor];
```

SSR 模式下内容节点通过返回值传递，会进入各级父 Owner 的 `elements`。但由于 SSR 页面是静态的（没有后续信号切换），不会产生累积问题。

## 五、对自定义指令的影响

控制流组件只返回锚点，内容节点不在返回值中。当指令包裹控制流组件时，指令收到的宿主元素（`el`）是锚点注释节点，无法正常工作。这是控制流组件“无宿主元素”特性的自然结果，正确做法是将指令放在控制流组件**内部**（作为子组件的实现细节）。详见《控制流组件：SSR 兼容与自定义指令配合》文档。

## 六、结论

控制流组件的 Owner 链断裂和初始化时序问题，可以通过以下三个机制完全解决，不需要对框架核心做任何改动：

1. **手动挂载子 Owner**：控制流组件在 `h()` 返回后，手动将子组件的 Owner 挂载到自己的 Owner 的 `children` 下。
2. **`onMount` 延迟初始渲染**：初始内容的渲染推迟到 `onMount` 回调中，确保锚点已在 DOM 中。
3. **局部 `triggerMount`**：新子组件的挂载回调通过 `triggerMount(childOwner)` 局部触发，不需要从根 Owner 全量遍历。

这个方案不需要 DOM 元素有 Owner，不需要 `processChildren` 连接子 Owner，不需要引入新概念。它完全基于现有 API，是当前架构下最简洁、最自洽的解法。
