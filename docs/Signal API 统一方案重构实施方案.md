# Kiaao Signal API 统一方案重构实施方案

**状态**：草案
**关联**：[Owner 树架构重构实施方案](./Owner树架构重构实施方案.md)、[`{ owner, nodes }` 返回值方案二次重构](./owner-nodes二次重构方案.md)
**日期**：2026年6月23日
**版本**：1.3

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
count((c) => c + 1); // 函数式更新 → 内部值变为 2
```

**判定规则**：`arguments.length === 0` 为读取，`arguments.length === 1` 为写入。传入函数参数时视为函数式更新。写入立即更新内部状态，返回 `void`，后续通过无参调用获取新值。

**Setter 返回值破坏性变更**：当前 `setCount(1)` 返回 `1`。新方案中 `count(1)` 返回 `void`。此变更的破坏面极小——当前源码中没有任何地方依赖 setter 的返回值。但仍需在迁移文档中明确标注为 breaking change。

### 2.2 类型定义与内部标记

```ts
interface Signal<T> {
  (): T; // 读取
  (value: T | ((prev: T) => T)): void; // 写入，返回 void
}
```

**内部标记**：当前所有信号函数（getter）都通过 `REACTIVE` Symbol 挂载内部状态。`isUse(v)` 通过检查 `v[REACTIVE] !== undefined` 来判断是否为信号。`REACTIVE` 既是检测标记，又是状态容器。

在新方案中，`Signal<T>` 函数同样挂载 `REACTIVE` 标记指向内部状态。**不需要引入新的 `IS_SIGNAL` Symbol**——`REACTIVE` 本身已经承担了标记与状态存储的双重职责，`isUse` 检查 `REACTIVE` 的逻辑完全不变。

### 2.3 与 Vue 3 `ref` 的对比

| 维度       | Vue 3 `ref`                      | Kiaao `Signal`                            |
| ---------- | -------------------------------- | ----------------------------------------- |
| 读取       | `count.value`                    | `count()`                                 |
| 写入       | `count.value = 1`                | `count(1)`                                |
| 函数式更新 | `count.value = prev => prev + 1` | `count(c => c + 1)`                       |
| JSX 绑定   | 自动解包（编译器处理）           | `{count}` → `h()` 检测 `isUse` 并创建派生 |
| 类型       | `Ref<T>`                         | `Signal<T>`                               |
| 额外概念   | `.value` 后缀                    | 无（函数调用）                            |

### 2.4 唯一边界情况：`signal(undefined)`

通过 `arguments.length` 判定彻底消除歧义——`signal(undefined)` 中 `arguments.length === 1`，明确是写入 `undefined`。不需要依赖 TypeScript 类型系统来规避误用，纯 JS 场景同样安全。

### 2.5 `use(signal)` 引用已有信号的语义

当前 `use(existingSignal)` 返回 `[signal, signal[REACTIVE].set]`。新方案下 `use(existingSignal)` **直接返回 `signal` 本身**——因为 `Signal<T>` 已经同时支持读和写，不需要包装为元组。

```ts
const count = use(0);
const sameCount = use(count); // sameCount === count
```

这一行为使 `use` 成为统一的"规范化入口"——无论传入普通值还是已有信号，始终返回 `Signal<T>`。普通值创建新信号，信号则原样返回。

### 2.6 信号作为 props 传递

当信号通过 props 传递给子组件时，行为自然兼容：

```tsx
<Comp value={count} />
```

`count` 是一个 `Signal<T>`，带有 `REACTIVE` 标记。子组件内部通过 `use(props.value)` 接收：

```ts
function Comp(props, { use }) {
  const value = use(props.value);
  // props.value 是 Signal → use(signal) 直接返回 signal 本身
  // value === props.value（同一个引用）
}
```

这在机制上完全畅通——`REACTIVE` 标记在传递过程中保持不变，`use(signal)` 的直通语义保证了引用透明性。

## 三、对框架各层面的影响

### 3.1 API 层面

**当前 API**：

```ts
function use<T>(initialValue: T): [Getter<T>, Setter<T>];
function use<T>(signal: Getter<T>): [Getter<T>, Setter<T>];
function use<T>(...deps: [...Signal[], (setValue?: any) => T]): [Getter<T>, Setter<T>];
```

**新 API**：

```ts
function use<T>(initialValue: T): Signal<T>;
function use<T>(signal: Signal<T>): Signal<T>;
function use<T>(...deps: [...Signal[], (setValue?: any) => T]): Signal<T>;
```

**辅助函数变化**：

- `isUse(v)` 保留命名，不更名。内部检查 `v[REACTIVE] !== undefined`，逻辑完全不变。
- `toValue(v)` 语义不变：`isUse(v) ? v() : v`。
- 废除 `Getter<T>` 和 `Setter<T>` 类型，统一为 `Signal<T>`。
- 不再引入新的 `IS_SIGNAL` Symbol——`REACTIVE` 继续承担标记和状态存储的双重职责。

### 3.2 `context.use` 的适配

`context.use` 与模块级 `use` 行为完全一致，同样返回 `Signal<T>`。由于 `context` 在创建时已绑定 Owner，通过 `context.use` 创建的 Signal 在组件卸载时自动清理。语义不变，类型简化。

### 3.3 JSX 中的使用

```jsx
const count = use(0);
return (
  <div>
    <p>Count: {count}</p>
    <button onClick={() => count(count() + 1)}>+1</button>
  </div>
);
```

在 JSX 中 `{count}` 的处理不变——`h()` 检测到 `isUse(value)` 为 true，创建响应式文本绑定，自动调用 `count()` 获取值。

### 3.4 派生信号的使用

```js
const count = use(0);
const double = use(count, () => count() * 2);
// double 也是 Signal，写入触发重算
```

这进一步体现了"数据平权"——所有信号在 API 层面完全同构，开发者不需要区分定义信号和派生信号。

### 3.5 内部实现简化

- **信号创建**：`use(init)` 直接返回 `Signal<T>`，不再包装为元组。
- **引用已有信号**：`use(existingSignal)` 直接返回同一个 `Signal<T>`。
- **派生信号**：`use(dep, fn)` 返回 `Signal<T>`。
- **响应式绑定**：`h()` 检测 `isUse(value)`，如果是则创建派生绑定。
- **API 数量**：`Getter<T>` 和 `Setter<T>` 两个类型统一为 `Signal<T>`。

### 3.6 `registerSignalStop` 的适配

当前信号清理注册函数中，`use(...)` 返回元组，通过 `result[0]` 提取 getter 来访问 `REACTIVE.stop`。新方案下 `use(...)` 直接返回 `Signal<T>`，`result` 就是信号函数本身：

```ts
// 旧
const result = (use as (...a: any[]) => any)(...args);
const getter = result[0];
const stop = getter[REACTIVE]?.stop;

// 新
const signal = (use as (...a: any[]) => any)(...args);
const stop = (signal as any)[REACTIVE]?.stop;
```

此改动需要在迁移文件清单中补充 `src/core/signal.ts`（或对应的信号生命周期文件）。

## 四、类型链影响范围

废除 `Getter<T>` / `Setter<T>`、统一为 `Signal<T>` 需要更新以下文件：

| 文件                    | 变更                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `src/core/types.ts`     | 定义 `Signal<T>` 类型，移除 `Getter<T>` / `Setter<T>`，移除 `GETTER_BRAND`（如有） |
| `src/reactive/core.ts`  | `use()` 实现改为返回 `Signal<T>`                                                   |
| `src/core/signal.ts`    | `registerSignalStop` 中 `result[0]` → `result`                                     |
| `src/core/component.ts` | `context.use` 返回类型 `UseFunction` → `Signal<T>`                                 |
| `src/index.ts`          | 更新导出类型                                                                       |
| `src/dom/directives.ts` | `each` 循环中 `use(item)` 的使用适配；`when` 内部信号类型更新                      |
| `src/dom/h.ts`          | `processChildren` 中的 `isUse` 调用保持不变                                        |
| `src/dom/props.ts`      | 响应式属性绑定中的类型更新                                                         |
| `src/motion/index.ts`   | 动画扩展中的信号类型更新                                                           |
| 所有测试文件            | `Getter`/`Setter` 类型引用更新；元组解构改为直接赋值                               |

## 五、迁移指南

### 5.1 破坏性变更

| 旧写法                                       | 新写法                          | 说明                     |
| -------------------------------------------- | ------------------------------- | ------------------------ |
| `const [count, setCount] = use(0)`           | `const count = use(0)`          | 不再返回元组             |
| `count()`                                    | `count()`                       | 无变化                   |
| `setCount(1)`                                | `count(1)`                      | 写入改为调用 signal 本身 |
| `setCount(undefined)`                        | `count(undefined)`              | 无歧义：有参即写入       |
| `setCount(c => c + 1)`                       | `count(c => c + 1)`             | 函数式更新               |
| `const [double, setDouble] = use(count, fn)` | `const double = use(count, fn)` | 派生信号也返回 Signal    |
| `setDouble(10)`                              | `double(10)`                    | 触发重算                 |
| `setCount(1)` 返回 `1`                       | `count(1)` 返回 `void`          | **Setter 返回值变更**    |
| `isUse(v)`                                   | 保持不变                        | 内部检查 `REACTIVE` 标记 |

### 5.2 无需修改的部分

- `toValue(v)` 的语义和行为不变。
- `h()` 的 JSX 绑定逻辑不变（检测函数 `isUse` 保持不变）。
- `context.onMount` / `context.onUnmount` 不变。
- `direct(fn)` 及其指令签名不变。
- 所有控制流（`when`/`each`）不变。
- Portal、lazy、动画扩展等上层 API 不变。

### 5.3 迁移工具

可提供一个 codemod 脚本，自动将：

- `const [getter, setter] = use(...)` 转换为 `const getter = use(...)`，并将后续的 `setter(...)` 替换为 `getter(...)`。

## 六、实施路径

### 第一阶段：类型与基础 API

1. 在 `src/core/types.ts` 中定义 `Signal<T>` 类型，移除 `Getter<T>` / `Setter<T>` 及 `GETTER_BRAND`。
2. 修改 `use` 的返回值为 `Signal<T>`。
3. 适配 `registerSignalStop`（`result[0]` → `result`）。
4. 适配 `context.use` 返回类型。
5. 适配所有内部模块的类型引用。

### 第二阶段：消费方适配

1. 适配 `when`/`each`（包括 `each` 循环中 `use(item)` 的使用）。
2. 适配动画扩展（`createMotion`/`createGroupMotion`）。
3. 适配 JSX 运行时（类型签名）。
4. 适配 `createApp`。

### 第三阶段：测试与文档

1. 更新所有单元测试和集成测试。
2. 更新 TypeScript 类型定义。
3. 更新框架规范和引导文档。
4. 提供迁移指南和 codemod 脚本。

## 七、优势总结

- **判定精确**：`arguments.length` 彻底消除 `signal(undefined)` 歧义，纯 JS 场景同样安全。
- **API 简洁**：消除解构样板代码，状态较多的组件代码量显著减少。
- **数据平权**：定义信号和派生信号在 API 层面完全同构，`use(signal)` 直通返回自身。
- **内部实现简化**：减少一层元组包装，信号创建和派生的代码路径更短。`REACTIVE` 继续承担标记和状态存储职责，不需要引入新 Symbol。
- **与 Vue 3 的体验一致**：Vue 社区已验证"读写合一"模式，Kiaao 的函数调用语法比 `.value` 更简洁。
- **向后兼容路径清晰**：破坏性变更可自动化迁移。`isUse` 保留命名减少机械性改动范围。

## 八、风险与缓解

- **风险**：`signal()` 和 `signal(value)` 的语义区分依赖于参数个数，极少数场景可能误用。
- **缓解**：`arguments.length` 判定比"有参即写入"更精确；TypeScript 类型系统区分无参重载和有参重载；`signal(undefined)` 明确判定为写入。
- **风险**：setter 返回值从 `T` 改为 `void`。
- **缓解**：当前源码中无任何地方依赖 setter 返回值，破坏面极小。文档中明确标注为 breaking change。

## 九、结论

Signal API 统一方案是 Kiaao API 演进的最后一块拼图。在 Owner 树重构和 `{ owner, nodes }` 返回值方案重构完成后，Kiaao 的架构将达到前所未有的纯粹性——无全局上下文、所有权显式传递、响应式 API 极简。本方案可在前两次重构稳定后作为独立的 API 优化进行实施。
