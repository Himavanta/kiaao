# Reactivity / 响应式系统

`use` is the single API for creating reactive state in kiaao. It takes different forms depending on how many arguments you pass and what you pass, but it always returns a `Signal<T>` — a unified function object that reads when called with no arguments and writes when called with a value. There is no separate API for derived values, side effects, or value normalization — everything is a signal, and everything goes through `use`.

`use` 是 kiaao 中创建响应式状态的唯一入口。根据传入参数的数量和类型，它会呈现不同的形式，但始终返回 `Signal<T>` —— 一个统一的函数对象，无参调用时读取，有参调用时写入。没有用于派生值、副作用或值规范化的单独 API——一切都是信号，一切都通过 `use`。

## Definition Mode / 定义模式

When called with a single argument that is not a signal, `use` creates a writable signal. The initial value can be anything: a number, a string, an object, a function, a Promise — nothing is treated specially.

当传入一个参数且不是信号时，`use` 创建一个可写信号。初始值可以是任何东西：数字、字符串、对象、函数、Promise——没有任何特殊处理。

```js
const count = use(0);
const user = use({ name: "tom", age: 18 });

// Reading / 读取
console.log(count()); // 0
console.log(user().name); // 'tom'

// Writing / 写入
count(42); // direct replacement / 直接替换
count(count() + 1); // read + write / 读取后再写入
user({ ...user(), age: 19 });
```

A **Signal** is a function that carries a `[REACTIVE]` Symbol key on itself — this is how kiaao tells a signal apart from a plain function. `isUse(v)` checks for this marker. Calling a signal with no arguments returns its current value. Calling it with a value replaces the stored value. This means `() => T` (a plain function) is **not** a signal, and APIs that expect `Signal<T>` do not accept thunks.

**Signal** 是一个携带 `[REACTIVE]` Symbol 键的函数——kiaao 通过它区分信号和普通函数。`isUse(v)` 检查的就是这个标记。无参调用返回当前值，有参调用替换存储值。这意味着 `() => T`（普通函数）**不是**信号，期望 `Signal<T>` 的 API 不接受 thunk。

For a definition signal, the value passed to the setter is stored as-is. The setter never treats a function as an updater. `state(() => null)` stores the function itself; it does not call it. If you want to store the return value, invoke the function explicitly.

对于定义信号，setter 接收的参数会原样存储。setter 不会把函数当作更新器执行。`state(() => null)` 会将函数本身写入信号值，而不会调用它。如果要写入函数返回值，必须显式调用函数。

```js
const state = use(null);

state(() => null); // stores the function itself / 将函数本身写入信号
state()(); // invokes the stored function / 调用信号中存储的函数
state((() => null)()); // stores null / 写入 null
```

## Referencing an Existing Signal / 引用已有信号

When called with a single argument that is already a signal (created by `use`), `use` returns that exact same signal. No new signal is created. This is useful for normalizing component props that might be either a plain value or an existing signal — just pass it through `use` and you always get back a `Signal<T>`. API props that accept either a plain value or a signal use the type `MaybeSignal<T>`, which is `T | Signal<T>`.

当传入一个参数且已是信号（由 `use` 创建）时，`use` 返回同一个信号。不会创建新信号。这对于规范化组件 props 非常有用——props 可能是普通值也可能是已有信号，通过 `use` 统一处理，始终拿到 `Signal<T>`。接受普通值或信号的 API 属性使用 `MaybeSignal<T>` 类型，即 `T | Signal<T>`。

```js
const count = use(0);
const sameCount = use(count); // sameCount === count

// Practical use: component props normalization / 实际用途：组件 props 规范化
import type { Context } from "kiaao";

function Slider(props: { value: number | Signal<number> }, { use }: Context) {
  const value = use(props.value);
  // If props.value is 42 → creates a new component-level signal
  // If props.value is a signal → returns the same signal
  // 如果 props.value 是 42 → 创建新的组件级信号
  // 如果 props.value 是信号 → 返回该信号
}
```

## Derivation Mode / 派生模式

When called with two or more arguments, the last argument must be a plain function (the _compute function_), and all preceding arguments are _dependency signals_. The return value is still a `Signal<T>`.

当传入两个或更多参数时，最后一个参数必须是一个普通函数（_计算函数_），前面的所有参数都是*依赖信号*。返回值仍然是 `Signal<T>`。

```js
const count = use(1);
const double = use(count, () => count() * 2);

console.log(double()); // 2

count(5);
console.log(double()); // 10
```

The compute function runs immediately when the derivation is created, and re-runs whenever any of its declared dependencies change. The result is cached. Calling the derived signal returns the cached value without re-running the computation.

计算函数在派生创建时立即执行，并在任何声明的依赖发生变化时重新执行。结果会被缓存。调用派生信号返回缓存值，不会重新执行计算。

Derivations are not limited to the same type as the source. You can derive a boolean or a string from any signal.

派生不限于与源信号相同类型。你可以从任意信号派生出布尔值或字符串。

```js
const status = use("loading");
const isLoading = use(status, () => status() === "loading");
// isLoading is Signal<boolean> / isLoading 是 Signal<boolean>

isLoading(); // true
status("done");
isLoading(); // false
```

## Setter of a Derived Signal / 派生信号的写入

A derived signal's setter does not replace the value directly. Instead, it triggers a re-execution of the compute function, passing the setter's argument into the function. The new cached value is still determined by the return value of the compute function.

派生信号的写入不直接替换值，而是触发计算函数重新执行，将写入的参数传入函数。新的缓存值仍由计算函数的返回值决定。

```js
const count = use(1);
const nextCount = use(count, (v) => count() + 1);

console.log(nextCount()); // 2

count(5);
// Upstream change triggers recomputation, v is undefined / 上游变化触发重算，v 为 undefined
console.log(nextCount()); // 6

nextCount(100);
// Setter triggers recomputation, v is 100 / 写入触发重算，v 为 100
// Compute function returns count() + 1, which is 6 / 计算函数返回 count() + 1，即 6
// Value unchanged, short-circuits / 值未变，短路
console.log(nextCount()); // 6
```

**When re-execution is triggered by an upstream change**, the compute function receives `undefined` as its argument. **When triggered by calling the signal directly**, the compute function receives the argument passed to the call. You can use this parameter to modify the derivation logic.

**当上游变化触发重算时**，计算函数接收 `undefined` 作为参数。**当直接调用信号触发重算时**，计算函数接收调用时传入的参数。你可以利用这个参数来调整派生逻辑。

```js
const base = use(10);
const scaled = use(base, (factor = 2) => base() * factor);

console.log(scaled()); // 20 (10 * 2)

base(5);
console.log(scaled()); // 10 (5 * 2, factor defaults to 2 / factor 默认为 2)

scaled(3);
console.log(scaled()); // 15 (5 * 3, factor is 3 / factor 为 3)
```

## Short-Circuit Behavior / 短路行为

After the compute function runs, the new result is compared to the cached value using `===`. If they are the same, downstream subscribers are **not notified**. This prevents unnecessary updates from cascading through the dependency graph.

计算函数执行后，新结果与缓存值通过 `===` 比较。如果相同，下游订阅者**不会收到通知**。这防止了无效更新在依赖图中级联传播。

```js
const count = use(5);
const stillFive = use(count, () => count() - count() + 5);

console.log(stillFive()); // 5

count(100);
// stillFive recomputes, result is 5 — same as before / stillFive 重算，结果为 5 —— 与之前相同
// No downstream notification / 不通知下游
```

## "Side Effects" / "副作用"

There is no `effect` API in kiaao. What other frameworks call a "side effect" is simply a derivation whose return value you choose not to use. The compute function runs on creation and on dependency changes, just like any other derivation.

kiaao 中没有 `effect` API。其他框架所谓的"副作用"只是一个你选择不使用其返回值的派生。计算函数在创建时和依赖变化时执行，与其他派生完全相同。

```js
use(count, () => {
  console.log("count is", count());
});
// No assignment — the signal is simply not used / 不赋值 —— 不使用其返回值

// If you need to manually trigger the function later:
// 如果需要手动触发后续执行：
const trigger = use(count, () => {
  console.log("count is", count());
});
trigger(); // manually triggers the compute function / 手动触发计算函数
```

## Explicit Dependencies / 显式依赖

Dependencies are declared by listing them as arguments. Only signals passed as arguments are tracked. Accessing a signal inside `setTimeout`, `async` callbacks, or conditional branches will **not** create any hidden dependency binding. This makes the dependency graph static, predictable, and completely free of the "async tracking trap" that affects Proxy-based and runtime-collection-based frameworks.

依赖通过参数列表声明。只有作为参数传入的信号才会被追踪。在 `setTimeout`、`async` 回调或条件分支中访问信号**不会**创建任何隐藏的依赖绑定。这使得依赖图静态、可预测，完全不受基于 Proxy 或运行时收集的框架所面临的"异步追踪陷阱"影响。

```js
const a = use(1);
const b = use(2);

// Only a and b are tracked / 只有 a 和 b 被追踪
const sum = use(a, b, () => {
  return a() + b();
});

// This is fine — no hidden dependency / 没问题 —— 无隐藏依赖
setTimeout(() => {
  console.log(a()); // just reads the value, no binding created / 仅读取值，不创建绑定
}, 1000);
```

If a non-signal value appears in the dependency list, kiaao ignores it and emits a warning in development mode. If the last argument is not a function or is itself a signal, kiaao also warns.

如果依赖列表中出现非信号值，kiaao 会忽略它并在开发模式下发出警告。如果最后一个参数不是函数或本身是信号，kiaao 同样会发出警告。

## Module-Level vs Component-Level `use` / 模块级与组件级 `use`

There are two contexts where you can call `use`:

- **Module-level `use`** (imported from `kiaao`): Creates a global signal. It lives as long as the module is loaded. Use this for shared stores and cross-component state.
- **Component-level `use`** (from `context`): Creates a signal bound to the component instance. When the component unmounts, the signal is automatically cleaned up — it stops reacting to dependencies and removes itself from their subscriber lists.

`use` 可以在两个上下文中调用：

- **模块级 `use`**（从 `kiaao` 导入）：创建全局信号。其生命周期与模块加载一样长。用于共享 store 和跨组件状态。
- **组件级 `use`**（从 `context` 解构）：创建绑定到组件实例的信号。当组件卸载时，信号自动清理——停止响应依赖并将自身从依赖的订阅者列表中移除。

We recommend using **component-level `use`** whenever possible. It ties signal lifetimes to components, prevents memory leaks, and makes your code more predictable. Reserve module-level `use` for truly global state that needs to outlive any single component.

我们推荐尽可能使用**组件级 `use`**。它将信号的生命周期与组件绑定，防止内存泄漏，并使代码更可预测。模块级 `use` 仅用于需要超越单个组件生命周期的真正全局状态。

```jsx
import { use, type Context } from "kiaao";

// Module-level — global signal (use sparingly)
// 模块级 — 全局信号（谨慎使用）
const globalCount = use(0);

function Counter(_, { use }: Context) {
  // Component-level — auto-cleaned on unmount (preferred)
  // 组件级 — 卸载时自动清理（推荐）
  const localCount = use(0);
  const double = use(localCount, () => localCount() * 2);

  return <div>{globalCount() + localCount() + double()}</div>;
}
// When Counter unmounts, localCount and double are cleaned up.
// Counter 卸载时，localCount 和 double 被清理。
// globalCount continues to exist.
// globalCount 继续存在。
```

The syntax is identical. The difference is only in where you get `use` from — `import { use }` for module-level, or `context.use` for component-level. This is the "where you call it, determines who owns it" principle.

两者语法完全一致。区别仅在于 `use` 从哪里来——`import { use }` 是模块级，`context.use` 是组件级。这就是"在哪调用，就归谁管"的原则。

Component-level `use` handles all three forms — definition, signal referencing, and derivation — and automatically registers the created signal for cleanup. If you pass an existing signal to `context.use(signal)`, no new resource is created and nothing is registered for cleanup, since the signal is owned elsewhere.

组件级 `use` 处理所有三种形式——定义、信号引用和派生——并自动注册创建的信号以进行清理。如果传入已有信号给 `context.use(signal)`，不会创建新资源，也不会注册清理，因为该信号由其他地方拥有。

```jsx
import type { Context } from "kiaao";

function Display(props: { value: number | Signal<number> }, { use }: Context) {
  // If props.value is a signal → returns it directly, no cleanup needed
  // 如果 props.value 是信号 → 直接返回，不需要清理
  // If props.value is 42 → creates a component-level signal, auto-cleaned
  // 如果 props.value 是 42 → 创建组件级信号，自动清理
  const value = use(props.value);
  return <div>{value}</div>;
}
```

If `context.use` is called after the component has been disposed (e.g., inside an async callback after the component was unmounted), it returns a safe placeholder signal — calling it returns `undefined`, and writing is a no-op. A warning is emitted in development mode.

如果组件已销毁后调用 `context.use`（例如异步回调中组件已被卸载），它会返回一个安全的占位信号——调用返回 `undefined`，写入是空操作。开发模式下会发出警告。

## Helper Functions / 辅助函数

### `isUse(v)`

Returns `true` if `v` is a signal (created by `use`). Works for both definition and derivation signals.

如果 `v` 是信号（由 `use` 创建），返回 `true`。对定义信号和派生信号均有效。

### `toValue(v)`

Returns `v()` if `v` is a signal, otherwise returns `v` itself. A convenience for reading a value that might or might not be reactive.

如果 `v` 是信号则返回 `v()`，否则返回 `v` 本身。用于读取可能是响应式的值。

## Logically Read-Only Signals / 逻辑上只读的信号

kiaao does not provide a dedicated readonly signal type. Instead, a signal can be exposed as "logically read-only" by wrapping it in a derivation whose compute function ignores any setter argument. Writes from outside become no-ops; the framework can still update the underlying source.

kiaao 并不提供专门的只读信号类型。相反，可以通过一个“计算函数忽略 setter 参数”的派生信号来对外表现只读。外部写入成为空操作，但框架仍可控制底层源信号。

```js
// internal writable source — owned by the auth module
// 内部可写源信号 — 由认证模块持有
const _user = use(null);

// logically read-only wrapper — exposed to consumers
// 逻辑只读包装 — 对消费者暴露
const currentUser = use(_user, () => _user());

// sole write path — only the auth module touches the source
// 唯一写入路径 — 仅认证模块操作源信号
auth.onLogin((user) => _user(user));
auth.onLogout(() => _user(null));

// consumer side — read-only usage
// 消费者侧 — 只读使用
function Header() {
  const user = currentUser();
  return <header>{user ? user.name : "Sign in"}</header>;
}
```

**Note / 注意**：Writes through `currentUser(...)` are no-ops. The signal value never changes from outside writes — only the auth module's writes to `_user` take effect.

**通过 `currentUser(...)` 写入是空操作。信号值不会因外部写入而改变——只有认证模块对 `_user` 的写入会生效。**

```js
currentUser({ name: "Alice" }); // no-op, value unchanged / 空操作，值不变
```

**Why a derivation and not a wrapper class? / 为什么是派生而不是包装类**

- Same `Signal<T>` API everywhere — no special readonly type to learn.
- Writes are cheap: the derivation recomputes, sees the new argument ignored, and short-circuits via `===`.
- The "real" state lives in one place; consumers can read it, but only the owner of the source can mutate it.

- `Signal<T>` 语法一致，不需要学习额外的只读类型。
- 写入开销小：派生重算后看到入参被忽略，通过 `===` 短路。
- 真实状态集中在源信号一处，消费者可读，仅源信号的拥有者可写。

## Template Reactivity / 模板响应式

In JSX, kiaao distinguishes reactive values from static ones by checking `isUse(value)`. A `Signal<T>` reference passed directly is reactive — kiaao subscribes to it and updates the corresponding DOM node when the signal changes. Anything else — a function call result, an arithmetic expression, a field access — is a plain value, treated as static and never updated.

在 JSX 中，kiaao 通过 `isUse(value)` 区分响应式值与静态值。直接传入的 `Signal<T>` 引用是响应式的——kiaao 订阅它，并在信号变化时更新对应的 DOM 节点。其他任何形式——函数调用结果、算术表达式、字段访问——都是普通值，被视为静态值，永不更新。

This means props and children must be signal references to stay reactive. For computed values, wrap the expression in a derivation:

这意味着属性和子节点必须是信号引用才能保持响应。对于计算值，将表达式包装为派生：

```jsx
const count = use(1);

// props — derive computed booleans / 属性 — 派生计算布尔值
const isZero = use(count, () => count() === 0);
<button disabled={isZero}>−1</button>

// string concatenation — derive the full string / 字符串拼接 — 派生完整字符串
const theme = use("light");
const className = use(theme, () => `app theme-${theme()}`);
<div class={className} />

// children — pass the signal, not its value / 子节点 — 传信号引用，不传值
<span>{count}</span>
```

### Field Derivation / 字段派生

A signal holding an object must not be destructured in the component body — that produces plain values frozen at creation time. Instead, derive each field into its own signal:

持有对象的信号不能在组件体内解构——那会产生冻结在创建时刻的普通值。相反，将每个字段派生为独立的信号：

```js
const todo = use({ text: "hello", done: false });

const text = use(todo, () => todo().text);
const done = use(todo, () => todo().done);

<span>{text}</span>
<input checked={done} />
```

Derived field signals stay in sync with the source object. Updating `todo` with a new object automatically updates `text` and `done`. Event handlers can read the latest value by calling the field signal.

派生字段信号与源对象保持同步。用新对象更新 `todo` 会自动更新 `text` 和 `done`。事件处理中可以通过调用字段信号获取最新值。

## Cleanup / 清理

Signals created with module-level `use` are global and persist for the lifetime of the application. Signals created with `context.use` are automatically cleaned up when the owning component unmounts. Each signal internally manages its own subscriptions and provides a unified `stop()` method that the framework calls during teardown.

模块级 `use` 创建的信号是全局的，在应用生命周期内持续存在。`context.use` 创建的信号在所属组件卸载时自动清理。每个信号内部管理自己的订阅，并提供统一的 `stop()` 方法供框架在销毁时调用。

---

Now that you understand signals, learn how to use them inside components. / 现在你已经理解了信号，继续学习如何在组件中使用它们。

- [Components / 组件](./components.md)
- [Control Flow / 控制流](./control-flow.md)
- [Lifecycle / 生命周期](./lifecycle.md)
