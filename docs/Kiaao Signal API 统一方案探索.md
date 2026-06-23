# Kiaao Signal API 统一方案探索

**状态**：草案，待后续讨论
**关联**：[Owner 树架构重构实施方案](./Owner树架构重构实施方案.md)、[`{ owner, nodes }` 返回值方案二次重构](./owner-nodes二次重构方案.md)
**日期**：2026年6月23日
**版本**：1.0

## 一、背景

Kiaao 当前通过 `use` API 创建响应式状态，返回 `[getter, setter]` 元组：

```js
const [count, setCount] = use(0);

count(); // 读取
setCount(1); // 写入
```

这种设计明确了读和写的语义边界，但带来了两个实际问题：

1. **使用繁琐**：每次创建状态都需要解构，在状态较多的组件中样板代码累积明显。
2. **JSX 中的响应式绑定**：`{count}` 在 JSX 中直接作为子节点时，`h()` 通过 `isUse` 检测 getter 并自动绑定。但如果用户想要在 JSX 属性或表达式中使用，必须先解构 getter。虽然 `use` 吸收 `toUse` 后可以通过 `use(signal)` 直接引用已有信号，但书写上仍有间接性。

在 Kiaao API 设计的早期（v3.x 之前），曾探索过将 Getter 和 Setter 合并为一个函数的设计，但因“读写语义模糊”而被放弃。随着 Owner 树架构重构接近完成、`{ owner, nodes }` 二次重构方案已规划，框架的模块化和稳定性进一步提升，现在重新审视这个方向的条件已经成熟。

## 二、核心思想：Signal 统一读写

### 2.1 基本设计

将 `use` 的返回值从 `[getter, setter]` 元组改为单一的 `Signal<T>` 函数对象。`Signal<T>` 同时承担读取和写入的职责：

```ts
const count = use(0);

count(); // 读取 → 0
count(1); // 写入 → 1
count((c) => c + 1); // 函数式更新 → 2
```

**判定规则**：无参调用为读取，有参调用为写入。传入函数参数时为函数式更新。

### 2.2 类型定义

```ts
interface Signal<T> {
  (): T; // 读取
  (value: T | ((prev: T) => T)): T; // 写入，返回新值（同步）
  [IS_SIGNAL]: true; // 内部标记
}
```

派生信号同样返回 `Signal<T>`，其 setter 触发重算：

```ts
const double = use(count, () => count() * 2);

double(); // 读取 → 2
double(10); // 触发重算，10 作为参数传入 computeFn
```

### 2.3 与 Vue 3 `ref` 的对比

Vue 3 的 `ref` 通过 `.value` 属性统一读写入口：

```ts
const count = ref(0);
count.value; // 读
count.value = 1; // 写
```

Kiaao 的 `Signal<T>` 使用函数调用语法，语义等价，但更简洁——不需要 `.value` 后缀。Vue 3 社区三年来的实践已经验证了“读写合一”模式的可行性，没有产生广泛的认知混淆。

### 2.4 唯一歧义点：`signal(undefined)`

当用户调用 `signal(undefined)` 时，框架无法区分“写入 undefined”和“读取”。按约定，有参调用一律视为写入。如果用户确实需要传入 `undefined`，这会被正确处理。TypeScript 类型系统可以在大多数情况下防止误用——`signal()` 无参返回 `T`，赋值给变量的场景需要无参调用。

## 三、对框架各层面的影响

### 3.1 用户代码简化

**当前**：

```js
const [count, setCount] = use(0);
const [name, setName] = use("");
const [double, setDouble] = use(count, () => count() * 2);

// JSX 中使用
<div>Count: {count}</div>
<button onClick={() => setCount(count() + 1)}>+1</button>
```

**新方案**：

```js
const count = use(0);
const name = use("");
const double = use(count, () => count() * 2);

// JSX 中使用
<div>Count: {count}</div>
<button onClick={() => count(count() + 1)}>+1</button>
```

消除了命名 setter 的心智负担，代码更紧凑。

### 3.2 框架内部简化

- **信号创建**：`use(init)` 直接返回 `Signal<T>`，不再包装为元组。
- **引用已有信号**：`use(existingSignal)` 直接返回同一个 `Signal<T>`，无需解构再包装。
- **派生信号**：`use(dep, fn)` 返回 `Signal<T>`。
- **context.use**：与模块级 `use` 完全一致。
- **响应式绑定**：`h()` 检测 `isSignal(value)`（替代 `isUse`），如果是则创建派生绑定。
- **toValue**：逻辑不变，`isSignal(v) ? v() : v`。
- **API 数量**：`Getter<T>` 和 `Setter<T>` 两个类型统一为 `Signal<T>`。

### 3.3 破坏性变更

- 所有现有代码的 `const [getter, setter] = use(...)` 需要迁移为 `const signal = use(...)`。
- `getter()` 调用改为 `signal()`。
- `setter(v)` 调用改为 `signal(v)`。
- `isUse` 可能改名为 `isSignal`（或保留作为别名）。

## 四、为什么现在值得重新考虑

### 4.1 早期放弃的原因

在 v3.x 时代，Getter 和 Setter 合并被放弃，核心论点是同一个函数调用 `count()` 和 `count(1)` 分别代表读和写，会造成认知混乱。

### 4.2 重新评估

1. **实际代码中不存在真正的歧义**：开发者调用 `count` 时已经知道自己是在读还是在写。代码上下文提供了足够的语义区分。唯一边界情况 `signal(undefined)` 在 TypeScript 类型系统协助下极少误用。

2. **Vue 3 已验证**：`ref` 的读写合一已被社区接受三年，没有造成广泛认知问题。函数调用语法比 `.value` 属性更简洁。

3. **当前架构更成熟**：Owner 树重构和 `{ owner, nodes }` 二次重构完成后，框架核心将进一步模块化。信号系统作为相对独立的层，API 改动不会牵动太多其他模块。

4. **概念数量减少**：`Getter`/`Setter` 两个类型合并为 `Signal`，API 面积缩小，学习曲线降低。

5. **内部实现简化**：减少一层元组包装，信号创建和派生的代码路径更短。

## 五、实施时机

本方案建议在以下里程碑完成之后启动：

1. Owner 树架构重构（`currentOwner` 方案）完成并稳定。
2. `{ owner, nodes }` 返回值方案二次重构完成。

此时框架核心已完全稳定，信号系统的改动可以在独立的分支上进行，不影响已稳定的其他模块。

## 六、待讨论的开放问题

1. **`isUse` 命名**：是否改为 `isSignal`？`isUse` 与 `use` API 名称对应，但 `isSignal` 语义更准确。
2. **派生信号的 setter 语义**：当前派生 setter 触发重算，参数传入 `computeFn`。在新方案下语义不变，但 `signal(value)` 的调用是否需要在文档中明确区分“定义信号的直接替换”和“派生信号的重算触发”？
3. **TypeScript 重载顺序**：`Signal<T>` 需要两个重载（无参返回 `T`，有参返回 `void` 或 `T`），需要确保类型推导在常见场景中表现良好。

## 七、结论

**暂不实施，记录备查。** 本方案将在 Owner 树重构和 `{ owner, nodes }` 二次重构完成后，作为独立的 API 演进方向进行评估和讨论。届时可根据实际使用反馈和社区需求决定是否推进。
