# Owner 链断裂问题：当控制流组件遇上无 Owner 的 DOM 树

## 背景

控制流组件 `<Show>`、`<Case>`、`<Each>` 是独立组件，通过 `h(Component)` 创建。
它们的 Owner 需要被 `triggerMount` 可达，`onMount` 回调才能触发初始渲染。

问题出现在控制流组件嵌套在 DOM 元素内时：

```tsx
<nav>
  <section>
    <Each value={items}>{Item}</Each>
  </section>
</nav>
```

编译为：

```js
h(Root, null, h("nav", null, h("section", null, h(Each, { value: items }, Item))));
```

每个 `h()` 返回一个 `HResult`，Owner 链传递如下：

```
RootComponent()
  └── h("nav", ...)        → HResult { owner: null, nodes: [navEl] }
       └── h("section", ...)
            └── h(Each, ...) → HResult { owner: eachOwner, nodes: [anchor] }
                 └── eachOwner.onMount(sync)
```

关键断裂点：`h("section")` → `handleDomMode` → `processChildren`。

`processChildren` 对 HResult 只提取 `nodes` 和 `cleanups`，**丢弃了 `child.owner`**。
`handleDomMode` 自身也没有 Owner（`createHResult(null, [el])`）。

最终 `eachOwner` 在 Owner 树中孤立，`triggerMount` 无法到达，`sync` 永不执行。

## 当前修复方案：让 DOM 元素拥有 Owner

```ts
// h.ts — handleDomMode
function handleDomMode(tag, props, children) {
  const owner = createOwner(); // + 创建 Owner
  const el = adapter.createElement(tag);
  owner.elements.add(el); // + 元素注册到 Owner
  const { nodes, cleanups } = processChildren(children, owner); // + 传入 owner
  // ...
  return createHResult(owner, [el]); // HResult 带上 Owner
}
```

```ts
// process-children.ts
export function processChildren(children, parentOwner?) {
  // ...
  if (isHResult(child)) {
    if (child.owner && parentOwner) {
      parentOwner.children.push(child.owner); // + 连接子 Owner
      child.owner.parent = parentOwner;
    }
    nodes.push(...child.nodes);
    // ...
  }
}
```

Owner 树变为：

```
rootOwner → rootComponentOwner → navOwner → sectionOwner → eachOwner → sync()
```

## 这意味着什么

### Owner 树与 DOM 树 1:1 映射

以前：Owner 树只包含组件（`handleComponent` 创建的 Owner），DOM 元素没有 Owner。

```
组件 Owner (Root)
  └── 组件 Owner (Each)
       └── 组件 Owner (MenuItem)
```

现在：每个 `<div>`、`<section>`、`<nav>` 都有一个 Owner。

```
组件 Owner (Root)
  └── DOM Owner (nav)
       └── DOM Owner (section)
            └── 组件 Owner (Each)
                 └── 组件 Owner (MenuItem)
```

### 这实质上是 VDOM，但没有 VDOM 的灵活性

| 特性                 | VDOM                              | 当前 Owner 树              |
| -------------------- | --------------------------------- | -------------------------- |
| 节点类型             | 虚拟节点（VNode）                 | Owner 对象                 |
| 树结构               | 1:1 映射 DOM                      | 1:1 映射 DOM               |
| 可替换渲染器         | ✅ 轻松切换（React→React Native） | ❌ Owner 和 DOM 强耦合     |
| 跨层级 diff          | ✅ Fiber 可暂停/中断              | ❌ 无 diff 能力            |
| 节点没有额外心智负担 | ❌ VNode 需要理解                 | ❌ Owner 需要理解          |
| 轻量                 | ❌ 每个 DOM 节点一个 VNode        | ❌ 每个 DOM 节点一个 Owner |

本质上——如果每个 DOM 元素都有 Owner，那 Owner 树就等于一个 VDOM 树。但我们没有 VDOM 的 diff/fiber/reconciliation 能力，反而背上了 Owner 的额外开销（`elements` 双重跟踪、`disposeOwner` 冗余递归、`triggerMount` 深层遍历）。

### 双重跟踪问题

当前修复下，一个 DOM 元素会被加到两个 Owner 的 `elements` 集：

1. `handleDomMode` 创建的 DOM Owner：`domOwner.elements.add(el)`
2. `handleComponent` 的 `mergeResults`：`componentOwner.elements.add(el)`

```ts
// handleComponent 中
const nodes = mergeResults(result, owner);
nodes.forEach((n) => owner.elements.add(n)); // el 也被加到这里
```

`disposeOwner` 时：

```
disposeOwner(componentOwner)
  ├── disposeOwner(domOwner)         → adapter.remove(el)  // 第一次移除
  └── adapter.remove(el) from componentOwner.elements      // 第二次移除（无操作）
```

虽然安全（`parentNode?.removeChild` 短路），但语义上不干净——同一个元素属于两个 Owner。

### 组件函数内的控制流也有同样问题

```tsx
function MyComponent() {
  return (
    <div>
      <Show value={visible}>{() => <span>hi</span>}</Show>
    </div>
  );
}
```

这里 `<Show>` 在 `MyComponent` 的函数体内调用。`MyComponent` 由 `handleComponent` 管理。`h(Show, ...)` 返回 `HResult { owner: showOwner, nodes: [anchor] }`。

`MyComponent` 返回 `h("div", null, showHResult)` → `handleDomMode("div", ...)`。

在旧方案中（无 DOM Owner），`showOwner` 同样被孤立。修复后有了 `divOwner` 作为桥梁，`showOwner` 被连接。

但 `h("div", ...)` 是 `MyComponent` 返回值的 **第一层**，它被 `mergeResults` 处理。`mergeResults` 也**没有连接 owner**（它只处理 `result.owner`，而 `h("div")` 的 owner 在修复前是 null，修复后是 `divOwner`）。

所以修复之前，连 `divOwner` 都连不上组件树的——只不过 `div` 没有 `onMount`，不依赖 `triggerMount`，所以没出问题。控制流组件因为有 `onMount`，才暴露了这个根本问题。

## 替代方案分析

### 方案一：保持当前修复（DOM 元素有 Owner）

优点：

- 改动最小（两处修改）
- Owner 链完整，`triggerMount` 可到达所有组件
- 逻辑简单直观

缺点：

- 每个 DOM 节点多一个 Owner 对象
- Owner `elements` 双重跟踪
- 相当于 VDOM 的成本但没有 VDOM 的收益
- DOM 元素不需要 `mountCallbacks`、`unmountCallbacks`、`cleanups`，但 Owner 结构体仍然携带这些字段

### 方案二：控制流组件内联初始渲染（不依赖 triggerMount）

```ts
export function Show(props, context) {
  const anchor = initAnchor(context.owner, "show");
  const [primary, fallback] = normalizeChildList(props.children);
  let currentBranch: HResult | null = null;
  let currentNodes: HostNode[] = [];

  // ── 初始渲染：同步内联 ──
  const render = () => {
    // 清理旧分支
    if (currentBranch) {
      disposeOwner(currentBranch.owner!);
      currentBranch = null;
    }
    // 清除旧节点
    for (const n of currentNodes) adapter.remove(n);
    currentNodes = [];

    // 渲染新分支
    if (toValue(props.value)) {
      currentBranch = h(primary);
      currentBranch.owner!.parent = context.owner; // + 连接 Owner
      context.owner.children.push(currentBranch.owner!);
      currentNodes = currentBranch.nodes;
    }
    // 节点插入锚前
    for (const n of currentNodes) adapter.before(anchor, n);
  };

  render(); // 初始同步渲染，此时 anchor 已在 DOM 中吗？

  // 更新
  subscribeSignal(context.owner, props.value, render);

  return createHResult(null, [anchor]);
}
```

但这里有一个致命问题：**`render()` 在组件函数体内执行时，anchor 还没有被 append 到 DOM**。

`Show()` 返回 `createHResult(null, [anchor])`。这个 HResult 会被上层的 `processChildren`/`handleComponent` 处理。只有处理完后，anchor 才被 append 到父元素。所以 `adapter.before(anchor, node)` 在组件函数体内执行时 anchor 没有父节点——插入无效。

### 方案三：反转返回顺序——内容在前，锚在后

如果 Show 返回 `[contentNodes..., anchor]`，父元素会按顺序 append：

```html
<section>
  <span>content</span> ← content node
  <!--show-->
  ← anchor（最后）
</section>
```

之后更新时 `adapter.before(anchor, newContent)` 在锚前插入新内容。

```ts
export function Show(props, context) {
  const anchor = initAnchor(context.owner, "show");
  const [primary, fallback] = normalizeChildList(props.children);
  let currentBranch: HResult | null = null;

  const render = () => {
    if (currentBranch) disposeOwner(currentBranch.owner!);
    if (toValue(props.value)) {
      currentBranch = h(primary);
      // 连接 Owner 到 context.owner
      // ...
    }
    // 不需要 before 插入——render 在同步阶段不操作 DOM
  };

  // 初始渲染：同步产生内容节点，和 anchor 一起返回
  if (toValue(props.value)) {
    currentBranch = h(primary);
    currentBranch.owner!.parent = context.owner;
    context.owner.children.push(currentBranch.owner!);
    subscribeSignal(context.owner, props.value, render);
    return createHResult(null, [...currentBranch.nodes, anchor]);
  } else {
    subscribeSignal(context.owner, props.value, render);
    return createHResult(null, [anchor]);
  }
}
```

问题解决了吗？锚在 DOM 中时内容已经在它前面了（因为 append 顺序是先内容后锚）。

**更新时**的 `render()` 需要 `adapter.before(anchor, newNode)`——此时 anchor 已在 DOM 中，`before` 有效。

**但更新时还需要删除旧节点**——`disposeOwner` 已经处理了（移除旧节点 DOM）。

不过还有一个问题：`processChildren` 处理多个 HResult 返回时，`isHResult(child)` 分支提取节点但不连接 `child.owner`。`Show` 返回 `[...contentNodes, anchor]`——这些节点被提取后其 owner 还是丢失了。

**但这次 owner 不是 Show 自己的 Owner（它是 context.owner），而是 primary 的 Owner**。Show 没有可靠的方式把 primary 的 Owner 传给上层。

如果是这样，**需要在 `processChildren` 或 `mergeResults` 中连接 HResult 的 owner，不管控制流组件用什么方式返回内容节点**。这个连接问题不会因为渲染时机而消失。

## 本质问题

```
控制流组件 = 组件函数
组件函数 = h() 调用
h() 返回 HResult { owner, nodes }
HResult 被 processChildren 处理 → owner 被丢弃 → Owner 链断裂
```

**Owner 链断裂是 `processChildren` 丢弃 `child.owner` 导致的，不取决于渲染时机。**

也就是说，无论用 `onMount` 还是同步内联渲染，只要控制流组件通过 `h()` 创建子组件，这些子组件的 Owner 就需要一个机制被连到 Owner 树。

## 再思考：Owner 链的本质用途

Owner 链目前有两个用途：

1. **`triggerMount` 遍历**——触发所有组件的 `onMount`
2. **`disposeOwner` 遍历**——递归销毁子 Owner

如果组件没有 `onMount`、没有子组件需要 dispose，它们的 Owner 不需要在链上。

但我们无法预先知道一个组件会不会有 `onMount`——它是组件内部私有行为。Show/Each 有 `onMount`（`sync`/`renderBranch`）。MenuItem 没有 `onMount`，但它的子组件（Link → a）可能有。

所以保守做法是：**所有通过 `h()` 创建的组件 Owner 都应该被连接**。连接的方式是：谁持有这个 HResult，谁就负责连接 Owner。

## 连接点的选择

| 连接点            | 说明                                 | 问题                               |
| ----------------- | ------------------------------------ | ---------------------------------- |
| `processChildren` | 处理 HResult 时连接 owner 到父 Owner | 需要父 Owner（DOM 元素无 Owner）   |
| `mergeResults`    | 合并组件结果时连接                   | 只处理一层，嵌套的 HResult 被跳过  |
| `handleDomMode`   | DOM 元素创建 Owner                   | DOM 元素有 Owner = VDOM 等效       |
| `adoptBranch`     | 控制流组件创建子分支时连接           | 已经做了，只差 triggerMount 到不了 |

## 开放问题

1. **DOM 元素有 Owner 是否可接受？** 这是最直接的修复，但代价是 Owner 树变成 VDOM 树的等效物。

2. **是否有办法只连接「需要 triggerMount 的组件 Owner」，而不给 DOM 元素加 Owner？** 需要一个自定义的「连接点」而非整体方案。

3. **如果 Owner 树必须与 DOM 树 1:1，Owner 还有什么存在意义？** 是否可以把 Owner 合并到 HResult 或 DOM 节点本身？

4. **`processChildren` 是否应该成为 owner 连接的唯一关口？** 如果是，它需要一个总是有值的 `parentOwner` 参数——谁来提供？

5. **`mergeResults` 目前只在 `handleComponent` 中调用。如果 `handleDomMode` 也有 Owner，`mergeResults` 也要处理 DOM 元素的 `children` 吗？** 还是说 DOM 元素的 Owner 只用于连接子组件，不参与 mergeResults 的递归？

---

**核心追问**：如果最终每个 DOM 节点都有一个 Owner，这个 Owner 比 VNode 多了什么，少了什么？是否可以退一步，重新审视是否需要 `triggerMount` 这个机制来完成控制流组件的初始渲染？
