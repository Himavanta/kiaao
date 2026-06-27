# 控制流组件：SSR 兼容与自定义指令配合

**状态**：定稿
**关联**：[控制流组件设计原则](./控制流组件设计原则.md)、[控制流组件 API 规范](./控制流组件API规范.md)
**日期**：2026年6月27日
**版本**：1.0

## 一、概述

控制流组件（`Show`、`Case`、`Each`）有两个核心设计特性：

1. **只返回锚点**：组件初始渲染时只返回 `[anchor]`（注释锚点节点），内容节点不包含在返回值中，而是通过 `adapter.before(anchor, node)` 在 `onMount` 或信号回调中插入。
2. **依赖 `onMount`**：初始内容的渲染推迟到 `onMount` 回调中，以确保锚点已在 DOM 中。

这两个特性在 SSR 和自定义指令配合场景下需要特殊处理。本文档记录这些场景的分析结论和推荐做法。

## 二、SSR 兼容

### 2.1 问题

SSR 模式下，`onMount` 不会被触发——服务端渲染没有 DOM，没有挂载概念。如果控制流组件将初始内容的渲染完全推迟到 `onMount`，SSR 输出将只包含空的锚点，内容完全丢失。

### 2.2 解决方案

控制流组件在组件函数中检测当前渲染模式，根据模式采用不同的初始化策略：

- **SSR 模式**（`getRenderMode() === "ssr"`）：在组件函数中**同步**渲染初始内容。SSR 是一次性渲染，没有后续的 DOM 操作，此时内容节点需要与锚点一起通过 `result.nodes` 返回给父级。内容节点进入 `elements` 不会造成累积问题，因为 SSR 页面是静态的，没有后续的信号切换。
- **客户端模式**：在组件函数中只创建锚点并返回，将初始内容的渲染推迟到 `onMount` 回调中。

### 2.3 SSR 模式下的特殊考量

- SSR adapter 的 `createComment` 返回轻量的 `SSRComment` 对象，`adapter.before` 在 SSR 模式下是空操作。内容节点无法通过 `before()` 插入 SSR 输出，只能通过 `result.nodes` 返回值传递。
- SSR 模式下，内容节点通过 `result.nodes` 进入各级父 Owner 的 `elements`。由于 SSR 没有后续的信号切换和 `disposeOwner` 清理，节点引用不会累积。
- 后续信号切换（如果 SSR 页面被客户端激活为交互式应用）将走客户端模式，`onMount` 正常触发，内容节点不再经过 `result.nodes`。

### 2.4 伪代码示例

```ts
function Show({ value, children }, { owner, onMount }) {
  const anchor = createComment("show");
  owner.elements.add(anchor);
  let currentResult = null;

  const renderBranch = () => {
    const Component = toValue(value) ? children[0] : children[1];
    if (!Component) {
      if (currentResult) disposeOwner(currentResult.owner);
      currentResult = null;
      return;
    }

    if (currentResult) disposeOwner(currentResult.owner);
    const newResult = h(Component);
    newResult.owner.parent = owner;
    owner.children.push(newResult.owner);
    for (const node of newResult.nodes) {
      adapter.before(anchor, node);
    }
    currentResult = newResult;
  };

  if (getRenderMode() === "ssr") {
    // SSR：同步渲染初始内容，内容节点通过返回值传递
    renderBranch();
    const contentNodes = currentResult ? currentResult.nodes : [];
    return [anchor, ...contentNodes];
  }

  // 客户端：推迟到 onMount
  onMount(() => renderBranch());
  use(value, () => renderBranch());

  return [anchor];
}
```

## 三、自定义指令配合

### 3.1 问题

控制流组件只返回锚点注释节点，内容节点不在返回值中。当指令包裹控制流组件时，指令收到的宿主元素（`el`）是锚点注释节点，而非实际内容元素。指令无法对注释节点应用动画或其它视觉效果。

### 3.2 场景分析

#### ❌ 不推荐：指令包裹控制流组件

```tsx
<FadeIn>
  <Show value={visible}>{Primary}</Show>
</FadeIn>
```

**行为**：`FadeIn` 指令函数接收的 `el` 是 Show 返回的锚点注释节点。注释节点没有样式，`animate(el, ...)` 对它无效。进入动画不会播放。

**原因**：指令模式遍历 children 中的节点，Show 返回的是 `[anchor]`（注释节点），而非内容元素。

#### ✅ 推荐：控制流组件包裹指令

```tsx
<Show value={visible}>
  {() => (
    <FadeIn>
      <div>内容</div>
    </FadeIn>
  )}
  {() => (
    <FadeIn>
      <div>备选</div>
    </FadeIn>
  )}
</Show>
```

**行为**：`FadeIn` 指令作为子组件的内部实现细节。Show 调用 `h(Primary)` 渲染子组件，`Primary` 内部调用 `h(FadeIn, null, div)`，指令正常接收 `<div>` 元素。指令的 `onMount`/`onUnmount` 注册到 `Primary` 的 Owner，随子组件一起创建和销毁。进入动画在内容出现时播放，退出动画在内容消失时播放。

#### ✅ 正常：Each 条目中使用指令

```tsx
<Each value={items} keyed={(item) => item.id}>
  {({ item }) => (
    <FadeIn>
      <li>{item().text}</li>
    </FadeIn>
  )}
</Each>
```

**行为**：每个条目都是一个包含指令的组件。Each 为每个条目调用 `h(ItemComponent, { item, index })`，正常处理指令的生命周期。条目的进入动画在条目挂载时播放，退出动画在条目被移除时通过 `disposeOwner` 触发。

#### ✅ 正常：指令与控制流组件并列

```tsx
<FadeIn>
  <div>静态内容</div>
</FadeIn>
<Show value={visible}>
  {Primary}
</Show>
```

**行为**：两者各自独立，互不影响。指令作用于静态 `<div>`，Show 独立管理自己的内容。

### 3.3 总结

| 场景                 | 是否正常工作 | 说明                                         |
| -------------------- | ------------ | -------------------------------------------- |
| 指令包裹控制流组件   | ❌ 不推荐    | 指令收到的 `el` 是锚点注释节点，不是内容元素 |
| 控制流组件包裹指令   | ✅ 推荐      | 指令作为子组件内部实现，生命周期随子组件管理 |
| Each 条目中使用指令  | ✅ 正常      | 每个条目独立管理指令生命周期                 |
| 指令与控制流组件并列 | ✅ 正常      | 两者各自独立，互不影响                       |

## 四、结论

控制流组件的“只返回锚点”和“依赖 `onMount`”设计，在 SSR 和自定义指令配合场景下需要特殊处理。SSR 模式下，初始内容必须在组件函数中同步渲染并通过 `result.nodes` 返回。指令配合场景下，指令应放在控制流组件内部（作为子组件的实现细节），而非包裹控制流组件。这些限制不是设计缺陷，而是控制流组件“无宿主元素”特性的自然结果，与 Kiaao 的指令设计理念一致——指令附加行为到具体的 DOM 元素，而不是逻辑容器。
