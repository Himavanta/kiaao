# when 与 each 的统一模型与 identity 更新讨论

## 起点：两个独立指令的演化

### 最初设计

`Show` 和 `List` 是独立的组件，都返回 `DocumentFragment`：

- `Show`：条件渲染，`when` 切换时 `removeBranch()` 销毁旧节点
- `List`：列表渲染，`each` 变化时 `while(nextSibling)` 清理重建

### Phase 5：下沉为属性指令

`Show`/`List` 移除，变为 `when`/`each` 属性指令：

- `when`：宿主元素始终在 DOM 中，清除/重建子节点
- `each`：锚点 + `insertBefore` 管理列表项

两者独立实现，各有自己的 effect、清理逻辑。

### Phase 5.2：提取 renderEach

`when` + `each` 共存时，`each` 部分的逻辑与独立 `each` 重复。提取 `renderEach` 共享函数。

此时两个指令在代码层面开始共享基础设施。

### Phase 5.2 末期：key 的两种方向

方向 A：key 匹配时复用 DOM，不调 `childFn`
方向 B：key 匹配时仍调 `childFn`，key 只用于 cleanup

选择了方向 B（始终调用，保证数据正确）。

---

## 当前状态：两个发现

### 发现一：信号在 item 内部时，方向 B 是过度设计

```tsx
const [list] = define([{ id: 1, name: define("a") }]);

<ul each={() => list()} key={(item) => item().id}>
  {(item) => <li>{item((v) => v.name)}</li>}
</ul>;
```

当 `name` 变化时，信号系统直接更新 DOM 文本节点，**each 不介入**。只有数组结构变化（增/删/排序）时 each 才介入。此时 if key 匹配，复用节点是安全的——内部信号绑定全部有效。

方向 B 的「始终调 `childFn`」在此场景下是多余的，且会丢失焦点和内部状态。

### 发现二：SKIP_UPDATE 和 key 做的是同一件事

| 机制                 | 场景            | 判断条件 | 行为       |
| -------------------- | --------------- | -------- | ---------- |
| `SKIP_UPDATE`        | when 的惰性函数 | 段不变   | 不清空 DOM |
| `key` 复用（方向 A） | each 的列表项   | key 不变 | 不重建节点 |

两者都是 **「身份没变时跳过 DOM 操作」**。只是一个在 when 层面（0-1 个节点），一个在 each 层面（N 个节点）。

---

## 当前 key 的实现与目标的差距

### 现状（方向 B——始终调用 childFn）

当前代码中 `renderEach` 的 key 路径：

```ts
for (let i = 0; i < items.length; i++) {
  const key = keyFn(item, i);
  newKeys.add(key);

  const oldNode = nodeMap.get(key);
  if (oldNode) {
    disposeNode(oldNode); // 同 key 也销毁
    oldNode.parentNode?.removeChild(oldNode);
  }

  const newNode = childFn(item, i); // 始终调 childFn → 新 DOM
  container.insertBefore(newNode, anchor);
  if (container.isConnected) triggerMount(newNode);

  nodeMap.set(key, newNode);
}

// 最后清理消失的 key
for (const [key, oldNode] of nodeMap) {
  if (!newKeys.has(key)) {
    disposeNode(oldNode);
    oldNode.parentNode?.removeChild(oldNode);
    nodeMap.delete(key);
  }
}
```

**行为：** 同 key 的旧节点先被 `disposeNode` 销毁，然后创建全新的节点。列表项内部的 `define` 信号重置、输入框焦点丢失、滚动位置丢失。

### 选择方向 B 的理由（当时）：\*\* 认为 item 是普通对象，不调用 `childFn` 会显示陈旧数据。但当时忽略了一个关键场景——信号在 item 内部。

### 转折：item 内部可以有信号

讨论中用户展示了关键的示意代码，它揭示了 kiaao 中列表渲染的正确用法：

```tsx
const [list] = define([{ id: 1, name: define("a") }]);

// 示意：item 是信号，内部的属性也是信号
// derive(()=>list(v=>v[index]))

<ul each={list} key={(item) => item().id}>
  {(item) => <li>{item((v) => v.name)}</li>}
</ul>;
```

**核心模式：** 信号在 item 内部，不在 item 外部。`list` 是数组级别的信号，`name` 是属性级别的信号。

当 `name` 从 `"a"` 变成 `"A"` 时：

```
name 信号变化 → effect 通知 → textNode.textContent = "A"
                            → each 不介入（list 信号没变）
```

**属性级别的更新完全绕过了 `each`。** `each` 只在数组结构变化时才介入。这意味着——同 key 时复用节点是绝对安全的，节点内部所有的信号绑定都还活着。

与之对比的是纯静态数据的场景：

```tsx
const list = [{ id: 1, name: define("a") }];

// 这样无法使用 each 的响应式能力
// () => list 永远返回同一个引用，each effect 永不重跑
// 此时用 map 处理是更好的选择
<ul each={() => list}>{(item) => <li>{item((v) => v.name)}</li>}</ul>;
```

这里 `() => list` 返回常量引用，`each` 的 effect 不会重新执行，响应式能力无从发挥。纯静态列表应该直接用 `Array.map` 或手动 `h()` 创建，不需要 `each`。

### 目标（方向 A——同 key 时复用 DOM）

```ts
for (let i = 0; i < items.length; i++) {
  const key = keyFn(item, i);
  newKeys.add(key);

  const existing = nodeMap.get(key);
  if (existing) {
    // 同 key → 复用 DOM，只移动位置，不调 childFn
    container.insertBefore(existing, anchor);
    // 内部信号绑定仍然有效，item 数据变化由信号系统处理
  } else {
    // 新 key → 调用 childFn 创建新节点
    const node = childFn(items[i], i);
    if (!(node instanceof Node)) continue;
    container.insertBefore(node, anchor);
    if (container.isConnected) triggerMount(node);
    nodeMap.set(key, node);
  }
}

// 清理消失的 key（行为不变）
```

**行为：** 同 key 时不调 `childFn`，不触发 `disposeNode`，原有 DOM 节点和内部信号绑定保持完整。输入框焦点不丢失，`define` 信号不重置。

**适用前提：** item 必须是信号（`define` 包裹），属性变化由信号系统驱动。纯静态 item 的更新不适合此模式。

### key 是否可以去除的讨论

尝试方向：让 `each` 内部自动用 item 的引用来做 identity，去掉显式的 `key` 属性。

#### 信号 item：可以自动 identity

```tsx
const [list] = define([
  define({ id: 1, name: define("a") }), // item 本身就是信号
  define({ id: 2, name: define("b") }),
]);

<ul each={list}>{(item) => <li>{item((v) => v.name)}</li>}</ul>;
```

`list()` 返回 `[getterA, getterB]`，每个 getter 的函数引用在数组重排时不变。`each` 内部直接用 getter 引用做 nodeMap 的 key，不需要用户提供 `keyFn`。

#### 通过 index 派生 itemGetter 失败

尝试用 `derive` 通过 index 派生 itemGetter：

```tsx
const [list] = define([{ id: 1, name: "a" }]);
const itemGetter = derive(() => list()((v) => v[index])); // 永远绑定 index
```

当数组重排时，itemGetter 引用了不变，但指向的数据从 `{id:1}` 变成了 `{id:2}`。如果用这个 getter 引用做 identity，each 认为「同一项还在」，但实际上内容已经换了。

**问题根源：** index 是位置，不是身份。通过 index 派生的 getter 无法提供跨重排的稳定 identity。

#### 纯对象 item：需要 key

```tsx
const [list] = define([
  { id: 1, name: "a" },
  { id: 2, name: "b" },
]);

<ul each={() => list()} key={(item) => item.id}>
  {(item) => <li>{item.name}</li>}
</ul>;
```

item 是纯对象，没有稳定的函数引用。必须通过 `keyFn` 显式指定 identity。

#### 结论

| 模式          | 写法                 | key 是否需要                    |
| ------------- | -------------------- | ------------------------------- |
| item 是信号   | `each={listGetter}`  | 不需要，信号引用自动做 identity |
| item 是纯对象 | `each={() => items}` | 需要 key，否则全量重建          |

`key` 不应去除，但当 item 是信号时可以自动推导。

```
when → 0 或 1 个子节点（条件为 false 时 0 个，为 true 时 1 个）
each → N 个子节点

when 是 each 的特例：最大长度为 1 的列表
```

当 `when` 的条件从 false 变 true，等价于一个「空列表变单元素列表」。当条件从 true 变 false，等价于「列表被清空」。

`SKIP_UPDATE` 是长度为 1 的列表的 key 不变时的行为——段不变就不动 DOM。

---

## SKIP_UPDATE 与 key 的取舍

两者不冲突，也不重叠，它们在**不同粒度**工作：

| 机制          | 作用对象          | 判断     | 粒度                 |
| ------------- | ----------------- | -------- | -------------------- |
| `SKIP_UPDATE` | when 宿主元素整体 | 段不变   | 整体（0-1 个节点）   |
| `key` 复用    | each 的单个列表项 | key 不变 | 单项（N 个节点之一） |

去掉任何一个都需要在另一层重新发明同一种能力：

- **去 SKIP_UPDATE 留 key**：`when` 本身没有 key 概念，要为 `when` 加 identity tracking 需要引入新的判断机制，本质上是再发明一遍 `SKIP_UPDATE`。
- **去 key 留 SKIP_UPDATE**：`each` 需要按 item 粒度跳过，不是整体跳过。`SKIP_UPDATE` 的语义是「整个宿主元素不清空」，无法细到单项。

两者互补，不存在取舍关系。

---

## when 的惰性函数与 each 的 childFn 是同一类东西

```
// when 的惰性函数
() => cond ? <Content /> : null

// each 的 childFn
(items) => items.map(item => <Row item={item} />)
```

两者都是「数据变化时调用，返回 DOM 节点」的惰性求值函数。区别只在返回的数量：when 返回 0 或 1 个节点，each 返回 N 个节点。

这个观察引出了方向二的核心问题：

> `when` 是否可以内部委托给 `renderEach`，从而让 SKIP_UPDATE 自然消亡？

答案是需要仔细权衡。`when` 的惰性函数在 kiaao 中不仅仅是条件渲染，它还是 `SKIP_UPDATE` 的发送者——RouterView、lazy 等高级组件都依赖这个机制来保持布局。如果 `when` 走 `renderEach`，`SKIP_UPDATE` 的语义需要由 key 的复用来承载，但 `when` 本身没有 key 的概念。

反之，`renderEach` 的 key 复用逻辑也可以反过来看——它本质上就是一个「按 key 做 identity tracking 的惰性函数调度器」。这和 `when` 的惰性函数+SKIP_UPDATE 是同一个模式，只是量级不同。

### 方向一：保持当前分离设计，各自优化

- `when`：保留 `SKIP_UPDATE`
- `each`：改回方向 A（key 匹配时复用）
- 两个指令保持独立实现

优点：改动量小，风险低
缺点：代码层面有重复语义，长期需要维护两套「身份→跳过」逻辑

### 方向二：统一模型

`when` 的内部实现可以委托给 `renderEach`：

```ts
// when 内部
const items = show ? [children[0]] : [];
renderEach(
  el,
  () => items,
  (item) => (typeof item === "function" ? item() : item),
);
```

当 `when` 为 true，列表长度为 1；为 false，列表为空。`SKIP_UPDATE` 自然消失——由 key 的复用机制覆盖。

优点：一个原语覆盖两种场景，概念更少
代价：`when` 不再有单独的惰性函数路径，全部走 `renderEach`

### 方向三：完全统一为 identity + template

更激进的思路是彻底泛化：所有动态内容都通过一个统一的 identity tracking 机制管理，`when`/`each` 只是声明式语法糖。

### 方向四（当前倾向）：共享 identity 基础设施，不合并实现

方向二的问题在于：让 `when` 去迁就 `renderEach` 的接口，反过来损失了 `when` 的灵活性（SKIP_UPDATE 消失）。

更好的方式可能是反过来：**提取一个共享的 identity-lazy 基础设施，`when` 和 `each` 各自基于它实现。**

这个基础设施的核心是一个通用的惰性求值 + identity tracking 模式：

```ts
function createIdentityTracker(
  container: HTMLElement,
  getIdentity: () => any,
  render: () => Node | null,
): { stop: () => void };
```

- `when` 使用它：identity 是段，`render` 返回 0 或 1 个节点
- `each` 使用它：identity 是 item 的 key，`render` 返回单个节点
- identity 不变时自动跳过 DOM 操作
- identity 变化时自动清理旧节点

这样 `SKIP_UPDATE` 和 key 的复用都是从同一个基础设施衍生出来的能力，两者不冲突也不重复。`when` 保持自己的惰性函数接口，`each` 保持自己的 key 接口，底层共享同一套 identity→skip 的机制。

当前讨论处于方向一到方向四的探索阶段，尚未做出最终决策。

---

## 附：合并可能性探索

### 四个概念的关系

| 概念          | 作用层面          | 用户是否感知 |
| ------------- | ----------------- | ------------ |
| `when`        | 条件渲染接口      | ✅ 属性指令  |
| `each`        | 列表渲染接口      | ✅ 属性指令  |
| `key`         | 列表项 identity   | ✅ 可选参数  |
| `SKIP_UPDATE` | identity 匹配信号 | ❌ 内部实现  |

真正需要讨论合并的只有 `when` 和 `each`——`key` 是 `each` 的参数，`SKIP_UPDATE` 是内部实现细节。

### 合并的两种含义

**含义一：对外 API 合并。**

```tsx
// 用一个指令覆盖所有动态内容
<div template={items} key={(item) => item.id}>     {/* 列表 */}
<div template={cond ? [content] : []}>               {/* 条件 */}
```

去掉 `when` 和 `each`，用一个 `template` 统一。代价是失去了语义的直观性——`when` 看着就是条件，`each` 看着就是列表。用一个 `template` 反而需要用户额外理解。

**含义二：内部实现合并。**

这就是方向二和方向四讨论的内容。方向二是让 `when` 走 `renderEach`，方向四是提取共享基础设施各自实现。

### 如果合并内部实现

```ts
// 内部只有一个原语：identity-tracked container
function createDynamicContainer(
  el: HTMLElement,
  items: () => any[], // 当前所有 item
  getId: (item: any, i: number) => any, // 每个 item 的 identity
  renderItem: (item: any, i: number) => Node | typeof SKIP_UPDATE, // 渲染单个
): () => void;
```

- `when` 包装它：`items = show ? [lazyFn] : []`, `getId = () => 0`, `renderItem = (fn) => fn()`
- `each` 包装它：`items = eachFn()`, `getId = keyFn`, `renderItem = childFn`

此时 `SKIP_UPDATE` 自然消失——`createDynamicContainer` 内部通过 identity 判断是否跳过。

### 分析结论

| 合并程度       | 方案       | 优点               | 代价                     |
| -------------- | ---------- | ------------------ | ------------------------ |
| 不合并         | 方向四     | 改动小，API 不变   | 内部仍有两条调用路径     |
| 合内部不合 API | 方向二变体 | 统一实现，API 不变 | `when` 的惰性函数需包装  |
| API 和内部都合 | `template` | 最简洁             | 损失语义直观性，迷惑用户 |

中间路线（合内部不合 API）可能是收益最大的——用户看到的 `when`/`each` 没变，但底层是一条统一的 identity tracking 逻辑。代码量和维护成本降低，`SKIP_UPDATE` 不再需要，key 的复用自动生效。

---

## 关联文档

- [嵌套控制流组件 DOM 生命周期泄漏分析与修复方案讨论](./Nested组件DOM生命周期泄漏分析与修复方案讨论.md)
- [嵌套 RouterView 方案讨论与设计](./嵌套RouterView方案讨论与设计.md)
