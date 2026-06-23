# Kiaao Signal API 统一方案重构实施方案

**状态**：草案
**关联**：[Owner 树架构重构实施方案](./Owner树架构重构实施方案.md)、[`{ owner, nodes }` 返回值方案二次重构](./owner-nodes二次重构方案.md)
**日期**：2026年6月23日
**版本**：1.1

## 一、背景与动机

Kiaao 当前通过 `use` API 创建响应式状态，返回 `[getter, setter]` 元组。这种设计在状态较多的组件中产生显著的解构样板代码，且对派生信号的读写语义增加了心智负担。随着 Owner 树重构和 `{ owner, nodes }` 方案推进，Kiaao 的架构高度模块化，信号系统作为独立层进行 API 简化的时机已经成熟。

**本次重构的目标**：将 `use` 的返回值从 `[getter, setter]` 元组改为单一的 `Signal<T>` 函数对象，通过 `arguments.length` 区分读取和写入，消除解构样板代码。

## 二、核心设计：`Signal<T>` 统一读写

### 2.1 基本语义

`Signal<T>` 是一个函数对象，根据调用时传入的参数个数决定行为：

```ts
const count = use(0);

count(); // 读取 → 0
count(1); // 写入 → 1
count(undefined); // 写入 undefined
count((c) => c + 1); // 函数式更新 → 2
```

**判定规则**：`arguments.length === 0` 为读取，`arguments.length === 1` 为写入。传入函数参数时视为函数式更新。写入立即更新内部状态，返回 `void`，后续通过无参调用获取新值。

### 2.2 类型定义

```ts
interface Signal<T> {
  (): T; // 读取
  (value: T | ((prev: T) => T)): void; // 写入，返回 void
  [IS_SIGNAL]: true; // 内部标记
}
```

## 三、对框架各层面的影响

### 3.1 API 层面

- `use(init: T): Signal<T>`
- `use(signal: Signal<T>): Signal<T>`
- `use(...deps, fn): Signal<T>`

`context.use` 与模块级 `use` 行为完全一致。`isUse` 重命名为 `isSignal`，`toValue` 语义不变。废除 `Getter<T>` 和 `Setter<T>` 类型，统一为 `Signal<T>`。

### 3.2 JSX 中的使用

```jsx
const count = use(0);
<div>Count: {count}</div>                     // 自动绑定
<button onClick={() => count(count() + 1)}>+1</button>
```

`h()` 检测 `isSignal(value)` 后创建响应式绑定，逻辑不变。

## 四、迁移指南

| 旧写法                                       | 新写法                          |
| -------------------------------------------- | ------------------------------- |
| `const [count, setCount] = use(0)`           | `const count = use(0)`          |
| `setCount(1)`                                | `count(1)`                      |
| `setCount(undefined)`                        | `count(undefined)`              |
| `const [double, setDouble] = use(count, fn)` | `const double = use(count, fn)` |
| `isUse(v)`                                   | `isSignal(v)`                   |

无需修改的部分包括 `toValue`、生命周期、指令、控制流等所有上层 API。

## 五、实施路径

分三个阶段：类型与基础 API → 消费方适配 → 测试与文档。破坏性变更可编写 codemod 脚本辅助迁移。

## 六、优势总结

- **判定精确**：`arguments.length` 彻底消除 `signal(undefined)` 歧义
- **API 简洁**：消除解构样板，概念数量减少
- **数据平权**：定义信号和派生信号在 API 层面完全同构
- **内部简化**：减少元组包装，代码路径更短
- **与 Vue 3 体验一致**：函数调用语法比 `.value` 更简洁，语义更自然

## 七、结论

Signal API 统一方案是 Kiaao API 演进的最后一块拼图。在架构重构完成后，本方案可作为独立的 API 优化实施，为开发者提供极简的响应式编程体验。
