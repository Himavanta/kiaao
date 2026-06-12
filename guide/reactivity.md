# Reactivity / 响应式系统

`use` is the single API for creating reactive state in kiaao. It takes different forms depending on how many arguments you pass, but it always returns a `[getter, setter]` tuple. There is no separate API for derived values or side effects — everything is a signal.

`use` 是 kiaao 中创建响应式状态的唯一 API。根据传入参数的数量，它会呈现不同的形式，但始终返回 `[getter, setter]` 元组。没有用于派生值或副作用的单独 API——一切都是信号。

---

## Definition Mode / 定义模式

When called with a single argument, `use` creates a writable signal. The initial value can be anything: a number, a string, an object, a function, a Promise — nothing is treated specially.

当传入一个参数时，`use` 创建一个可写信号。初始值可以是任何东西：数字、字符串、对象、函数、Promise——没有任何特殊处理。

```js
const [count, setCount] = use(0);
const [user, setUser] = use({ name: "tom", age: 18 });

// Reading / 读取
console.log(count()); // 0
console.log(user().name); // 'tom'

// Writing / 写入
setCount(42); // direct replacement / 直接替换
setCount((prev) => prev + 1); // updater function / 函数式更新
setUser((prev) => ({ ...prev, age: 19 }));
```

**Getter** returns the current stored value. **Setter** replaces the value or accepts an updater function that receives the current value and returns the new one.

**Getter** 返回当前存储的值。**Setter** 替换值，或接收一个更新函数，该函数接收当前值并返回新值。

---

## Derivation Mode / 派生模式

When called with two or more arguments, the last argument must be a plain function (the _compute function_), and all preceding arguments are _dependency signals_. The return value is still a `[getter, setter]` tuple.

当传入两个或更多参数时，最后一个参数必须是一个普通函数（_计算函数_），前面的所有参数都是*依赖信号*。返回值仍然是 `[getter, setter]` 元组。

```js
const [count, setCount] = use(1);
const [double, setDouble] = use(count, () => count() * 2);

console.log(double()); // 2

setCount(5);
console.log(double()); // 10
```

The compute function runs immediately when the derivation is created, and re-runs whenever any of its declared dependencies change. The result is cached. Calling the getter returns the cached value without re-running the computation.

计算函数在派生创建时立即执行，并在任何声明的依赖发生变化时重新执行。结果会被缓存。调用 getter 返回缓存值，不会重新执行计算。

---

## Setter of a Derived Signal / 派生信号的 Setter

A derived signal's setter does not replace the value directly. Instead, it triggers a re-execution of the compute function, passing the setter's argument into the function. The new cached value is still determined by the return value of the compute function.

派生信号的 setter 不直接替换值，而是触发计算函数重新执行，将 setter 的参数传入函数。新的缓存值仍由计算函数的返回值决定。

```js
const [count, setCount] = use(1);
const [nextCount, setNextCount] = use(count, (v) => count() + 1);

console.log(nextCount()); // 2

setCount(5);
// Upstream change triggers recomputation, v is undefined / 上游变化触发重算，v 为 undefined
console.log(nextCount()); // 6

setNextCount(100);
// Setter triggers recomputation, v is 100 / setter 触发重算，v 为 100
// Compute function returns count() + 1, which is 6 / 计算函数返回 count() + 1，即 6
// Value unchanged, short-circuits / 值未变，短路
console.log(nextCount()); // 6
```

**When re-execution is triggered by an upstream change**, the compute function receives `undefined` as its argument. **When triggered by calling the setter directly**, the compute function receives the setter's argument. You can use this parameter to modify the derivation logic.

**当上游变化触发重算时**，计算函数接收 `undefined` 作为参数。**当直接调用 setter 触发重算时**，计算函数接收 setter 的参数。你可以利用这个参数来调整派生逻辑。

```js
const [base, setBase] = use(10);
const [scaled, setScaled] = use(base, (factor = 2) => base() * factor);

console.log(scaled()); // 20 (10 * 2)

setBase(5);
console.log(scaled()); // 10 (5 * 2, factor defaults to 2 / factor 默认为 2)

setScaled(3);
console.log(scaled()); // 15 (5 * 3, factor is 3 / factor 为 3)
```

---

## Short-Circuit Behavior / 短路行为

After the compute function runs, the new result is compared to the cached value using `===`. If they are the same, downstream subscribers are **not notified**. This prevents unnecessary updates from cascading through the dependency graph.

计算函数执行后，新结果与缓存值通过 `===` 比较。如果相同，下游订阅者**不会收到通知**。这防止了无效更新在依赖图中级联传播。

```js
const [count, setCount] = use(5);
const [stillFive, setStillFive] = use(count, () => count() - count() + 5);

console.log(stillFive()); // 5

setCount(100);
// stillFive recomputes, result is 5 — same as before / stillFive 重算，结果为 5 —— 与之前相同
// No downstream notification / 不通知下游
```

---

## "Side Effects" / "副作用"

There is no `effect` API in kiaao. What other frameworks call a "side effect" is simply a derivation whose return value you choose not to use. The compute function runs on creation and on dependency changes, just like any other derivation.

kiaao 中没有 `effect` API。其他框架所谓的"副作用"只是一个你选择不使用其返回值的派生。计算函数在创建时和依赖变化时执行，与其他派生完全相同。

```js
use(count, () => {
  console.log("count is", count());
});
// No assignment — the getter is simply not used / 不赋值 —— 不使用其 getter

// If you need the setter to manually trigger the function later:
// 如果需要 setter 来手动触发后续执行：
const [_, trigger] = use(count, () => {
  console.log("count is", count());
});
trigger(); // manually triggers the compute function / 手动触发计算函数
```

---

## Explicit Dependencies / 显式依赖

Dependencies are declared by listing them as arguments. Only signals passed as arguments are tracked. Accessing a signal inside `setTimeout`, `async` callbacks, or conditional branches will **not** create any hidden dependency binding. This makes the dependency graph static, predictable, and completely free of the "async tracking trap" that affects Proxy-based and runtime-collection-based frameworks.

依赖通过参数列表声明。只有作为参数传入的信号才会被追踪。在 `setTimeout`、`async` 回调或条件分支中访问信号**不会**创建任何隐藏的依赖绑定。这使得依赖图静态、可预测，完全不受基于 Proxy 或运行时收集的框架所面临的"异步追踪陷阱"影响。

```js
const [a, setA] = use(1);
const [b, setB] = use(2);

// Only a and b are tracked / 只有 a 和 b 被追踪
const [sum, setSum] = use(a, b, () => {
  return a() + b();
});

// This is fine — no hidden dependency / 没问题 —— 无隐藏依赖
setTimeout(() => {
  console.log(a()); // just reads the value, no binding created / 仅读取值，不创建绑定
}, 1000);
```

If a non-signal value appears in the dependency list, kiaao ignores it and emits a warning in development mode. If the last argument is not a function or is itself a signal, kiaao also warns.

如果依赖列表中出现非信号值，kiaao 会忽略它并在开发模式下发出警告。如果最后一个参数不是函数或本身是信号，kiaao 同样会发出警告。

---

## Helper Functions / 辅助函数

### `isUse(v)`

Returns `true` if `v` is a signal (a getter created by `use`). Works for both definition and derivation signals.

如果 `v` 是信号（由 `use` 创建的 getter），返回 `true`。对定义信号和派生信号均有效。

### `toUse(v)`

Normalizes any value into a `[getter, setter]` tuple. If `v` is already a signal, returns `[v, v[REACTIVE].set]`. Otherwise, creates a new writable signal with `use(v)`. Useful for component props that might be either a plain value or an existing signal.

将任意值规范化为 `[getter, setter]` 元组。如果 `v` 已经是信号，返回 `[v, v[REACTIVE].set]`；否则用 `use(v)` 创建新的可写信号。适用于组件 props 可能是普通值或已有信号的场景。

```js
function Slider(props) {
  const [value, setValue] = toUse(props.value);
  // Always safe to destructure / 解构永远安全
}
```

### `toValue(v)`

Returns `v()` if `v` is a signal, otherwise returns `v` itself. A convenience for reading a value that might or might not be reactive.

如果 `v` 是信号则返回 `v()`，否则返回 `v` 本身。用于读取可能是响应式的值。

---

## Cleanup / 清理

Derivations are automatically cleaned up when the component or DOM subtree that created them is destroyed. Each derivation internally manages its own subscriptions and provides a unified `stop()` method that the framework calls during teardown. You never need to manually stop a derivation.

当创建派生的组件或 DOM 子树被销毁时，派生会自动清理。每个派生内部管理自己的订阅，并提供统一的 `stop()` 方法供框架在销毁时调用。你永远不需要手动停止一个派生。

If you need to conditionally disable a derivation's logic, use a flag inside the compute function:

如果需要有条件地禁用派生逻辑，可以在计算函数内部使用标志位：

```js
let alive = true;
use(someSignal, () => {
  if (alive) {
    // your logic / 你的逻辑
  }
});
// Later: alive = false / 之后：alive = false
```

Note that this only prevents the logic from executing — the subscription itself remains. True unsubscription happens automatically when the owning component unmounts.

注意，这仅阻止逻辑执行——订阅本身依然存在。真正的取消订阅会在所属组件卸载时自动发生。
