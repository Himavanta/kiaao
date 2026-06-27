# 控制流组件：Owner 链断裂与初始化时序的解决方案

**状态**：定稿
**关联**：[控制流组件设计原则](./控制流组件设计原则.md)、[控制流组件 API 规范](./控制流组件API规范.md)
**日期**：2026年6月27日
**版本**：1.1

## 一、问题陈述

### 1.1 核心矛盾

控制流组件（`Show`、`Case`、`Each`）需要满足两个互相冲突的要求：

1. **初始内容必须出现在 DOM 中**：用户期望首次渲染时就能看到条件为 true 的内容或列表条目。
2. **后续更新需要稳定的 DOM 锚点**：条件切换或列表变化时，需要在原有位置插入新内容，这要求锚点始终留在 DOM 中。

控制流组件通过**只返回锚点**解决了要求 2——锚点永远留在 DOM 中作为定位参考。但这导致初始内容无法通过返回值传递给父级插入 DOM（要求 1）。如果初始内容也通过返回值传递，它会进入各级父 Owner 的 `elements` 集合，造成“同一节点被多个 Owner 引用”的累积问题，每次信号切换都会留下过期节点引用。

### 1.2 为什么异步组件没有这个问题

异步组件的初始内容虽然也是延迟渲染的（Promise resolve 之前是占位符），但它的 Owner 是在 `handleComponent` 同步帧内创建的。`mergeResults` 处理异步组件的返回值时，占位符节点和 `asyncOwner` 被正确挂载到父 Owner 下。后续 Promise resolve 只是填充内容——`realNodes` 替换占位符，子组件的 Owner 被挂载到 `asyncOwner.children` 下。所有权链从未断裂。

控制流组件的子组件却是在组件函数返回之后（`onMount` 回调或信号回调）创建的。此时 `handleComponent(Show)` 早已执行完毕，`mergeResults` 没有机会将子 Owner 挂载到 `showOwner.children` 下。这导致子组件的 Owner 在 Owner 树中孤立，`triggerMount` 无法从根 Owner 出发递归到达，`onMount` 回调永不触发。

### 1.3 深层嵌套的级联断裂

问题不仅影响控制流组件的直接子组件。当控制流组件的子组件内部包含 DOM 元素，而这些 DOM 元素内部又包含其他需要 `triggerMount` 的组件时，Owner 链同样会断开：

```
Show 渲染 Primary
  └── Primary 函数体内
       └── <div><Each value={items}>{Item}</Each></div>
            └── h(Each, ...) → eachOwner
            └── handleDomMode("div") → processChildren 丢弃 eachOwner
            └── eachOwner 孤立
```

`processChildren` 处理 `Each` 的 `HResult` 时丢弃了 `eachOwner`。`triggerMount(primaryOwner)` 遍历 `PrimaryOwner.children` 时找不到 `EachOwner`，因为 `h("div")` 没有 Owner 来承接它。`Each` 的 `onMount` 不会触发，`Each` 的内容永远不会渲染。

**这不是控制流组件的特有问题——任何在 DOM 元素内使用 `onMount` 的组件都会遇到。**

## 二、解决方案：自动化按需轻量 Owner

### 2.1 核心洞察

问题的根源是 `processChildren` 在处理 `HResult` 时丢弃了 `child.owner`，而 `handleDomMode` 中的 DOM 元素（如 `<div>`）没有 Owner 来承接这些被丢弃的子 Owner。

**解决方案**：在 `handleDomMode` 内部，根据 `processChildren` 的实际处理结果，**自动决定**是否需要为当前 DOM 元素创建一个轻量 Owner。如果需要，则创建轻量 Owner 并自动将子 Owner 连接上去。

控制流组件的子组件渲染仍然使用 `onMount` 延迟 + 手动挂载子 Owner 的模式，但深层嵌套的断裂问题由自动化轻量 Owner 解决。两者结合，覆盖所有场景。

### 2.2 自动化轻量 Owner 机制

```ts
function handleDomMode(tag, props, children) {
  const el = adapter.createElement(tag);
  // ... 处理 props

  // 处理 children，同时收集需要连接的子 Owner
  let needsOwner = false;
  const childOwners: Owner[] = [];

  // 增强版 processChildren，或在 handleDomMode 中直接处理
  const { nodes, cleanups } = processChildren(children, {
    onHResult: (hResult) => {
      if (hResult.owner) {
        needsOwner = true;
        childOwners.push(hResult.owner);
      }
    },
  });

  // 按需创建轻量 Owner
  let owner = null;
  if (needsOwner) {
    owner = createOwner();
    owner.elements.add(el);
    for (const childOwner of childOwners) {
      owner.children.push(childOwner);
      childOwner.parent = owner;
    }
  }

  // 插入子节点
  for (const node of nodes) {
    adapter.append(el, node);
  }

  return createHResult(owner, [el], cleanups);
}
```

**关键特性**：

- **完全自动化**：开发者无需关心，框架在运行时动态处理。
- **按需创建**：只有包含“需要 `triggerMount` 的组件”的 DOM 元素才会创建轻量 Owner。绝大多数纯静态的 `<div>`、`<span>` 不会受到影响。
- **解决根本问题**：`processChildren` 不再丢弃子 Owner，而是通过创建的轻量 Owner 将它们连接回 Owner 树。

### 2.3 控制流组件的完整流程

自动化轻量 Owner 解决了深层嵌套的断裂问题后，控制流组件本身的初始化采用 `onMount` 延迟 + 手动挂载子 Owner 的模式：

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

4. Show 的 onMount 回调（renderBranch）
   → 调用 h(Primary) 渲染主内容组件
   → 将 primaryOwner 挂载到 showOwner.children 下
   → 遍历 primaryResult.nodes，通过 adapter.before(anchor, node) 插入 DOM
   → 调用 triggerMount(primaryOwner) 局部触发 Primary 及其子组件的挂载
   → 保存 primaryResult 到 currentResult

5. 后续条件切换（信号回调，同样调用 renderBranch）
   → disposeOwner(currentResult.owner) 清理旧分支
   → 调用 h(NewComponent) 渲染新分支
   → 将 newOwner 挂载到 showOwner.children 下
   → 通过 adapter.before(anchor, node) 插入 DOM
   → 调用 triggerMount(newOwner) 局部触发挂载
   → 更新 currentResult
```

**`triggerMount(primaryOwner)` 的递归可达性**：由于自动化轻量 Owner 机制，`Primary` 内部的所有深层嵌套组件（`Each`、`Show` 等）都通过 DOM 元素的轻量 Owner 连接到了 `primaryOwner.children` 链上。`triggerMount` 可以从 `primaryOwner` 出发，沿着这条链递归到达所有需要触发挂载的组件。

### 2.4 伪代码

```ts
function Show({ value, children }, { owner, onMount }) {
  const anchor = createComment("show");
  owner.elements.add(anchor);
  let currentResult = null;

  const renderBranch = () => {
    // 守卫：组件已销毁则跳过
    if (owner.disposed) return;

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
  // 注意：需要跳过 use() 首次执行时的冗余调用
  let subscribed = false;
  use(value, () => {
    if (!subscribed) {
      subscribed = true;
      return; // 跳过首次（onMount 已处理）
    }
    renderBranch();
  });

  return [anchor];
}
```

### 2.5 冗余初始计算的避免

`use(value, fn)` 在创建派生时立即执行一次 `fn`。如果 `fn` 就是 `renderBranch`，它会在 `onMount` 渲染之后马上再触发一次——两次渲染，第二次是冗余的。

解决方案：通过 `subscribed` 标志位跳过 `use()` 的首次执行。`onMount` 已经处理了初始渲染，信号回调只处理后续更新。This is an implementation detail，不影响方案的可行性。

## 三、方案优势

### 3.1 完全解决级联断裂

自动化轻量 Owner 机制确保了任何需要 `triggerMount` 的组件（无论嵌套多深）都能通过 DOM 元素的轻量 Owner 连接到 Owner 树中。`triggerMount` 可以从根 Owner 或任何中间 Owner 出发，递归到达所有需要触发挂载的组件。

### 3.2 按需创建，避免概念膨胀

只有包含“需要 `triggerMount` 的组件”的 DOM 元素才会创建轻量 Owner。绝大多数纯静态的 DOM 元素不受影响。这避免了“每个 DOM 元素都有 Owner”的概念膨胀问题。

### 3.3 `elements` 保持清洁

控制流组件的 `onMount` 延迟渲染确保了内容节点不经过 `result.nodes`，因此不会进入 `showOwner.elements` 和所有上级 Owner 的 `elements`。`showOwner.elements` 中只有锚点。每次信号切换时，`disposeOwner` 清理旧分支的 `elements`，不影响 Show 自身的 `elements`。

### 3.4 初始化与更新逻辑统一

初始渲染（`onMount` 回调）和后续更新（信号回调）都调用同一个 `renderBranch` 函数。两者的唯一区别是调用时机——初始渲染在 `onMount` 中（锚点已就绪），后续更新在信号回调中（锚点同样已就绪）。Owner 挂载、DOM 插入、`triggerMount` 触发的逻辑完全一致。

### 3.5 完全基于现有 API

不需要引入任何新概念或新机制。所有操作基于现有 API：

| API                            | 用途                               |
| ------------------------------ | ---------------------------------- |
| `h(Component)`                 | 渲染子组件，自动管理其完整生命周期 |
| `context.owner`                | 访问控制流组件自身的 Owner         |
| `context.onMount(fn)`          | 延迟初始渲染到锚点就绪后           |
| `disposeOwner(owner)`          | 销毁旧分支的所有资源               |
| `triggerMount(owner)`          | 局部触发子组件的挂载回调           |
| `adapter.before(anchor, node)` | 插入内容节点到 DOM                 |
| 自动化轻量 Owner               | `handleDomMode` 内部按需创建       |

## 四、对 SSR 的影响

SSR 模式下 `onMount` 不会被触发。控制流组件需要在组件函数中检测渲染模式，在 SSR 模式下同步渲染初始内容并通过返回值传递。这与客户端模式的核心逻辑（`renderBranch`）完全一致，只是调用时机不同——SSR 在组件函数中同步调用，客户端在 `onMount` 中延迟调用。

自动化轻量 Owner 机制在 SSR 模式下同样适用——DOM 元素在 `handleDomMode` 中检测到子 HResult 包含 Owner 时，同样会创建轻量 Owner 并连接子 Owner。SSR 输出的 DOM 结构（包含锚点）与客户端一致。

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

## 六、返回值约定

控制流组件的返回值应使用 `[anchor]`（普通数组），与 `Fragment` 的行为一致。当前的 `mergeResults` 和 `processChildren` 对数组和 `HResult` 的处理路径不同，但最终都能正确插入 DOM。控制流组件内部的 `cleanups`（通过 `use()` 创建的派生清理函数）在 Owner 销毁时由 `disposeOwner` 处理，不需要通过返回值传递。

## 七、结论

控制流组件的 Owner 链断裂和初始化时序问题，通过以下两个机制完全解决：

1. **自动化按需轻量 Owner**：`handleDomMode` 在处理 children 时，如果检测到子 HResult 包含 Owner，自动为当前 DOM 元素创建轻量 Owner 并连接子 Owner。这解决了深层嵌套的级联断裂问题。

2. **控制流组件的 `onMount` 延迟 + 手动挂载**：控制流组件在 `onMount` 回调中渲染子组件，手动挂载子 Owner 并局部触发 `triggerMount`。这确保了锚点已在 DOM 中，内容节点不经过返回值，`elements` 保持清洁。

这两个机制完全基于现有 API，不需要修改框架核心架构。自动化轻量 Owner 按需创建，避免了“每个 DOM 元素都有 Owner”的概念膨胀。控制流组件的初始化与更新逻辑统一，代码简洁。
