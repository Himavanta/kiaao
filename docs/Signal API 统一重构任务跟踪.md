# Signal API 统一重构 — 任务跟踪

> 关联方案：[Signal API 统一方案重构实施方案](./Signal%20API%20统一方案重构实施方案.md)
> 状态：🟡 规划中
> 开始日期：待定

---

## 总体目标

将 `use()` 的返回值从 `[getter, setter]` 元组改为单一的 `Signal<T>` 函数对象，通过 `arguments.length` 区分读取和写入。

### 核心变更

| 从                                       | 到                                      |
| ---------------------------------------- | --------------------------------------- |
| `use()` 返回 `[Getter<T>, Setter<T>]`    | `use()` 返回 `Signal<T>`                |
| `const [count, setCount] = use(0)`       | `const count = use(0)`                  |
| `setCount(1)`                            | `count(1)`                              |
| `isUse` 检查 `v[REACTIVE] !== undefined` | **不变**（`REACTIVE` 继续承担标记职责） |
| `Getter<T>` / `Setter<T>` 类型           | `Signal<T>` 统一类型                    |
| `registerSignalStop` 中 `result[0]`      | `signal` 直接访问 `signal[REACTIVE]`    |

---

## 阶段划分

每条横线分隔一个阶段。每个阶段完成后需要通过全部测试才能请求确认。

---

### 阶段一：类型定义 + `use()` 核心实现

**依赖**：无

**范围**：定义 `Signal<T>` 类型，修改 `use()` 返回 `Signal<T>` 而非元组，更新 `createSignal`、`registerSignalStop`。

#### 文件清单

| 文件                 | 动作 | 内容                                                                                                                                                                      |
| -------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/types.ts`  | 更新 | 定义 `Signal<T>`，移除 `Getter<T>` / `Setter<T>` / `GETTER_BRAND`，保留 `REACTIVE`、`DefinitionState`、`DerivationState`、`SignalState`（内部状态结构不变）               |
| `src/core/signal.ts` | 更新 | `use()` 返回 `Signal<T>` 而非 `[Getter<T>, Setter<T>]`；`createSignal` 返回值改为 `Signal<T>`；`registerSignalStop` 中 `result[0]` → `result`；`UseFunction` 类型同步更新 |

#### 关键实现细节

**`Signal<T>` 类型**：

```ts
export interface Signal<T> {
  (): T;
  (value: T | ((prev: T) => T)): void;
}
```

**`createSignal` 变化**：

```ts
// 旧
function createSignal<T>(getter, setter, state): [Getter<T>, Setter<T>] {
  (getter as any)[REACTIVE] = state;
  state.set = setter;
  return [getter, setter];
}

// 新
function createSignal<T>(getter, setter, state): Signal<T> {
  (getter as any)[REACTIVE] = state;
  state.set = setter;
  return getter as Signal<T>;
}
```

**`registerSignalStop` 变化**：

```ts
// 旧
const result = (use as (...a: any[]) => any)(...args);
const getter = result[0];
const stop = (getter as any)[REACTIVE]?.stop;

// 新
const signal = (use as (...a: any[]) => any)(...args);
const stop = (signal as any)[REACTIVE]?.stop;
```

**`use` 类型重载变化**：

```ts
// 旧
export type UseFunction = {
  <T>(signal: Getter<T>): [Getter<T>, Setter<T>];
  <T>(initialValue: T): [Getter<T>, Setter<T>];
  <T>(...deps: [...Getter<any>[], (v?: any) => T]): [Getter<T>, Setter<T>];
};

// 新
export type UseFunction = {
  <T>(signal: Signal<T>): Signal<T>;
  <T>(initialValue: T): Signal<T>;
  <T>(...deps: [...Signal<any>[], (v?: any) => T]): Signal<T>;
};
```

**定义模式 changes**：`definitionMode` 直接返回 `Signal<T>`：

```ts
// 旧
function definitionMode<T>(initialValue: T): [Getter<T>, Setter<T>] {
  // ... state setup
  return createSignal(getter, setter, state);
}

// 新
function definitionMode<T>(initialValue: T): Signal<T> {
  // ... state setup (不变)
  return createSignal(getter, setter, state) as Signal<T>;
}
```

**派生模式 changes**：

```ts
// 旧
function derivationMode<T>(...args: any[]): [Getter<T>, Setter<T>] {
  // ... buildDerivationState, computeInitialDerivedValue
  return createSignal(getter, setter, state);
}

// 新
function derivationMode<T>(...args: any[]): Signal<T> {
  // ... 内部逻辑完全不变
  return createSignal(getter, setter, state) as Signal<T>;
}
```

**引用已有信号变化**：

```ts
// 旧
if (isSingle(args)) {
  const val = args[0];
  if (isUse(val)) {
    const state = (val as any)[REACTIVE] as { set: Setter<any> };
    return [val, state.set];
  }
  return definitionMode(val);
}

// 新
if (isSingle(args)) {
  const val = args[0];
  if (isUse(val)) {
    return val as Signal<T>; // 直接返回信号本身
  }
  return definitionMode(val);
}
```

#### 测试覆盖

| 测试                                  | 说明                                                  |
| ------------------------------------- | ----------------------------------------------------- |
| `use(0)` 返回 `Signal<number>`        | `typeof signal === "function"`                        |
| `count()` 读取值                      | `count()` → `0`                                       |
| `count(5)` 写入值                     | `count(5)`, `count()` → `5`                           |
| `count(c => c + 1)` 函数式更新        | `count(5)`, `count(c => c + 1)` → `6`                 |
| `count(undefined)` 写入 undefined     | `count(undefined)` → `count()` 返回 `undefined`       |
| `use(existingSignal)` 返回同一引用    | `const a = use(0); const b = use(a); b === a`         |
| 派生信号 `use(count, fn)` 返回 Signal | `typeof double === "function"`, `double()` 返回计算值 |
| 派生信号写入触发重算                  | `double(100)` 触发 `computeFn`                        |
| `isUse(signal)` 返回 true             | 对 `Signal` 对象 `isUse` 正确检测                     |
| `toValue(signal)` 解包                | `toValue(count)` → `count()`                          |
| `registerSignalStop` 适配             | `result` 直接访问 `[REACTIVE].stop`                   |

---

### 阶段二：内部消费方适配（`core/` 和 `dom/`）

**依赖**：阶段一（类型和 `use` 实现已更新）

**范围**：更新所有直接使用 `[getter, setter]` 元组解构的核心模块。

#### 文件清单

| 文件                           | 变更                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `src/core/component.ts`        | `context.use` 返回 `Signal<T>`；`createContextUse` 适配 `registerSignalStop` |
| `src/core/process-children.ts` | `isUse(child)` 检查不变（`child` 就是 `Signal`）                             |
| `src/core/directives.ts`       | `each` 循环中 `use(rawValue)` 的解构改为直接赋值                             |
| `src/dom/props.ts`             | `isUse(value)` 检查不变；`value()` 调用不变                                  |
| `src/core/owner.ts`            | 无变化（与信号类型无关）                                                     |

#### 关键适配点

**`each` 循环中的信号创建**（`directives.ts`）：

```ts
// 旧
const [getter, setter] = use(rawValue);
itemSignalMap.set(identity, [getter, setter]);

// 新
const itemSignal = use(rawValue);
itemSignalMap.set(identity, itemSignal);
```

使用处变化：

```ts
// 旧
const itemGetter = itemSignalMap.get(identity)![0]; // 提取 getter
const [getter, setter] = itemSignalMap.get(identity)!;
if (!isUse(rawValue)) setter(rawValue);

// 新
const itemSignal = itemSignalMap.get(identity)!;
if (!isUse(rawValue)) itemSignal(rawValue); // 直接调用 signal 写入
```

**`context.use`**（`component.ts`）：

```ts
// 旧
function createContextUse(owner): UseFunction {
  return ((...args) => {
    return registerSignalStop(args, (stop) => {
      owner.cleanups.push(stop);
    });
  }) as UseFunction;
}
```

`UseFunction` 返回类型变为 `Signal<T>`，`registerSignalStop` 适配 `result` 而非 `result[0]`。

#### 测试覆盖

| 测试                               | 说明                              |
| ---------------------------------- | --------------------------------- |
| `context.use(0)` 返回 `Signal`     | 类型和运行时正确                  |
| `context.use(signal)` 返回同一引用 | `use(b) === b`                    |
| `context.use(count, fn)` 派生      | 派生返回 `Signal`，写入触发重算   |
| `each` 中使用 `use(item)`          | 列表渲染正常，item 信号读/写正确  |
| `setProps` 响应式属性              | `isUse(value)` 检测正常，绑定正常 |

---

### 阶段三：消费方解构替换 + 测试更新

**依赖**：阶段一、阶段二

**范围**：替换所有测试文件和外部 API 中的 `[getter, setter] = use(...)` 解构模式。

#### 文件清单

| 文件                                | 变更                                                 |
| ----------------------------------- | ---------------------------------------------------- |
| `src/index.ts`                      | 导出 `Signal<T>` 替代 `Getter<T>` / `Setter<T>`      |
| `src/jsx-runtime/index.ts`          | 类型引用更新（如有 `Getter`/`Setter` 引用）          |
| `src/server/index.ts`               | 无变化（不直接使用信号类型）                         |
| `src/motion/create-motion.ts`       | 信号类型更新                                         |
| `src/motion/create-group-motion.ts` | 信号类型更新                                         |
| `tests/core/signal.test.ts`         | 所有 `const [c, setC] = use(0)` → `const c = use(0)` |
| `tests/core/h.test.ts`              | 同上                                                 |
| `tests/core/hresult.test.ts`        | 同上                                                 |
| `tests/core/directives.test.ts`     | 同上                                                 |
| `tests/core/owner.test.ts`          | 同上                                                 |
| `tests/core/create-app.test.ts`     | 同上                                                 |
| `tests/dom/adapter.test.ts`         | 同上                                                 |
| `tests/server/ssr.test.ts`          | 同上                                                 |

#### 测试覆盖（全量回归）

所有 165+ 现有测试通过。无功能变更。

---

### 阶段四：极端测试与边界验证

**依赖**：阶段一至三全部完成

**范围**：极端情况验证，确保 `arguments.length` 判定在所有场景下正确。

#### 测试覆盖

| 测试                                        | 说明                                                  |
| ------------------------------------------- | ----------------------------------------------------- |
| `signal()` 读取（0 参数）                   | `arguments.length === 0`                              |
| `signal(0)` 写入（1 参数）                  | `arguments.length === 1`                              |
| `signal(undefined)` 写入 1 参               | 明确为写入，非读取                                    |
| `signal(null)` 写入                         | null 作为值存储                                       |
| `signal(true)` / `signal(false)` 写入       | 布尔值写入                                            |
| `signal("")` 写入空字符串                   | 空字符串作为值                                        |
| `signal(c => c)` 函数式更新                 | 传入函数时执行更新                                    |
| 深嵌套信号链                                | `a → b → c` 三层派生，`a(5)` 触发 `b()` 和 `c()` 重算 |
| 信号短路                                    | `use(a, () => 5)` 两次写入相同值，下游不触发          |
| `registerSignalStop` 注册的清理函数正确停止 | 确认 `stop()` 后信号不再更新                          |

---

## 阶段依赖图

```
阶段一（Signal<T> 类型 + use 实现）
  │
  ▼
阶段二（内部消费方适配：core/ + dom/）
  │
  ▼
阶段三（消费方解构替换 + 测试更新）
  │
  ▼
阶段四（极端测试）
```

## 进度跟踪

| 阶段                        | 状态      | 开始 | 结束 | 确认      |
| --------------------------- | --------- | ---- | ---- | --------- |
| 阶段一：类型 + `use()` 核心 | 🔴 待开始 | —    | —    | ⏳        |
| 阶段二：内部消费方适配      | ✅ 完成   | —    | —    | ⏳ 待确认 |
| 阶段三：解构替换 + 测试     | ✅ 完成   | —    | —    | ⏳ 待确认 |
| 阶段四：极端测试            | ✅ 完成   | —    | —    | ⏳ 待确认 |

---

## 注意事项

1. **`isUse` 保留命名**，不改为 `isSignal`。检查逻辑不变（`v[REACTIVE] !== undefined`）。
2. **`REACTIVE` Symbol 不变**，继续承担标记 + 内部状态容器的双重职责。
3. **Setter 返回值从 `T` 变为 `void`**——当前源码中无任何地方依赖 setter 返回值，破坏面极小。
4. **`signal(undefined)` 明确判为写入**——`arguments.length === 1`。这是语义上的正确行为。
5. **`signal()` 判为读取**——`arguments.length === 0`。任何时候无参调用均为读。
