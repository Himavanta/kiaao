# context.use — 组件级派生自动清理 & toUse 吸收 & toValueue 重命名 方案

**状态**：定稿
**关联**：kiaao v4.1 生命周期与组件模型
**前置依赖**：组件 Context 与异步组件规范 v3.2

## 一、问题背景

### 1.1 组件内派生泄漏

v4 重构中，`effectStops` 被移除。组件内通过模块级 `use(signal, fn)` 显式创建的派生，在组件卸载后仍继续响应信号变化。虽然 DOM 已不存在，但派生仍然重新计算、尝试更新已移除的文本节点。这是纯粹的资源泄漏。

### 1.2 toUse 的定位尴尬

`toUse` 作为独立的规范化 API，用于将"可能是普通值也可能是信号"的 props 统一转换为 `[getter, setter]`。它与 `use` 职责相近但语义不同——`use` 创建，`toUse` 适配。这增加了 API 数量，也增加了开发者的选择负担。

### 1.3 尝试过的方案：模块级 currentComponent 自动注册

在 `h()` 调用 `tag(props, context)` 的同步执行期间，设置模块级变量 `currentComponent`，让顶层 `use` 在创建派生时自动将 `stop` 注册到当前组件实例。

**否决原因**：异步陷阱。异步组件内部 `await` 之后的代码在微任务队列中恢复执行，此时 `h()` 早已返回，`currentComponent` 已重置为 null：

```js
async function Comp(props, context) {
  const [a] = use(0); // ✅ 同步执行期间，可被注册

  const data = await fetch();
  const [b] = use(data, fn); // ❌ await 后，currentComponent 已为 null

  onMount(() => {
    const [c] = use(signal); // ❌ 更不会被注册
  });
}
```

任何依赖"同步执行期间"的自动机制，在异步组件面前必然失效。这与之前废弃全局组件实例栈的原因同根同源——框架不能依赖调用时机来推断归属。

## 二、方案设计

### 2.1 核心思路一：context.use

将 `use` 放入 `context`，让组件实例通过 `context.use` 直接提供绑定实例的派生创建能力。

```js
import { use } from "kiaao";

// 模块级 use — 创建全局信号，独立于任何组件
const [a, setA] = use(1);

function Comp(props, { onMount, onUnmount, use }) {
  // context.use — 创建组件级信号，卸载时自动清理
  const [b, setB] = use(2);
  return <div>{a() + b()}</div>;
}
```

**为什么没有异步陷阱**：`context.use` 绑定在 `context` 对象上，而 `context` 是组件函数的参数——词法作用域中的引用。无论代码在同步执行、`await` 之后、`onMount` 回调内部、还是嵌套函数中，只要 `context` 在作用域内，`context.use` 创建的派生就属于当前组件。这是 JavaScript 语言本身的保证，不需要框架做任何执行时推断。

### 2.2 核心思路二：toUse 吸收进 use

**讨论过程**：

- **观点 A（最初）**：保留 `toUse`。理由是 `use` 的语义是"创建新信号"，`toUse` 的语义是"规范化输入"。两者职责互补，不应合并。
- **观点 B（最终采纳）**：吸收 `toUse`。理由有四：

1. `use` 的语义本身就不单一——它已是定义模式和派生模式的合体。吸收 `toUse` 的"规范化"能力，不会让 `use` 变得更难理解。
2. 合并后，`context` 上的 API 从 `{ onMount, onUnmount, use, toUse }` 缩减为 `{ onMount, onUnmount, use }`，接口更紧凑。
3. 当前 `use(信号)` 的行为是创建一个新信号，把信号函数作为初始值存储——这在极其特定的场景下可能有用，但对绝大多数开发者来说，产生的困惑远大于价值。
4. 统一后，开发者不需要在心里区分"这是创建还是适配"——拿到一个值，不确定它是普通值还是信号，就扔给 `use`。

**合并后 `use` 的新行为**：

- `use(普通值)` → 创建新信号，返回 `[getter, setter]`
- `use(信号)` → **直接返回** `[getter, getter[REACTIVE].set]`
- `use(...deps, fn)` → 派生模式

参数解析逻辑调整为：**先判断一元调用时传入的是否是信号，如果是则直接返回已有信号；如果不是信号，再检查参数个数和类型，检测最后一个是否是函数。** 这避免了信号被误判为计算函数（信号本身是函数）。

### 2.3 核心思路三：toValue 重命名为 toValueue

`toValue` 的简写不再必要。既然 `toUse` 已被吸收，不再需要与 `toValue` 并列作为两个独立的转换 API，`toValueue` 更明确——它告诉开发者"调用这个方法会返回一个值"。与 `use`、`isUse` 放在一起也更协调。

### 2.4 两层 use 的职责

|            | 模块级 `use`                  | `context.use`                            |
| ---------- | ----------------------------- | ---------------------------------------- |
| 导入来源   | `import { use } from 'kiaao'` | `context` 参数解构                       |
| 创建的资源 | 全局信号                      | 组件级信号                               |
| 生命周期   | 应用级，开发者自行管理        | 组件级，卸载时自动清理                   |
| 使用场景   | 全局 store、跨组件共享状态    | 组件内部局部状态、派生计算、props 规范化 |

两者语法完全一致，区别仅在于资源归属。

### 2.5 组件已销毁后调用 context.use

与 `onMount`/`onUnmount` 一样，`context.use` 可能在组件已销毁后被调用——典型的场景是异步组件的 `await` 期间组件被卸载：

```js
async function Comp(props, { use }) {
  const [a] = use(0); // ✅ 组件存活

  await fetch("/api"); // ← 在此期间组件可能被卸载

  const [b] = use(42); // ⚠️ 如果已销毁？
}
```

**处理方式**：

- **开发模式**：`console.warn` 警告，返回一个安全的 `[getter, setter]` 元组。getter 返回 `undefined`，setter 是空函数。防止解构崩溃。
- **生产模式**：静默返回同样的安全元组，不打印警告。

## 三、组件卸载时的清理行为

### 3.1 信号和派生是独立的资源

组件只清理自己创建的资源，不触碰外部传入的信号。

- **子组件用 `context.use(parentSignal)` 直接引用**：不创建新资源，不需要清理。子组件只是借用父组件的信号引用，卸载时什么都不做。
- **子组件用 `context.use(parentSignal, fn)` 创建派生**：创建了一个新的派生节点，它依赖 `parentSignal`。卸载时清理这个派生节点——调用 `stop` 从 `parentSignal.subs` 中移除自己。`parentSignal` 本身不受影响。
- **子组件用 `context.use(普通值)` 创建新信号**：这是一个完全独立的信号，卸载时清理这个信号及其所有订阅者。

### 3.2 清理机制

每个信号的 `stop` 方法只清理自己——遍历 `stops` 集合，从每个依赖的 `subs` 中移除自己，清空自己的 `subs`。它不会修改依赖它的上游信号。组件卸载时，`disposeNode` 执行当前组件的 `unmountCallbacks`，其中包含了 `context.use` 注册的所有 `stop`。每个派生各自清理自己的订阅，互不影响。

## 四、实现细节

### 4.1 `use` 的参数解析逻辑调整

```ts
export function use(...args) {
  // 一元调用：可能是定义模式，也可能是收到一个信号
  if (args.length === 1) {
    const val = args[0];
    // 如果是信号，直接返回 [getter, setter]
    if (isUse(val)) {
      return [val, val[REACTIVE].set];
    }
    // 否则创建新信号
    return createDefinitionNode(val);
  }

  // 多元调用：派生模式
  const deps = args.slice(0, -1);
  const fn = args[args.length - 1];

  if (typeof fn !== "function" || isUse(fn)) {
    if (__DEV__) console.warn("[kiaao] Invalid compute function in derivation");
    return;
  }

  return createDerivationNode(deps, fn);
}
```

### 4.2 内部数据结构更新

为定义模式信号添加 `stop` 方法（空操作），使所有信号的 `REACTIVE` 状态都包含 `stop` 字段：

```ts
interface DefinitionState<T> {
  value: T;
  subs: Set<DerivationState<any>>;
  set: Setter<T>;
  stop: () => void; // 定义模式无上游依赖，stop 为空操作
}

interface DerivationState<T> {
  deps: Set<SignalState<any>>;
  cachedValue: T;
  subs: Set<DerivationState<any>>;
  computeFn: (v?: any) => T;
  set: Setter<T>;
  stops: Set<() => void>;
  stop: () => void; // 从所有 deps 的 subs 中移除自身并清空 stops
}
```

```ts
function createDefinitionNode<T>(initialValue: T): [Getter<T>, Setter<T>] {
  const state: DefinitionState<T> = {
    value: initialValue,
    subs: new Set(),
    set: null as any,
    stop: () => {}, // 空操作：定义模式无上游依赖
  };
  // ...
}
```

### 4.3 context 构建

```ts
function buildContext(instance) {
  // 安全占位：组件已销毁时返回的无操作信号
  const createSafeSignal = () => {
    const noop = () => {};
    noop[REACTIVE] = { value: undefined, subs: new Set(), set: noop, stop: () => {} };
    return [noop, noop] as [Getter<any>, Setter<any>];
  };

  return {
    onMount: (fn) => {
      if (instance[DISPOSED_KEY]) {
        if (__DEV__) console.warn("[kiaao] onMount called after component disposed");
        return;
      }
      if (instance[INITIALIZED_KEY]) {
        safeCall(fn, "onMount");
      } else {
        instance.mountCallbacks.push(fn);
      }
    },
    onUnmount: (fn) => {
      if (instance[DISPOSED_KEY]) {
        if (__DEV__) console.warn("[kiaao] onUnmount called after component disposed");
        return;
      }
      instance.unmountCallbacks.push(fn);
    },
    use: (...args) => {
      // 组件已销毁，返回安全占位
      if (instance[DISPOSED_KEY]) {
        if (__DEV__) console.warn("[kiaao] context.use called after component disposed");
        return createSafeSignal();
      }

      const result = use(...args); // 调用模块级 use（已吸收 toUse）
      const getter = result[0];

      // 引用已有信号（未创建新资源），不注册清理
      if (args.length === 1 && isUse(args[0]) && result[0] === args[0]) {
        return result;
      }

      // 创建了新资源（定义模式或派生模式），注册 stop 到组件实例
      const stop = getter[REACTIVE].stop;
      instance.unmountCallbacks.push(stop);
      return result;
    },
  };
}
```

### 4.4 安全占位信号

当组件已销毁后调用 `context.use`，返回的安全元组行为：

- `getter()` 始终返回 `undefined`
- `setter(v)` 不做任何操作
- `getter` 上挂载 `REACTIVE` 标记（使 `isUse` 返回 `true`），防止解构和使用时抛错

### 4.5 移除的 API

- `toUse` 从公开导出中移除，其功能完全被 `use` 吸收
- `toValue` 重命名为 `toValueue`

## 五、场景验证

### 5.1 异步组件内部使用

```js
async function Comp(props, { onMount, use }) {
  const [a] = use(0); // ✅ 注册到 Comp 实例

  const data = await fetch();
  const [b] = use(data, fn); // ✅ await 后仍有效

  onMount(() => {
    const [c] = use(signal, fn); // ✅ 闭包中仍有效
  });

  return <div>{b}</div>;
}
// 卸载 Comp → a、b、c 全部自动清理
```

### 5.2 组件 await 期间被卸载后调用 context.use

```js
async function Comp(props, { use }) {
  const [a] = use(0); // ✅ 正常创建

  await fetch("/api"); // ← 期间组件被卸载

  const [b, setB] = use(42); // ⚠️ 组件已销毁
  // 开发模式：打印警告
  // b() → undefined（不崩溃）
  // setB(100) → 无操作（不崩溃）
}
```

### 5.3 Props 规范化

```js
function Slider(props, { use }) {
  const [value, setValue] = use(props.value);
  // props.value 是 42 → 创建新信号
  // props.value 是 count → 直接返回引用
  return <input value={value()} onInput={(e) => setValue(e.target.value)} />;
}
```

### 5.4 嵌套组件与工厂函数

```js
function useCounter(context) {
  const [count, setCount] = context.use(0);
  return { count, setCount };
}

function Comp(props, context) {
  const { count, setCount } = useCounter(context);
  return <div>{count}</div>;
}
```

### 5.5 外部 store 与组件级派生

```js
import { userStore } from "./store.js";

function Comp(props, { use }) {
  const [name] = use(userStore, () => userStore().name);
  return <div>{name}</div>;
}
```

`userStore` 是模块级全局信号，`name` 是组件级派生——依赖全局数据源，但生命周期绑定到当前组件。

## 六、设计哲学

**显式高于隐式。** `context.use` 明确表达了"这个派生绑定到当前组件"。对比之前 `currentComponent` 方案中框架替开发者推断归属，这里开发者通过调用位置直接声明意图。

**词法作用域解决异步问题。** `context` 是函数参数，它的生命周期与函数执行无关——只要闭包持有 `context`，`context.use` 就能正确注册。这是 JavaScript 语言本身的保证。

**同构设计降低学习成本。** 模块级 `use` 和 `context.use` 语法完全一致。开发者只需要知道"在哪调用，就归谁管"。

**吸收而非堆叠。** 将 `toUse` 的能力纳入 `use`，减少了 API 数量，也让"规范化外部值"成为 `use` 的自然延伸——`use` 本身就是"创建响应式状态"的总入口。

**防御性兜底。** 与 `onMount`/`onUnmount` 一致，`context.use` 在组件已销毁后返回安全占位，不抛错、不崩溃，同时在开发模式下提供明确警告。

**文档版本**：v1.2
**撰写日期**：2026年6月12日
**状态**：定稿
