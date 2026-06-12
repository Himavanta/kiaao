# DOM 节点多实例共享 — 改造方案

**状态**：定稿
**关联**：kiaao v4.1 生命周期与组件模型
**背景**：参见《组件 Context 与异步组件规范 v3.2》

## 一、问题起源

### 1.1 发现过程

在实现 Teleport 组件时发现：当 `h(Comp)` 调用且 `Comp` 内部返回 `h(Teleport, ...)` 的结果时，框架的组件模式会无条件覆盖返回值节点上的 `INSTANCE_KEY` 和 `DISPOSE_KEY`，导致 Teleport 的清理回调丢失。

### 1.2 根本原因

当前框架假设：每个 DOM 节点最多属于一个组件实例。`INSTANCE_KEY` 和 `DISPOSE_KEY` 是节点上的单值属性——一个节点只能存一个实例引用和一个销毁回调。

这一假设在以下场景中被打破：

- 逻辑包装组件（wrapper component）直接返回子组件的 `h()` 调用结果
- Teleport 等内置组件返回的占位节点
- 高阶组件模式

在这些场景中，多个组件实例需要共享同一个 DOM 节点。但框架的“单值覆盖”行为导致只有最后一个写入者的实例关联被保留，前面的全部丢失。

### 1.3 核心矛盾

Vue/React 等框架中，逻辑包装组件（如 `<Transition>`、`<KeepAlive>`、`<Provider>`、高阶组件）是常见且合理的设计模式。这些组件的本质是：多个组件实例共享同一个 DOM 输出。框架应该支持这种模式，而不是通过额外包裹来规避问题。

## 二、方案探索与决策

### 2.1 讨论过的方案

#### 方案 A：全局包裹透明节点

为每个组件包裹一层 `<div style="display: contents">`，实例元数据在包裹上，返回内容作为子节点。

**否决原因**：DOM 层级翻倍，深层嵌套时严重影响 DOM 简洁性。违背 kiaao 追求 DOM 直观性的设计哲学。Vue/React 的逻辑包装组件不需要为每个组件都引入包裹。

#### 方案 B：组件实例持有 DOM

反转当前关系——组件实例持有它“拥有”的 DOM 节点引用，卸载时从实例出发找到 DOM。

**否决原因**：需要引入“组件实例树”概念（组件实例之间的父子关系追踪），彻底改变当前 DOM 驱动的生命周期模型。`disposeNode` 的递归路径会断裂。这是架构级的重构，适合作为未来水合架构探索的一部分，但不适合现在为了解决共享节点问题而仓促引入。

#### 方案 C：检测占用后包裹

在 `h()` 组件模式中检测返回值是否已有 `INSTANCE_KEY`/`DISPOSE_KEY`，若有则包裹。与方案 A 的区别是：只在冲突时包裹，正常路径不包裹。

**否决原因**：本质上仍然是“包裹”思路。虽然只影响冲突场景，但仍然是治标不治本。一个更好的方案应该让多实例共享节点成为原生能力。

#### 方案 D（采纳）：DOM 节点上的 Key 从单值变为 Set

`node[INSTANCE_KEY]` 从 `ComponentInstance` 变为 `Set<ComponentInstance>`
`node[DISPOSE_KEY]` 从 `() => void` 变为 `Set<() => void>`

允许多个组件实例追加到同一个 DOM 节点上，不覆盖、不冲突。卸载时遍历 Set 执行所有清理函数。

#### 方案 E（考虑过但未采纳）：全局映射表

用全局 `WeakMap<Node, ComponentInstance[]>` 来维护节点到实例的映射。

**否决原因**：

- 引入全局状态，与 kiaao 的模块化原则相悖
- 孤岛水合架构中可能需要独立的映射范围，全局池会形成阻碍
- Set 挂在 DOM 节点上，是局部数据，与当前架构完全兼容

### 2.2 最终决策

**采用方案 D（Set 叠加）。**

理由：

- 改动范围最小：仅修改 `INSTANCE_KEY`/`DISPOSE_KEY` 的读写方式
- 不引入全局状态：Set 挂在 DOM 节点上，节点被 GC 时 Set 一起释放
- 不改变 DOM 结构：不引入任何额外包裹元素
- 向后兼容：单实例场景下 Set 中只有一个元素，行为完全一致
- 孤岛水合友好：节点上的 Set 是局部数据，不需要全局协调

## 三、核心改造

### 3.1 数据结构变化

**旧：**

```ts
node[INSTANCE_KEY] = instance; // ComponentInstance
node[DISPOSE_KEY] = createDisposeFn(instance); // () => void
```

**新：** 引入 `attachInstance(node, instance)` 辅助函数统一处理：

```ts
function attachInstance(node, instance) {
  if (!node[INSTANCE_KEY]) {
    node[INSTANCE_KEY] = new Set();
    node[DISPOSE_KEY] = new Set();
  }
  node[INSTANCE_KEY].add(instance);
  node[DISPOSE_KEY].add(createDisposeFn(instance));
}
```

### 3.2 `h()` 组件模式改造

```ts
if (typeof tag === "function") {
  const instance = createComponentInstance();
  const context = buildContext(instance);
  const result = tag(props, context);

  if (result instanceof Promise) {
    // 异步组件（不变，wrapper 不设 INSTANCE_KEY）
    const wrapper = createElement("div");
    wrapper.style.display = "contents";
    wrapper[DISPOSE_KEY] = new Set();
    wrapper[DISPOSE_KEY].add(createDisposeFn(instance));

    let disposed = false;
    instance.unmountCallbacks.push(() => {
      disposed = true;
    });

    result
      .then((realDOM) => {
        if (disposed) return;
        if (!(realDOM instanceof Node)) {
          if (__DEV__)
            console.warn("[kiaao] async component resolved with non-Node value:", realDOM);
          realDOM = createComment("async component resolved with invalid value");
        }
        wrapper.appendChild(realDOM);
        triggerMount(realDOM);
        if (!instance[INITIALIZED_KEY]) {
          instance[INITIALIZED_KEY] = true;
          instance.mountCallbacks.forEach((fn) => safeCall(fn, "onMount"));
        }
      })
      .catch((err) => {
        if (disposed) return;
        console.error("[kiaao] async component error:", err);
      });
    return wrapper;
  } else {
    // 同步组件
    if (result instanceof Node) {
      attachInstance(result, instance);
    } else {
      // 非 Node 降级
      const placeholder = createComment("component returned invalid value");
      attachInstance(placeholder, instance);
      return placeholder;
    }
    return result;
  }
}
```

### 3.3 `triggerMount` 改造

**旧：** 遇到带 `INSTANCE_KEY` 的节点，触发该实例的 `mountCallbacks`。

**新：** 遍历 `INSTANCE_KEY` Set 中的所有实例，逐个触发各自的 `mountCallbacks`。

```ts
function triggerMount(node) {
  const instances = node[INSTANCE_KEY];
  if (instances) {
    instances.forEach((instance) => {
      if (!instance[INITIALIZED_KEY]) {
        instance[INITIALIZED_KEY] = true;
        instance.mountCallbacks.forEach((fn) => safeCall(fn, "onMount"));
      }
    });
  }
  // 递归子节点
  for (const child of node.childNodes) {
    triggerMount(child);
  }
}
```

**触发顺序说明**：Set 的迭代顺序等于插入顺序。在共享节点的场景下，内层组件先插入 Set，外层组件后插入。因此 `triggerMount` 遍历 Set 时，内层组件的 `onMount` 先于外层组件触发。这与同步组件的“父先于子”顺序不同，但对于“逻辑包装组件共享子组件 DOM 输出”的场景，这是更合理的顺序——内容先就位，包装后确认。

### 3.4 `disposeNode` 改造

**旧：** 遇到带 `DISPOSE_KEY` 的节点，执行该清理函数。

**新：** 遍历 `DISPOSE_KEY` Set 中的所有清理函数，逐个执行。执行后清空 `DISPOSE_KEY` 和 `INSTANCE_KEY` 两个 Set。

```ts
function disposeNode(node) {
  // 先递归子节点
  for (const child of node.childNodes) {
    disposeNode(child);
  }
  // 清理 LOCAL_EFFECTS
  const effects = node[LOCAL_EFFECTS];
  if (effects) {
    effects.forEach((stop) => stop());
    effects.clear();
  }
  // 清理所有关联的组件实例
  const disposeFns = node[DISPOSE_KEY];
  if (disposeFns) {
    disposeFns.forEach((fn) => fn()); // fn 内部有 DISPOSED_KEY 守卫
    disposeFns.clear();
  }
  // 清理 INSTANCE_KEY（释放实例引用）
  const instances = node[INSTANCE_KEY];
  if (instances) {
    instances.clear();
  }
}
```

### 3.5 `createDisposeFn` 不变

每个 `createDisposeFn(instance)` 使用 `DISPOSED_KEY` 守卫防止重复执行。

```ts
function createDisposeFn(instance) {
  return () => {
    if (instance[DISPOSED_KEY]) return;
    instance[DISPOSED_KEY] = true;
    instance.unmountCallbacks.forEach((fn) => safeCall(fn, "onUnmount"));
  };
}
```

## 四、场景验证

### 4.1 Teleport 包裹场景

```js
function Comp() {
  return h(Teleport, { to: "#target" }, "content");
}
```

DOM 结构：

```
Comment 节点
  INSTANCE_KEY = Set { Comp的实例, Teleport的实例 }
  DISPOSE_KEY  = Set { Comp的清理函数, Teleport的清理函数 }
```

卸载 Comp 时：

1. `disposeNode(Comment)` 遍历 `DISPOSE_KEY` Set
2. 执行 Comp 的清理函数 → 执行 `onUnmount` 回调 → `DISPOSED_KEY` 标记
3. 执行 Teleport 的清理函数 → 执行 Teleport 的 `onUnmount` → 清理目标容器中的内容
4. 两个清理都完整执行，无泄漏

### 4.2 逻辑包装组件

```js
function Inner() {
  return h("div", null, "inner");
}
function Outer() {
  return h(Inner); // 直接返回 Inner 的根节点
}
```

Inner 的 `<div>` 上：

```
INSTANCE_KEY = Set { Inner的实例, Outer的实例 }
DISPOSE_KEY  = Set { Inner的清理函数, Outer的清理函数 }
```

卸载时两个实例都被清理。`triggerMount` 时 Inner 先触发（先插入 Set），Outer 后触发。

### 4.3 单实例正常场景

```js
function App() {
  return h("div", null, "app");
}
```

App 的 `<div>` 上：

```
INSTANCE_KEY = Set { App的实例 }
```

行为与旧版完全一致。`triggerMount` 遍历 Set（一个元素），`disposeNode` 遍历 Set（一个元素）。

## 五、影响范围

| 场景                       | 受影响？                                 | 说明 |
| -------------------------- | ---------------------------------------- | ---- |
| 普通单组件                 | 行为完全一致（Set 一个元素）             |      |
| 组件直接返回另一个组件     | ✅ 修复                                  |      |
| Teleport                   | ✅ 修复                                  |      |
| 异步组件 wrapper           | 不受影响（wrapper 不设 INSTANCE_KEY）    |      |
| when/each 创建和销毁的节点 | 不受影响（分支切换时整个子树被 dispose） |      |
| 组件返回非 Node 降级       | Set 初始化正常                           |      |
| setProps 响应式绑定        | 不受影响（走 LOCAL_EFFECTS）             |      |

## 六、对现有文档的影响

### 需要更新的文档

1. **框架规范 v4.1** — 第三节“组件模式”中的同步组件流程描述
2. **组件 Context 与异步组件规范** — 第五节“h() 中的实现细节”

### 需要更新的内容

- `INSTANCE_KEY` 和 `DISPOSE_KEY` 的挂载方式从“赋值”改为“调用 `attachInstance`”
- `triggerMount` 从“触发单个实例”改为“遍历 Set”，增加触发顺序说明
- `disposeNode` 从“执行单个清理函数”改为“遍历 Set 并清空”
- 内部标记表中的 `INSTANCE_KEY`/`DISPOSE_KEY` 描述从单值改为 Set

### 不需要更新的内容

- 生命周期 API（`onMount`/`onUnmount`）的行为完全不变
- `mount`/`unmount` 的用法不变
- 异步组件的 wrapper 机制不变（wrapper 上只有一个实例）
- 引导文档完全不受影响（引导文档不涉及内部实现细节）

## 七、设计哲学总结

这次改造体现了 kiaao 的一个核心权衡：**接受 DOM 节点上的数据结构复杂度增加（单值→Set），以换取 DOM 结构的简洁性（不需要包裹元素）和使用模式的灵活性（允许多实例共享节点）。**

这与 kiaao 的其他设计决策一脉相承：

- 放弃了虚拟 DOM，接受运行时直接操作 DOM
- 放弃了 Fragment 的零节点理想，接受 `display: contents` 容器的存在
- 放弃了单值实例关联，接受 Set 叠加的多实例共存

每一次都是在“机制简洁”和“使用直观”之间，选择后者。

**文档版本**：v1.1
**撰写日期**：2026年6月12日
**状态**：定稿
