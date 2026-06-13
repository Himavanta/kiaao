# 嵌套控制流组件 DOM 生命周期泄漏 —— 分析与修复方案讨论

## 背景

kiaao 是一个纯运行时、零虚拟 DOM 的响应式前端框架。其控制流组件 `Show` 和 `List` 目前通过 `DocumentFragment` 返回多根节点，以实现条件渲染和列表渲染而不产生额外 DOM 包装层。

在嵌套场景（`Show` 内嵌 `lazy` → 内嵌 `Show`）中，当外层 `Show` 切换分支时，内层组件的动态 DOM 节点未被正确清理，导致 DOM 泄漏。

---

## Bug 复现

### 环境

- `packages/example/src/router.tsx`：定义了两个路由 `/apps` 和 `/about`，均为 `lazy` 加载
- `packages/example/src/main.tsx`：将 `RouterView` 挂载到 `#app`

### 复现步骤

1. 访问 `/apps`
   - 命中路由，`lazy` 加载 `dashbord` 组件
   - dashbord 渲染 `<section>`（导航栏 + main 内容）
2. 导航到不存在的 `/expore`
   - 路由无匹配，`RouterView` 的 `Show` 切换到 `fallback`（404）
   - 预期：显示 `<div>404 Not Found</div>`
   - 实际：**同时显示** 404 内容和 dashbord 的导航 + main

### 截图或 DOM 片段

复现时 DOM 结构（导航到 `/expore` 后）：

```html
<div id="app">
  <!--show-->
  ← 外层 Show 锚点
  <div>404 Not Found</div>
  ← fallback（正确显示）
  <section class="h-full w-full bg-amber-300 flex flex-col">
    ← 泄漏！dashbord 内容
    <nav>...</nav>
    <main>main</main>
  </section>
</div>
```

---

## 根因分析

### 跟踪完整调用链

**阶段 1：首次渲染 `/apps`**

```
RouterView()
  → h(Show, props)                    // 组件模式
    → 创建 componentInstance_A        // 外层 Show 的实例
    → pushComponent(A)
    → Show(props) 运行
      → 创建 anchor_A (<!--show-->)
      → 创建 fragment_A (DocumentFragment)
      → fragment_A.appendChild(anchor_A)
      → effect(run_A) 创建并立即执行
        → when() = true (匹配 /apps)
        → children() = h(lazyDashbord, params)
          → 执行 LazyComponent(props)
            → 内部调用 h(Show_Inner, {when: () => Component() !== null, ...})
              → 创建 componentInstance_B       // 内层 Show 的实例
              → Show_Inner() 运行
                → 创建 anchor_B (<!--show-->)
                → 创建 fragment_B (DocumentFragment)
                → effect(run_B) 执行 → Component 未加载，渲染 <!--lazy-loading-->
                → return fragment_B
              → h() 将 INSTANCE_KEY / DISPOSE_KEY 挂在 fragment_B 上
              → return fragment_B
        → result = fragment_B
        → collectNodes(fragment_B) = [anchor_B, <!--lazy-loading-->]  ← ❶
        → 插入到 anchor_A 之后
        → branchNodes = [anchor_B, <!--lazy-loading-->]
    → h() 将 INSTANCE_KEY / DISPOSE_KEY 挂在 fragment_A 上
    → return fragment_A
```

**阶段 2：lazy 模块加载后**

```
setComponent(dashbord) → 触发 Show_Inner 的 effect(run_B) 重跑
  → removeBranch() 移除 <!--lazy-loading-->
  → 渲染 dashbord → 返回 <section>nav, main...</section>
  → collectNodes → [<section>]
  → 插入到 anchor_B 之后
  → branchNodes = [<section>]

DOM 结构：
  anchor_A (<!--show-->)      ← 外层 Show 锚点
  anchor_B (<!--show-->)      ← 内层 Show 锚点
  <section>...</section>      ← dashbord 内容（由内层 effect 动态插入）
```

**阶段 3：导航到 `/expore`（不存在的路由）**

```
setPath("/expore")
  → effect(run_A) 重跑
    → removeBranch()                                            ← ❷
      → disposeNode(anchor_B)
        → anchor_B 是 Comment 节点，childNodes = []
        → (anchor_B)[LOCAL_EFFECTS] → undefined
        → (anchor_B)[DISPOSE_KEY] → undefined                  ← ❸ 关键！
        → 无事发生，内层 Show 的 componentInstance_B 未被释放
      → anchor_B.removeChild()  // 只移除了评论节点本身
      → disposeNode(<!--lazy-loading-->) → 早已移除，无操作
    → when() = false (无匹配)
    → fallback() → <div>404 Not Found</div>
    → 插入到 anchor_A 之后
    → branchNodes = [<div>404 Not Found</div>]

结果 DOM：
  anchor_A (<!--show-->)
  <div>404 Not Found</div>     ← 正确
  <section>...</section>       ← 泄漏！
```

### 三条关键线索

| 编号 | 位置                       | 问题                                                            |
| ---- | -------------------------- | --------------------------------------------------------------- |
| ❶    | `collectNodes(fragment_B)` | 从 DocumentFragment 提取子节点后，fragment 被丢弃               |
| ❷    | `removeBranch()`           | 只操作 `branchNodes` 中的节点，不知道内层 effect 后来的动态插入 |
| ❸    | `disposeNode(anchor_B)`    | Comment 节点无 DISPOSE_KEY，无法寻到内层组件实例                |

### 本质：ownership 链断裂

```
DocumentFragment_B (带 INSTANCE_KEY/DISPOSE_KEY) ← 组件实例 B 在此
    ├── anchor_B (Comment)        ← 没有 INSTANCE_KEY/DISPOSE_KEY
    └── <!--lazy-loading-->       ← 没有 INSTANCE_KEY/DISPOSE_KEY
                                    （后被移除并替换为）
                                    <section>  ← 由内层 effect 动态插入，
                                                 外层 branchNodes 不知晓
```

`collectNodes` 把 `DocumentFragment` 拆散成独立子节点，但生命周期元数据（`INSTANCE_KEY`/`DISPOSE_KEY`）留在了 fragment 上。子节点成为没有身份的孤儿。

当外层 Show 试图通过 `disposeNode` 沿子节点链清理时，找不到通往组件实例 B 的路，内层组件泄漏。

### 更深层：碎片清理模型与动态插入的矛盾

`Show` 的 `branchNodes` 是一个**渲染时刻的快照**：

```ts
// 在 effect 渲染时记录
const nodes = collectNodes(result); // 此刻的快照
branchNodes = nodes;
```

后续任何由**内层 effect 对 DOM 的修改**（lazy 加载后内层 Show 的动态内容插入），`branchNodes` 都不知晓。当外层 Show 需要切换分支时，它只能用这个过时的快照来清理，遗漏了动态插入的内容。

这与 `List` 的处理方式不同——`List` 在 effect 中实时遍历 `anchor.nextSibling`，不依赖快照：

```ts
while (anchor.nextSibling) {
  const old = anchor.nextSibling;
  disposeNode(old);
  old.parentNode?.removeChild(old);
}
```

但 `List` 也有类似的问题：如果 `List` 本身被销毁（而非 rerender），它的 `onUnmount` 清理路径缺失。

---

## 讨论过的修复方案

### 方案一：最小侵入——向 fragment 子节点传播 DISPOSE_KEY

**改动内容：**

1. 在 `h()` 的组件模式中，当组件返回 `DocumentFragment` 时，将 `INSTANCE_KEY`/`DISPOSE_KEY` 传播到每个直接子节点
2. 递归展开嵌套 fragment
3. `Show`/`List` 注册 `onUnmount(() => removeBranch())`，确保组件被卸时清理自己产生的 DOM 节点

**优点：**

- 改动小，限制在 `h()` 和 `Show`/`List` 三处
- 不改变 DOM 输出结构
- 不影响用户代码
- 低回归风险

**缺点/隐患：**

- `onUnmount(removeBranch)` 才是真正解决问题的那一半；仅传播元数据不修 Show/List 的卸载，仍会泄漏
- 同一个 `createDisposeFn(instance)` 被挂到多个子节点上，`disposeNode` 对每个子节点触发一次 dispose（有 `DISPOSED_KEY` 守卫，但概念不干净）
- 需要递归处理嵌套 fragment
- 静态节点被挂上 DISPOSE_KEY 是语义污染——一个纯 `<div>` text node 持有 dispose 函数
- **List 场景仍然脆弱**：如果某个列表项也是 Show（返回 fragment），其 DISPOSE_KEY 需要通过 item wrapper 传播，而 List 当前遍历的是最终渲染后的真实 DOM 节点——传播链是否完整取决于具体 DOM 结构

#### 深入分析后的修正理解

经过逐场景追踪，发现传播策略不能简单「传播到所有子节点」，否则在 rerender 时产生误触：

**误触场景**：

```
fragment_B（内层 Show 的返回值，有 DISPOSE_KEY）
  ├── anchor_B (<!--show-->)      ← 如果也传播
  └── <!--lazy-loading-->          ← 如果也传播
```

当 lazy 加载后，内层 Show 的 effect rerender 时调用 `removeBranch()` → `disposeNode(<!--lazy-loading-->)` → 触发 DISPOSE_KEY → **误触发组件自身的销毁**。❌

`<!--lazy-loading-->` 只是一个临时占位节点，不应该通过它触发组件销毁。传播策略让它持有和组件根节点同样的 DISPOSE_KEY，导致「分支切换 rerender」和「组件销毁」两种不同语义撞车。

**修正方案**：只传播到 `fragment.childNodes[0]`（锚点），不传播到后续临时节点。但这是启发式策略（heuristic），依赖于「fragment.childNodes[0] 是永久锚点」的结构假设。

#### 维护这套方案需要保证的隐含规则

逐场景追踪后，归纳出传播方案要正确工作必须同时满足的约束：

| 编号 | 规则                                                        | 说明                                                                            |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ①    | 传播时不覆盖已有 `INSTANCE_KEY`                             | 否则子组件自身生命周期元数据被覆盖，泄漏                                        |
| ②    | 只传播到 `childNodes[0]`（锚点），不到其余子节点            | 否则 rerender 时 `disposeNode(临时节点)` 误触                                   |
| ③    | `Show` 必须注册 `onUnmount(removeBranch)`                   | 否则实例 dispose 时 DOM 没人清理                                                |
| ④    | `List` 必须注册 `onUnmount(while anchor.nextSibling)`       | 否则实例 dispose 时列表项没人清理                                               |
| ⑤    | 所有未来新增的控制流组件都必须记住规则 ③ 和 ④               | 框架作者的心智负担                                                              |
| ⑥    | Fragment 需特殊处理——已存在 `INSTANCE_KEY` 的子节点跳过传播 | 否则 `disposeNode(componentRoot)` 找到的是 Fragment 的 DISPOSE_KEY 而非子组件的 |
| ⑦    | 嵌套 fragment 需要递归传播                                  | 否则深层 fragment 的子节点不可达                                                |
| ⑧    | 上述任何一条规则的疏漏都导致静默泄漏                        | 没有编译时检查，没有运行时警告，诡异行为的来源                                  |

```
正确的生命周期 = 规则① ∧ 规则② ∧ 规则③ ∧ 规则④ ∧ 规则⑤ ∧ 规则⑥ ∧ 规则⑦ ∧ 规则⑧
```

任何一条为假，泄漏。

#### 场景覆盖验证

| 场景                                                  | 结果 | 说明                                                                    |
| ----------------------------------------------------- | ---- | ----------------------------------------------------------------------- |
| Show → lazy → Show（原始 bug）                        | ✅   | 锚点传播 DISPOSE_KEY + `onUnmount(removeBranch)` 补偿                   |
| Show 自身切换条件                                     | ✅   | rerender 时 dispose 的是内容节点（通常有自己的 DISPOSE_KEY 指向子组件） |
| List 数据变化 rerender                                | ✅   | while 遍历 `nextSibling`，内容节点无 List 自身的 DISPOSE_KEY            |
| List 被外层销毁                                       | ✅   | 锚点 DISPOSE_KEY → dispose List 实例 → onUnmount 清理列表项             |
| 多层嵌套 Show                                         | ✅   | 链式传播，层层拆卸                                                      |
| Fragment 在 Show 中                                   | ✅   | 有 INSTANCE_KEY 的子节点被跳过传播，各自独立                            |
| Portal                                                | ✅   | 返回单节点，无 fragment；内容通过 onUnmount 管理                        |
| 组件首次调用返回空 fragment（无子节点），后续动态添加 | ❌   | childNodes 为空，传播无处附着；动态添加的节点不在 branchNodes 中        |
| 用户自定义组件返回非常规结构 fragment（首节点非锚点） | ⚠️   | 依赖 heuristic，违反假设时可能误触                                      |
| Show/List 绕过 `h()` 被直接调用                       | ⚠️   | 不经过 `h()` 组件模式，INSTANCE_KEY 不会被传播                          |

### 方案二：强制所有组件返回单根节点

**改动内容：**

- Show 不再返回 DocumentFragment，改为返回包装元素
- List 同理
- Fragment / `<></>` 也返回包装元素或彻底弃用
- 框架约束：所有组件必须返回单根节点

**优点：**

- `INSTANCE_KEY`/`DISPOSE_KEY` 在真实 DOM 元素上，`disposeNode` 递归 `childNodes` 可抵达
- 生命周期链天然完整

**缺点/隐患：**

- **List 在语义 HTML 中破坏结构**：`<ul><span><li>...</li></span></ul>` 中 `<span>` 不是 `<ul>` 合法子元素，违反 HTML 规范
- **CSS 选择器被破坏**：`:first-child`、`nth-child`、相邻兄弟 `+`、`~` 等全因中间层改变行为
- `display: contents` 不能解决语义问题，只能解决视觉问题
- **IE 不兼容**（`display: contents`）
- 深度嵌套产生层级膨胀，DevTools 调试噪点多
- **用户代码约束：** breaking change，现有组件需全部修改

### 方案三：组件级动态节点注册

**改动内容：**

- 在 `ComponentInstance` 上新增 `childNodes: Set<Node>`
- Show/List 在 effect 渲染时将新节点注册到实例，卸载时注销
- `disposeNode` 除遍历 DOM 树外，还检查组件实例的注册节点

**优点：**

- 概念干净，不依赖 DOM 树结构
- 可覆盖所有动态插入场景

**缺点/隐患：**

- 架构变动大，需在 Show、List、Portal、甚至 `h()` 的 processChildren 等多处同步
- 组件实例与 DOM 节点的双向引用需要妥善管理，避免内存泄漏

### 方案四：链接列表（锚点范围）模型

**改动内容：**

- 不再依赖 `branchNodes` 快照
- 清理时从锚点 `anchor.nextSibling` 开始遍历到下一个已知锚点或末尾
- 引入锚点注册机制

**优点：**

- 真正解决根本问题，任意深度嵌套均有效
- 不需要关心谁动态插入了什么

**缺点/隐患：**

- 改动最大
- 需要建立锚点注册机制
- 可能涉及多处架构修改

### 方案五（深入讨论方向）：`as` 属性让组件本身就是指定原生元素

**改动内容：**

- Show/List 增加必选或可选的 `as` 属性
- `as` 指定该组件最终编译成什么原生 HTML 标签
- `as="div"` → Show 返回 `<div>`（内容作为子节点在其中）
- `<List as="ul">` → List 本身就是 `<ul>`，列表项是 `<ul>` 的直接子节点
- 多余的 props（`class`、`style`、`data-*` 等）自动透传

**生命周期追踪：**

```
<div class="router-outlet">      ← outer wrapper，有 DISPOSE_KEY
  <!--show-->
  <div>                           ← inner wrapper，有 DISPOSE_KEY
    <!--show-->
    <section>nav, main...</section>
  </div>
</div>
```

```
removeBranch() 时：
  disposeNode(inner wrapper div)
    → childNodes: [<!--show-->, <section>]
    → disposeNode(<section>) → 正常递归
    → 找到 DISPOSE_KEY(instance_B) → 释放内层 Show
      → inner Show 的 onUnmount → removeBranch
    → inner wrapper div 从父节点移除
```

✅ 生命周期链完整。

**优点：**

- **生命周期链天然完整：** 每个 Show/List 是真实 DOM 元素，`disposeNode` 递归 `childNodes` 必然经过
- **HTML 语义正确：** `<List as="ul">` → `<ul><!--list--><li>...</li></ul>` 完全合法
- **不需要 CSS hack：** 没有 `display: contents` 或额外包装层
- **Props 透传自然：** `<Show as="section" class="card">` → `class` 落到 `<section>` 上

**缺点/隐患：**

| 问题                         | 严重程度 | 说明                                                                      |
| ---------------------------- | -------- | ------------------------------------------------------------------------- |
| Fragment `<></>` 不支持 `as` | ⚠️ 中    | JSX `<></>` 语法不能传 prop，需废弃或默认改 `as="div"`                    |
| 全链路必须一致               | ⚠️ 中    | 链中任一处没用 `as`（保留 fragment）→ 从该点下游失效                      |
| 组合多个控制流时层级膨胀     | ⚠️ 低    | 每层 Show/List 产生原生标签，开发者可控                                   |
| 默认值设计                   | ⚠️ 中    | `as` 可选则不安全，必选则是 breaking change                               |
| Portal 不一致                | ⚠️ 低    | 当前返回单节点 `<!--portal-->`，可用 `onUnmount` 管理，与其他组件模式不同 |

---

### 方案六（深入讨论方向之二）：`when`/`each` 作为原生属性指令

**思路来源：** 如果说 `as` 的思路是「Show/List 本身就是指定原生标签」，那进一步推演——为什么不直接把控制逻辑作为原生元素的属性，彻底取消 Show/List 组件？

**改动内容：**

- `h()` 在创建元素时识别 `when` 和 `each` 作为保留 prop
- `when`：条件渲染——当 `when` 的值为 truthy 时渲染子节点，falsy 时移除子节点
- `each`：列表渲染——迭代数组生成子节点
- Show / List 组件不再作为框架核心 API 导出（或保留为底层兼容性封装）
- Fragment / `<></>` 废弃——所有组件必须返回单根

#### 语法示例

```tsx
// when：条件渲染
<section when={userLoggedIn}>
  <span>欢迎回来</span>
</section>

// each：列表渲染
<ul each={items} key={(item) => item.id}>
  {item => <li>{item.name}</li>}
</ul>

// 两者可共存于同一元素
<div when={dataReady} each={items} key={...} class="list">
  {item => <span>{item.label}</span>}
</div>
```

#### 生命周期追踪

以 `<section when={cond}>...</section>` 为例，`h()` 的实现抽象：

```
1. 创建 <section>
2. 挂 INSTANCE_KEY / DISPOSE_KEY 在 <section> 上
3. 创建 componentInstance（管理 when 行为的生命周期）
4. 创建 effect → 监听 cond
   → cond = true：子节点 append 到 <section>
   → cond = false：子节点从 <section> 中移除（dispose + removeChild）
5. 返回 <section>
```

核心变化：**内容从「锚点的兄弟节点」变成了「宿主元素的子节点」**。

```
// before：Show 的 DOM 结构（即使是 as 方案）
<section>
  <!--show-->            ← 锚点
  内容...              ← 锚点的兄弟节点，不是 section 的子节点
</section>

// after：when 作为原生属性
<section>
  内容...              ← section 的直接子节点
</section>
```

`disposeNode(section)` 递归 `childNodes` 可抵达所有动态内容。生命周期链完整。✅

以 `<ul each={items}>` 为例：

```
1. 创建 <ul>
2. 挂 INSTANCE_KEY / DISPOSE_KEY 在 <ul> 上
3. 创建 effect → 监听 items
   → 清空 <ul> 所有子节点（dispose + remove）
   → 为每个 item 创建 <li> 并 append 到 <ul>
4. 返回 <ul>
```

语义正确：`<ul>` 的直接子节点全是 `<li>`。生命周期链完整。✅

#### 对 Fragment 的影响

**这个方案要求废弃 Fragment，没有妥协空间。** 原因：

1. 如果保留 Fragment，`collectNodes` 提取子节点的动作仍然存在，`INSTANCE_KEY`/`DISPOSE_KEY` 丢失的场景可在任何使用 Fragment 的地方复现
2. 当控制流不再需要锚点 + 兄弟节点模式（改为宿主元素的子节点），Fragment 失去了唯一的存在意义
3. 框架不再产生多根，用户组件也不应多根——一致性约束

后果：

| 维度                | 影响                                             |
| ------------------- | ------------------------------------------------ |
| JSX `<></>`         | 不可用，语法不支持传 prop，也不应返回 fragment   |
| 自定义组件          | **必须返回单根节点**，可配合 TypeScript 类型约束 |
| 与 React 的心理模型 | 差异更大，React 用户习惯 Fragment → 需要适应     |
| 迁移成本            | 若现有代码返回多根 → 全部改为单根                |

#### `h()` 的职责变化

当前 `h()` 的逻辑：纯创建——创建元素、设置属性、添加子节点、返回。

加入 `when`/`each` 后，`h()` 变成**创建 + 控制流调度器**：

```ts
function h(tag, props, ...children) {
  // 保留 prop 提取
  const { when, each, key, ...rest } = props ?? {};

  if (when !== undefined) {
    return createWhenElement(tag, rest, children, when);
  }
  if (each !== undefined) {
    return createEachElement(tag, rest, children, each, key);
  }
  // 普通元素
  return createPlainElement(tag, rest, children);
}
```

这不是「错」，而是设计取向的改变——`h()` 从纯创建函数变成了「创建 + 控制流调度」。代价是 `h()` 内部复杂度上升。

#### `when` 的语义细节

**条件为 false 时宿主元素的行为：** 元素始终在 DOM 中，只切换子节点。

```tsx
<section when={showDetails} class="details">
  <p>详细内容</p>
</section>
```

- `showDetails = true`：`<section><p>详细内容</p></section>`
- `showDetails = false`：`<section></section>`

选择「元素始终在 DOM」而非「元素进出 DOM」的原因：

1. **`disposeNode` 路径明确**——对同一个 `<section>` 的引用始终有效，清理时父容器通过递归 childNodes 可达
2. **ref 引用不丢失**——`document.querySelector('section')` 始终能找到
3. **不需要锚点**——如果在条件切换时让元素进出 DOM，需要一个锚点来决定插入位置，锚点逻辑部分复现
4. **CSS `:empty` 可选控制样式**——空容器可以通过 `:empty` 伪类做视觉处理

**`else` 不需要**——如用户所述，`else` 由用户通过嵌套或 `!` 自行处理：

```tsx
<section when={hasData}>
  {() => <DataView />}
</section>
<section when={!hasData}>
  <p>暂无数据</p>
</section>
```

#### `each` 的语义细节

- `each` 接收响应式 getter `() => T[]` 或普通数组
- 每次变化时全量重建子节点（当前 `List` 的行为）
- 通过 `key` 函数做列表项标识（用于未来的节点复用优化）
- 列表项渲染函数接收 `(item, index)` 作为参数

```tsx
<ul each={items} key={(item) => item.id}>
  {(item, index) => <li data-index={index}>{item.name}</li>}
</ul>
```

#### 对 SSR 的影响

SSR 路径 `hSSR` 也需要识别 `when`/`each` 保留 prop：

```ts
function hSSR(tag, props, children) {
  if (props.when !== undefined) {
    return Boolean(props.when()) ? hSSR(tag, stripWhen(props), children) : ssr("");
  }
  if (props.each !== undefined) {
    const items = props.each();
    const key = props.key;
    let html = "";
    for (let i = 0; i < items.length; i++) {
      html += hSSR(tag, stripEach(props), [child(items[i], i)]).html;
    }
    return ssr(html);
  }
  // 正常 SSR 元素序列化
}
```

但这里需要注意：`each` 在 SSR 中对同一 `<ul>` 重复了多次（每个 item 一个 `<ul>`）。这不正确。**SSR 中 `each` 的宿主元素应只序列化一次，子节点在宿主元素内重复。** 这需要不同的序列化策略：

```ts
if (props.each !== undefined) {
  const items = props.each();
  // 先序列化宿主元素的开标签
  let html = `<${tag} ...属性...>`;
  // 再序列化子节点
  for (let i = 0; i < items.length; i++) {
    html += renderSSRChild(child(items[i], i));
  }
  // 再序列化闭标签
  html += `</${tag}>`;
  return ssr(html);
}
```

这对 `hSSR` 的架构影响较大——它不再能递归调用自身来序列化宿主元素加子节点，需要拆成开标签、子节点、闭标签三段式处理。

#### 对自定义组件的影响

`when`/`each` 只在原生元素上直接生效：

```tsx
// ✅ 原生元素
<section when={cond}>...</section>

// ❌ 自定义组件——语义未定义
<MyCard when={cond}>...</MyCard>
```

自定义组件的条件渲染需要用户在组件内部处理：

```tsx
function MyCard(props) {
  return <div when={props.cond}>{props.children}</div>;
}
```

或者通过类型约束在编译时报错。

#### 优点

- **生命周期链从根本上解决**——不需要传播元数据、不需要 `onUnmount` 补偿、不需要 `as` 链路保障。`disposeNode` 沿 DOM `childNodes` 递归即可抵达所有动态内容
- **HTML 语义彻底胜利**——`<ul each={items}>` 产生纯 `<ul><li>...</li></ul>`，没有任何额外包装层
- **API 更简洁**——`<section when={cond}>` 比 `<Show when={cond} as="section">{() => ...}</Show>` 少一层嵌套，少一个 `{() => ...}` 包装
- **没有二义性**——不会出现「链中某处忘记写 `as` 导致泄漏」的问题，因为 `when` 和 `each` 是原生属性，必须指定在某个元素上
- **没有外来物**——不引入 `display: contents`、`<template>` 等 hack

#### 缺点/隐患

| 问题                               | 严重程度 | 说明                                                                                    |
| ---------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `h()` 纯度受损                     | ⚠️ 中    | `h()` 从纯 DOM 创建函数变成「创建 + 控制流调度器」，内部复杂度上升                      |
| 自定义组件不能直接用 `when`/`each` | ⚠️ 中    | `when`/`each` 只在原生元素上直接生效；自定义组件需内部返回 `<div when={...}>`           |
| Fragment 必须废弃                  | ⚠️ 中    | JSX `<></>` 不可用，用户组件必须返回单根，与 React 生态差异加大                         |
| SSR 序列化难度增加                 | ⚠️ 中    | `each` 在 SSR 中需要「三段式」序列化（开标签 → 重复子节点 → 闭标签），无法递归调 `hSSR` |
| `h()` 中保留 prop 的过滤           | ⚠️ 低    | `when`/`each`/`key` 需要从 props 中剥离，不落入 DOM attribute                           |

#### 完整场景覆盖验证

基于以下实现假设逐场景追踪：

```ts
function h(tag, props, ...children) {
  const { when, each, key, ...rest } = props ?? {};

  if (when !== undefined) {
    return createWhenElement(tag, rest, children, when);
  }
  if (each !== undefined) {
    return createEachElement(tag, rest, children, each, key);
  }
  return createPlainElement(tag, rest, children);
}
```

- `createWhenElement`：创建宿主元素 → 挂 DISPOSE_KEY → effect 监听 `when` → true 时 appendChild / false 时清空
- `createEachElement`：创建宿主元素 → 挂 DISPOSE_KEY → effect 监听 `each` → 清空 → 重建子节点
- 条件为 false 时宿主元素保留在 DOM 中，只切换子节点

**场景 1：原始 bug（RouterView → lazy → dashbord）**

```tsx
// RouterView 内部
<div when={() => matchRoutes(routes, currentPath()) !== null}>{() => h(lazyDashbord, params)}</div>
```

Phase 1（lazy 未加载）→ Phase 2（lazy 加载，dashbord 插入 `<section>`）→ Phase 3（导航到 `/expore`，when 为 false）：

```
disposeNode(<div-outer>)
  → 递归 childNodes → [<div-inner>]
    → 递归 childNodes → [<section>]
      → disposeNode(<section>) → DISPOSE_KEY_C → dispose
    → DISPOSE_KEY_B → dispose instance_B → stop inner when effect
  → 清空 <div-outer> 的 childNodes
```

最终 DOM：`<div-outer></div-outer>` ✅ 无泄漏

为什么能覆盖？`<section>` **是** `<div-inner>` 的 `childNodes` 成员。`disposeNode` 的递归路径天然覆盖。不需要传播、不需要 onUnmount 补偿。

**场景 2：when 自身切换条件**

```tsx
<section when={showDetails}>
  <p>详细内容</p>
</section>
```

- `true` → `<section><p>...</p></section>`
- `false` → 清空 childNodes → `<section></section>`
- `true` → 重新渲染子节点

rerender 时清空 childNodes，调用 `disposeNode(oldChild)`。若 `<p>` 内有子组件，沿 childNodes 递归销毁。✅

**场景 3：each 数据变化 rerender**

```tsx
<ul each={items} key={(i) => i.id}>
  {(item) => <li>{item.name}</li>}
</ul>
```

- each effect 监听 items
- 变化时：清空 `<ul>` 所有 childNodes（dispose + remove）→ 重建
- `disposeNode(ul)` → 递归 childNodes → 所有 `<li>` 被递归处理 → 各 `<li>` 若内嵌组件，通过各自 DISPOSE_KEY 释放 ✅

**场景 4：List 在外层 when 中**

```tsx
<section when={showList}>
  <ul each={items} key={...}>
    {item => <li>{item.name}</li>}
  </ul>
</section>
```

- `showList = false` → section 清空 childNodes → `disposeNode(<ul>)` → 递归 ul 的 childNodes → 所有 `<li>` 销毁 → DISPOSE_KEY(ul) → dispose each effect
- `showList = true` → 重新渲染 `<ul>` → 重新创建 each effect

不依赖传播，不依赖 onUnmount。disposeNode 的自然递归路径。✅

**场景 5：多层嵌套 when**

```tsx
<div when={a}>
  <section when={b}>
    <article when={c}>
      <Content />
    </article>
  </section>
</div>
```

```
<div>      ← DISPOSE_KEY_A
  <section> ← DISPOSE_KEY_B
    <article> ← DISPOSE_KEY_C
      [Content] ← DISPOSE_KEY_D
    </article>
  </section>
</div>
```

`a = false` 时：

```
disposeNode(<div>)
  → 递归 childNodes → [<section>]
  → disposeNode(<section>)
    → 递归 childNodes → [<article>]
    → disposeNode(<article>)
      → 递归 childNodes → [Content]
        → DISPOSE_KEY_D → dispose
      → DISPOSE_KEY_C → dispose instance_C → stop when_c effect
    → DISPOSE_KEY_B → dispose instance_B → stop when_b effect
  → DISPOSE_KEY_A → dispose instance_A → stop when_a effect
```

childNodes 是天然的下钻路径。✅ 比传播方案干净的地方：**不需要担心「dispose 子节点时误触自身 dispose」，因为 dispose 的是 childNodes 中的节点，不是自身。**

**场景 6：when + each 同一元素**

```tsx
<div when={editable} each={fields} key={...}>
  {field => <input name={field.name} />}
</div>
```

两者共存时的语义需要明确定义。两种可能：

| 选项      | 行为                                         |
| --------- | -------------------------------------------- |
| when 优先 | when 为 false 时 each 不生效，清空全部子节点 |
| 独立并存  | when 和 each 独立作用，each 无条件重建       |

推荐「when 优先」：`when` 作为外层守卫控制宿主元素是否持有子节点，`each` 在内层决定子节点的具体内容。逻辑等价于 `<div when={editable}><div each={fields}>...</div></div>` 但少一层 DOM。

⚠️ 这个需要框架层面明确定义。

**场景 7：when 在 void 元素上**

```tsx
<br when={showBreak}>
```

void 元素不能有子节点，`when` 的契约是「切换子节点」，两者矛盾。

三种选择：

| 选项                    | 行为                                        | 问题                   |
| ----------------------- | ------------------------------------------- | ---------------------- |
| A：抛错/警告            | 编译时报错或运行时警告                      | 用户需要额外认知       |
| B：切换元素自身进出 DOM | `showBreak=true` 时 `<br>` 在 DOM，反之消失 | 需要锚点，回到锚点逻辑 |
| C：无操作，元素始终存在 | `when` 对 void 元素是空操作                 | 用户可能误以为有效     |

推荐选 A。用户应使用 CSS `display: none` 或条件渲染父元素。❌

**场景 8：each 在 void 元素上**

```tsx
<br each={items} key={...}>
  {item => ...}
</br>
```

同样矛盾——each 需要添加子节点，void 元素不能有子节点。应抛错。❌

**场景 9：自定义组件上的 when**

```tsx
// ❌ 不生效
<MyCard when={cond}>...</MyCard>;

// ✅ 用户在 MyCard 内部处理
function MyCard(props) {
  return <div when={props.cond}>{props.children}</div>;
}
```

`when`/`each` 只在原生元素上直接生效。自定义组件需要条件渲染时，内部返回一个带 `when` 的原生元素。这不是风险，是设计约定。✅ 但需要文档明确。

**场景 10：SSR**

`when` 在 SSR 中较简单：

```ts
if (props.when !== undefined) {
  return Boolean(props.when()) ? hSSR(tag, stripWhen(props), children) : ssr("");
}
```

`each` 在 SSR 中需要三段式序列化：

```
// 错误：递归 hSSR 会对每个 item 重复整个宿主元素
for (...) { html += hSSR(tag, props, [child(item)]).html; }

// 正确：宿主元素序列化一次，子节点在内部重复
html += `<${tag} ...属性...>`;
for (let i = 0; i < items.length; i++) {
  html += renderSSRChild(child(items[i], i));
}
html += `</${tag}>`;
```

可做到，但 `hSSR` 不再是简单线性的序列化。⚠️

**场景 11：Portal**

Portal 当前返回 `<!--portal-->` 单节点（不涉及 fragment），内容通过 `onUnmount` 管理。它已经是单根。指令方案不需要改变它的工作方式。

但一致性考虑：when/each 是原生属性，Portal 保持为组件调用，API 风格不一致。可接受，因为 Portal 做的事情本质不同（把内容移到另一个 DOM 位置）。

**覆盖总表**

| 场景                           | 结果   | 备注                                                            |
| ------------------------------ | ------ | --------------------------------------------------------------- |
| 原始 bug（Show → lazy → Show） | ✅     | disposeNode 沿 childNodes 递归直达，无传播/onUnmount 等补偿机制 |
| when 自身切换条件              | ✅     | effect 清空/重建 childNodes                                     |
| each 数据变化 rerender         | ✅     | each effect 清空/重建 childNodes                                |
| List 在外层 when 中            | ✅     | disposeNode(ul) → 递归 childNodes → 正确销毁                    |
| 多层嵌套 when                  | ✅     | childNodes 链式递归，不需要关心层级深度                         |
| when + each 同一元素           | ⚠️     | 需要定义两者共存的优先级（推荐 when 优先守卫）                  |
| when 在 void 元素              | ❌     | 设计决定：应抛错或警告                                          |
| each 在 void 元素              | ❌     | 应抛错                                                          |
| 自定义组件上的 when            | ⚠️     | 不自动生效，用户需在内层包裹原生元素                            |
| SSR when                       | ✅     | 条件判断后决定是否序列化子节点                                  |
| SSR each                       | ⚠️     | 需要三段式序列化，不能简单递归 hSSR                             |
| Portal                         | ✅     | 保持单根，不影响                                                |
| Fragment                       | 已废弃 | 不再存在                                                        |
| 深度嵌套性能                   | ✅     | 只有真实 DOM，没有额外包装层                                    |

## 各方案对比汇总（六方案完整版）

| 维度             | 一：传播元数据 + onUnmount | 二：强制单根            | 三：组件动态节点注册 | 四：链接列表模型 | 五：`as` 属性          | 六：`when`/`each` 指令       |
| ---------------- | -------------------------- | ----------------------- | -------------------- | ---------------- | ---------------------- | ---------------------------- |
| 生命周期链完整性 | ✅ 需 onUnmount 配合       | ✅                      | ✅                   | ✅               | ✅                     | ✅ 彻底解决                  |
| HTML 语义        | ✅ 无影响                  | ❌ List + \<ul\> 被破坏 | ✅ 无影响            | ✅ 无影响        | ✅ 指定合法标签        | ✅ 最佳（无额外层）          |
| 额外 DOM 层级    | 无                         | 每层 1 个               | 无                   | 无               | 每层 1 个（可控）      | 无                           |
| 对用户约束       | 无                         | 所有组件必须单根        | 无                   | 无               | 要求写 `as`            | 必须单根 + 废弃 Fragment     |
| 改动量           | 小                         | 中高                    | 中                   | 大               | 中                     | 中（`h()` + Show/List 重构） |
| 回归风险         | 低                         | 高                      | 中                   | 高               | 中                     | 中高（breaking change）      |
| Fragment 兼容    | ✅ 需做传播                | ❌ 需包装或弃用         | ✅                   | ✅               | ⚠️ `<></>` 不支持 `as` | ❌ 必须废弃                  |
| 列表语义场景     | ✅                         | ❌                      | ✅                   | ✅               | ✅                     | ✅                           |
| `h()` 纯度       | 保持                       | 保持                    | 保持                 | 保持             | 保持                   | ⚠️ 受损（兼做控制流）        |

---

## 方案一 vs 方案六：核心差异的客观对比

### 复杂度来源不同

- **方案一的复杂度来自「迁就一个不自然的 DOM 结构」**——内容与锚点是兄弟节点，不是父子关系。`disposeNode` 无法通过 `childNodes` 自然抵达动态内容，需要传播 + onUnmount 补偿来弥补。规则的数目（8 条）不是人为制造的，而是模型本身的问题数量。

- **方案六的简洁来自「让 DOM 结构自然反映逻辑关系」**——`<section when={cond}>内容</section>` 的 DOM 就是 `<section>内容</section>`。`disposeNode` 递归 `childNodes` 就是天然正确的。不需要传播、不需要 heuristic、不需要守卫。约束只有一条：**子节点在宿主元素的 childNodes 中**。

### 直观对比

```
方案一：正确的生命周期 = 规则① ∧ 规则② ∧ 规则③ ∧ ... ∧ 规则⑧
方案六：正确的生命周期 = 子节点在宿主元素的 childNodes 中
```

### 代码维护者视角

| 情境                    | 方案一                                                         | 方案六                                                    |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| 新增一个控制流组件      | 必须记住注册 onUnmount 清理 + 确保返回 fragment 时首节点是锚点 | 不需要——控制流集成在 `h()` 中，新增组件不需要考虑生命周期 |
| 排查一个奇怪的 DOM 泄漏 | 需要检查 8 条规则中哪条被违反                                  | 检查宿主元素和子节点是否在同一 DOM 树下                   |
| 重构 DOM 结构           | 需要确保 fragment 传播逻辑正确                                 | 不需要——DOM 结构即逻辑关系                                |
| 新人理解生命周期模型    | 需要理解 8 条隐含规则和它们的相互作用                          | 理解 `childNodes` 递归 = 生命周期递归                     |

### 方法论的思考

这个问题和 Vue 2 的 `$children` 遍历在虚拟 DOM 中被替代、React 的 `componentWillReceiveProps` 在 fiber 重写中被废弃、Flux 的多个 store 在 Redux 中被合并为单一 store——这些都不是「规则不够多」的问题，而是「模型本身有根本缺陷，越多的规则只是越精密的补丁」。

传播方案（方案一）能工作，但它的 8 条规则不是功能的丰富性，而是对「内容不在它该在的位置」这个根本问题的补偿。指令方案（方案六）选择改变 DOM 结构本身，让 disposeNode 的自然行为就能正确工作。

---

## 遗留的开放问题

### 若选择方案一（传播 + onUnmount）

1. **`onUnmount(removeBranch)` 注册**：Show/List 内部需要确保销毁时清理 DOM。当前没有这个机制。
2. **传播策略的范围**：只传播到 `childNodes[0]` 还是全部子节点？前者是 heuristic，后者会在 rerender 时误触。
3. **Fragment 的特殊处理**：有 INSTANCE_KEY 的子节点跳过传播，否则覆盖子组件的生命周期元数据。
4. **测试覆盖**：当前测试（83 个）中没有嵌套 Show + lazy 切换分支的场景。修复后需要补充。
5. **List 的 onUnmount**：List 当前在 effect 中实时遍历 `anchor.nextSibling`，但 List 本身被销毁时没有通过 `onUnmount` 做同样的清理。

### 若选择方案六（when/each 指令）

1. **`when` + `each` 同一元素的优先级**：推荐 when 优先（外层守卫），each 在内。需要框架层面明确定义。
2. **void 元素上的 `when`/`each`**：推荐抛错或警告。用户应使用 CSS 或父元素条件渲染。
3. **自定义组件上的 `when`/`each`**：不自动生效。文档需明确「在原生元素上使用」。
4. **SSR `each` 的三段式序列化**：需要改造 `hSSR` 以支持开标签 → 重复子节点 → 闭标签的模式。
5. **Portal 的一致性**：保留为组件形式还是也引入对应指令？选择保留组件不影响正确性。
6. **重构范围**：涉及 `h()`、`hSSR`、src/components.ts、测试、example 全部更新。Show/List 组件需要重写或废弃。

---

## 相关文件索引

| 文件                                                 | 作用                                                   |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `src/components.ts`                                  | Show/List/Portal/lazy 实现，DocumentFragment 返回      |
| `src/dom.ts`                                         | `h()` 函数，`INSTANCE_KEY`/`DISPOSE_KEY` 挂载点        |
| `src/lifecycle.ts`                                   | `disposeNode`、`triggerMount`、`createDisposeFn`       |
| `src/runtime.ts`                                     | `effect`、`define`、组件栈管理                         |
| `src/types.ts`                                       | `IS_REACTIVE`、`INSTANCE_KEY`、`DISPOSE_KEY` 等 Symbol |
| `packages/example/src/router.tsx`                    | 复现示例的路由配置                                     |
| `packages/example/src/main.tsx`                      | 复现示例的入口                                         |
| `packages/example/src/components/dashbord/index.tsx` | dashbord 组件（泄漏内容）                              |
| `packages/example/src/components/dashbord/nav.tsx`   | dashbord 导航组件                                      |
| `tests/dom.test.ts`                                  | DOM 相关测试                                           |
| `tests/index.test.ts`                                | 核心运行时测试                                         |

---

## 讨论参与者

- 用户：提供 bug 复现、提出 `as` 方向
- 分析时间：2026-06-07
- 当前状态：方案讨论阶段，待选型后进入实现
