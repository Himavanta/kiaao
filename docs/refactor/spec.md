# kiaao 响应式系统 v4.0 设计文档

> **版本背景**：本文档是对 v3.4 规范中 `define`/`derive`/`effect`/`getter(selector)` 的破坏性重构。核心变化：统一为单一 `use` API，所有信号在 API 层面完全同构，废除选择器语法，确立“一切皆派生”模型。
>
> **设计目标**：消除 `define` 与 `derive` 的类型区分给开发者带来的心智负担，消除 `effect` 与 `derive` 的语义割裂，消除 `getter(selector)` 带来的“是否可继续派生”的决策负担，消除 `toUse` 在处理派生信号时的分支逻辑。

---

## 一、核心理念

### 1.1 数据平权

**所有数据都是信号，所有信号都由 `use` 产生，所有消费都通过 `getter()` 完成。**

不存在“原始值”和“响应式值”的区分。不存在“可以继续派生的信号”和“不能继续派生的信号”的区别——所有信号地位相同，都可以作为 `use` 的依赖。不存在“可写信号”和“只读信号”在 API 层面的区分——所有信号都返回 `[getter, setter]`，调用者无需判断。

### 1.2 一切皆派生

**没有副作用（effect），只有不读返回值的派生。**

当你写 `use(a, b, () => { console.log(a()) })` 时，你创建了一个派生信号，其值永远为 `undefined`。你选择不接收它的返回值，但它在依赖图上与任何其他派生信号拥有完全相同的结构、缓存机制和生命周期。

### 1.3 API 完全同构

**`use` 在任何情况下都返回 `[getter, setter]` 元组。**

无论是一元调用（定义模式）还是多元调用（派生模式），无论 `computeFn` 是否有返回值，返回值结构永远不变。开发者永远可以安全地写 `const [val, setVal] = use(...)`，解构永远不会失败。

这是本设计的**硬性规则**，不是可选约定。它消除了一切防御性判断：不需要检查返回值是函数还是数组，不需要在组件内部写分支逻辑处理“这个信号可写吗”的疑问。

### 1.4 依赖显式声明

**依赖关系在 `use` 调用时由参数列表静态确定，绝不依赖运行时执行栈。**

这意味着：

- 异步回调中访问信号不会产生任何依赖绑定。
- 条件分支中访问信号不会动态改变依赖列表——依赖列表在创建时已固定。
- 开发者不需要猜测“这个信号被追踪了吗”，因为只有写在参数列表里的才被追踪。

### 1.5 无编译器、无 Proxy、无虚拟 DOM

保持不变。

---

## 二、核心 API：`use`

`use` 是创建响应式信号的**唯一入口**。根据参数个数，自动进入两种模式之一。

无论哪种模式，返回值始终为 `[getter, setter]` 元组，无一例外。

### 2.1 定义模式：`use(initialValue)`

**触发条件**：恰好一个参数。

**返回值**：`[getter, setter]` 元组。

```js
const [count, setCount] = use(0);
const [user, setUser] = use({ name: "tom", age: 18 });
const [fnSignal, setFnSignal] = use(() => 42); // 函数本身作为值
const [asyncVal, setAsyncVal] = use(somePromise); // Promise 本身作为值
const [existingSignal, setExistingSignal] = use(otherSignal); // 另一个信号的 getter 作为值
```

**规则**：

- `initialValue` 可以是任何 JavaScript 值，不做类型限制，不做特殊包装。
- 如果传入的值本身是一个函数（包括 getter、Promise、async 函数），它被当作普通值存储，不会被调用。
- **getter**：调用 `getter()` 返回当前存储的值。
- **setter**：`setter(newValue)` 直接替换内部值。`setter(updaterFn)` 调用 `updaterFn(当前值)`，用返回值替换。

```js
setCount(42); // 直接替换
setCount((prev) => prev + 1); // 函数式更新
setUser((prev) => ({ ...prev, age: 19 }));
```

**内部数据结构**：

```ts
interface DefinitionNode<T> {
  value: T;
  subs: Set<DerivationNode>;
  set: Setter<T>;
}
```

`getter` 函数上挂载 `REACTIVE` 标记，其值指向该节点的内部状态对象。`setter` 函数的引用也保存在 `state.set` 中，供 `toUse` 提取。

---

### 2.2 派生模式：`use(...deps, computeFn)`

**触发条件**：两个或更多参数。最后一个必须是普通函数（非信号），其余为依赖信号。

**返回值**：`[getter, setter]` 元组。派生模式的 getter 和 setter 语义与定义模式不同，但接口完全一致。

```js
// 有返回值的派生
const [double, setDouble] = use(count, () => count() * 2);
const [name, setName] = use(user, () => user().name);

// 无返回值的派生（即原“副作用”场景）
const [_, trigger] = use(count, () => {
  console.log(count());
});
// 可解构，但不使用 getter
```

#### Getter 行为

调用 `getter()` 返回当前缓存的计算结果。不触发重新计算。

#### Setter 行为

**`setter(value)` 触发 `computeFn` 重新执行**，而不是直接覆盖值。

- `computeFn` 接收 `setter` 传入的值作为参数。
- `computeFn` 的返回值作为新的缓存值。
- 若新值与旧值 `!==`，更新缓存并通知下游订阅者。
- 若相同，短路，不通知下游。

```js
const [count, setCount] = use(1);

const [nextCount, setNextCount] = use(count, (v) => {
  console.log("重算触发，setter 传入:", v);
  return count() + 1;
});
// 创建时立即执行一次，v 为 undefined
// 输出: 重算触发，setter 传入: undefined

console.log(nextCount()); // 2

setCount(2);
// 上游变化触发重算，v 为 undefined
// 输出: 重算触发，setter 传入: undefined
console.log(nextCount()); // 3

setNextCount(100);
// setter 触发重算，v 为 100
// 输出: 重算触发，setter 传入: 100
console.log(nextCount()); // 3（因为 computeFn 返回 count() + 1，即 3）
```

**`computeFn` 的参数**：

- 由上游依赖变化触发的重算：参数为 `undefined`。
- 由 setter 触发的重算：参数为 setter 接收的值。
- `computeFn` 是标准 JavaScript 函数，可以声明任意参数、设置默认值。

```js
const [derived, setDerived] = use(base, (multiplier = 2) => {
  return base() * multiplier;
});
// 上游变化：multiplier 默认为 2
// setDerived(3)：multiplier 为 3
```

#### 短路逻辑

无论重算由上游变化触发还是 setter 触发，短路逻辑保持一致：

> 若 `computeFn()` 的返回值 `===` 缓存值，则不通知下游。

setter 调用不享有“强制通知”的特权。如果用户需要强制通知，应在 `computeFn` 中主动改变返回值。控制权在用户手里。

#### 创建时的初始执行

派生信号在创建时立即执行一次 `computeFn`，此时参数为 `undefined`。执行结果作为初始缓存值。

#### 参数校验（开发模式）

- 若最后一个参数 `typeof !== 'function'`，发出警告，不创建派生，返回 `undefined`（不返回元组，因为此时调用本身是错误用法）。
- 若最后一个参数本身是信号（`isUse(v)` 为真），发出警告。
- 若依赖列表中存在非信号值，发出警告并自动过滤。

---

### 2.3 类型签名

```ts
// 定义模式
function use<T>(initialValue: T): [Getter<T>, Setter<T>];

// 派生模式（有返回值）
function use<T>(...deps: [...Signal[], (setValue?: any) => T]): [Getter<T>, Setter<T>];

// 派生模式（无返回值）
function use(...deps: [...Signal[], (setValue?: any) => void]): [Getter<void>, Setter<void>];
```

三种重载的返回值都是元组，结构完全一致。

---

## 三、辅助工具函数

### `isUse(v: any): boolean`

判断一个值是否是信号（即 `use` 创建的 getter 函数）。定义信号和派生信号的 getter 均返回 `true`。

```js
const [count] = use(0);
const [double] = use(count, () => count() * 2);

isUse(count); // true
isUse(double); // true
isUse(42); // false
```

实现原理：检查 `v?.[REACTIVE] !== undefined`。

---

### `toUse(v: any): [Getter, Setter]`

将任意值规范化为可读写的信号元组。无论输入是普通值、定义信号还是派生信号，返回值始终是 `[getter, setter]`。

**行为**：

- 若 `v` 是信号（`isUse(v)` 为真），返回 `[v, v[REACTIVE].set]`。由于所有信号都有 setter，此分支永远安全。
- 若 `v` 不是信号，等价于 `use(v)`，创建一个新的可写信号并返回。

**设计意图**：
当组件接收的参数可能来自外部普通值或已有信号时，`toUse` 作为适配器，消除组件内部对数据来源和可写性的区分。组件始终拿到 `[getter, setter]`，逻辑保持统一。

**示例**：

```js
function Slider(props) {
  const [value, setValue] = toUse(props.value);

  return h("input", {
    type: "range",
    value: value(),
    onInput: (e) => setValue(Number(e.target.value)),
  });
}
```

**类型签名**：

```ts
function toUse<T>(v: T): [Getter<T>, Setter<T>];
```

---

### `toVal(v: any): any`

若 `v` 是信号则返回 `v()`（即当前值），否则返回 `v` 本身。

```js
toVal(count); // 0
toVal(42); // 42
```

---

## 四、依赖关系与更新传播

### 4.1 依赖图结构

每个定义节点维护 `{ value, subs: Set<DerivationNode>, set }`。
每个派生节点维护 `{ deps: Set<SignalNode>, cachedValue, dirty, subs: Set<DerivationNode>, computeFn, set, stops }`。

依赖关系在 `use(...deps, fn)` 调用时一次性建立：

1. 遍历 `deps`，对每个依赖调用 `dep[REACTIVE].subs.add(当前派生节点)`。
2. 同时将取消订阅函数存入当前派生节点的 `stops` 集合。

### 4.2 更新传播流程

**上游变化触发的更新**：

1. 用户调用 `setter(newValue)`。
2. 框架将定义节点的 `value` 更新为 `newValue`（若 `newValue !== oldValue`）。
3. 遍历该定义节点的 `subs`，对每个派生节点标记 `dirty = true`，并触发重新计算。
4. 重新计算：执行 `computeFn(undefined)`，得到 `newResult`。
5. 若 `newResult !== cachedValue`，更新 `cachedValue`，将 `dirty` 置为 `false`，遍历 `subs` 递归触发下游。
6. 若 `newResult === cachedValue`，仅将 `dirty` 置为 `false`，不通知下游。

**派生 setter 触发的更新**：

1. 用户调用派生信号的 `setter(value)`。
2. 标记该派生节点 `dirty = true`，触发重新计算。
3. 执行 `computeFn(value)`，得到 `newResult`。
4. 后续短路逻辑与上游触发的更新完全一致。

### 4.3 无循环依赖检测

框架**不检测**循环依赖。由开发者自行保证依赖图无环。

---

## 五、清理机制

### 5.1 派生节点的订阅取消

每个派生节点的 `stops` 集合存储了向每个依赖注册的取消订阅函数。当派生节点需要被销毁时，遍历 `stops` 调用所有函数，将自身从各依赖的 `subs` 中移除。

### 5.2 清理触发时机

- `disposeNode(node)`：递归清理 DOM 节点及其关联的派生。
- `unmount(root)`：卸载组件树并清理所有关联资源。
- `when`/`each` 分支切换：销毁旧分支的 DOM 节点时自动触发清理。

### 5.3 对外不暴露 `stop`

派生节点的取消订阅函数**不在 `use` 的返回值中暴露**。开发者无法手动停止一个派生。

需要手动控制的持续性逻辑，应在 `computeFn` 内部通过标志位控制：

```js
let alive = true;
use(someSignal, () => {
  if (alive) {
    // 执行逻辑
  }
});
// 需要停止时：alive = false
```

**这仅在逻辑层面阻止了执行，订阅本身依然存在。真正的订阅清理依赖框架内部的销毁机制。**

---

## 六、与 `h()` 的集成

### 6.1 信号识别

`h()` 在处理子节点和属性值时，通过 `isUse(value)` 判断该值是否为信号。

若为信号：

- 创建匿名派生来绑定更新。
- 该匿名派生的 `stop` 注册到对应 DOM 节点的 `LOCAL_EFFECTS` 集合中，随节点销毁而清理。

### 6.2 JSX 中的使用

```jsx
// 文本绑定
<div>{count}</div>

// 属性绑定
<div class={use(isActive, () => isActive() ? 'active' : '')}>

// 条件渲染
<section when={visible}>
  <span>内容</span>
</section>

// 列表渲染
<ul each={items} key={item => item.id}>
  {(item) => <li>{item}</li>}
</ul>
```

### 6.3 不再支持 `getter(selector)`

以下旧写法不再有效：

```jsx
<div>{user((u) => u.name)}</div>
```

替代写法：

```jsx
<div>{use(user, () => user().name)}</div>
```

原因是 `getter(selector)` 引入了不一致性：它返回一个无缓存的派生函数，与 `use(...)` 创建的派生信号行为不同。废除后，所有派生统一通过 `use(...)` 创建。

---

## 七、关键 API 契约

### 7.1 `use` 永远返回数组

`use(...)` 在任何模式下都返回一个二元数组 `[getter, setter]`。开发者可以无条件解构：

```js
const [val, setVal] = use(...)
```

不存在返回 `undefined`、返回单个函数、或返回非数组值的情况。这是硬性契约，在实现中由框架保证。

### 7.2 所有信号都有 setter

定义信号和派生信号的 getter 都挂载 `REACTIVE` 标记，其内部状态都包含 `set` 字段。`toUse` 因此可以安全地从任何信号提取 setter。

### 7.3 派生 setter 触发重算而非覆盖

定义模式的 setter 直接替换值。派生模式的 setter 触发 `computeFn` 重新执行，新值由 `computeFn` 的返回值决定。

---

## 八、与 v3.4 规范的差异对照

| 维度               | v3.4                                                              | v4.0                                        |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------- |
| 创建可写信号       | `define(init)` → `[get, set]`                                     | `use(init)` → `[get, set]`                  |
| 创建派生信号       | `derive(fn)` → `getter`                                           | `use(a, b, fn)` → `[get, set]`              |
| 副作用             | `effect(fn)` → `stop`                                             | 派生模式（不接收返回值），返回 `[get, set]` |
| 细粒度订阅         | `getter(selector)` → 派生函数                                     | `use(signal, fn)`                           |
| 选择器返回值的缓存 | 无缓存                                                            | 有缓存（与所有派生统一）                    |
| 对外暴露停止函数   | `effect` 返回 `stop`                                              | 不暴露                                      |
| 核心 API 数量      | 4（define/derive/effect/h）                                       | 3（use/h 及辅助）                           |
| 返回值结构一致性   | 不一致（define 返回元组，derive 返回函数，effect 返回 stop 函数） | 完全一致（全部返回元组）                    |

---

## 九、迁移说明

从 v3.4 迁移到 v4.0 的对应关系：

```js
// 定义模式
// v3.4: const [count, setCount] = define(0)
// v4.0: const [count, setCount] = use(0)

// 派生模式
// v3.4: const double = derive(() => count() * 2)
// v4.0: const [double] = use(count, () => count() * 2)

// 副作用
// v3.4: effect(() => { console.log(count()) })  → 返回 stop
// v4.0: const [_, trigger] = use(count, () => { console.log(count()) })

// 细粒度订阅
// v3.4: const name = user(u => u.name)
// v4.0: const [name] = use(user, () => user().name)
```

---

## 十、代码量估算

| 模块                                    | 预计行数          |
| --------------------------------------- | ----------------- |
| `use`（定义模式 + 派生模式 + 内部调度） | 70-90             |
| `isUse` / `toUse` / `toVal`             | 15                |
| 全局上下文与依赖图管理                  | 25                |
| 清理机制（节点级 + 组件级）             | 25                |
| 与 `h()` 的集成适配                     | 20                |
| TypeScript 类型定义                     | 35                |
| **总计**                                | **约 190-210 行** |

---

## 十一、待定事项

以下事项不在本文档范围内，将在核心实现完成后讨论：

1. **异步派生优化**：是否提供内置的 `Promise` 处理。
2. **开发工具**：依赖图可视化的 DevTools 集成方案。
3. **调度优化**：批量更新、微任务调度策略。
4. **`Suspense` / `ErrorBoundary`**：异步组件加载和错误处理。
5. **SSR 水合**：客户端激活方案。

---

**文档版本**：v4.0  
**撰写日期**：2026年6月11日  
**状态**：定稿，用于 kiaao 代码库改造
