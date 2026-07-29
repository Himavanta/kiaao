# kiaao

[GitHub](https://github.com/Himavanta/kiaao)

---

A framework is for expressing ideas, not hiding them.

kiaao is a pure-runtime reactive UI framework. It does not proxy your data, does not collect dependencies for you, and does not re-run your component functions. It does exactly one thing: precisely update the DOM after you explicitly declare your dependencies.

All state is created by `use`. Every signal is a `Signal<T>` — a single function that reads when called with no arguments and writes when called with a value. There is no distinction between "writable" and "readonly" signals — you always get both capabilities, and you never need to check. There is no concept of "side effects" — a derivation that returns nothing is simply a derived signal whose value is `undefined`.

If you have ever felt out of control because of your framework's "smartness", if you want transparency, predictability, and full control, kiaao is for you.

---

框架是用来表达思想的，不是用来隐藏它的。

kiaao 是一个纯运行时的响应式 UI 框架。它不代理你的数据，不替你收集依赖，不反复运行你的组件函数。它只做一件事：在你明确声明依赖关系之后，精确地更新 DOM。

所有状态都由 `use` 创建。每一个信号都是 `Signal<T>` —— 一个统一的函数，无参调用时读取，有参调用时写入。不存在"可写"和"只读"信号的区别——你总是同时拥有两种能力，永远不需要检查。没有"副作用"的概念——不返回值的派生，就是一个值为 `undefined` 的派生信号。

如果你曾因框架的"智能"而感到失控，如果你想要的是透明、可预测和完全的掌控，kiaao 是为你准备的。

---

## Quick Start / 快速开始

```bash
npm install kiaao
```

[JSX/TSX setup — 配置 JSX/TSX](./guide/jsx-setup.md)

```jsx
import { use, createApp } from "kiaao";

// Definition mode — a writable signal
// 定义模式 — 可写信号
const count = use(0);

// Derivation mode — a computed signal
// 派生模式 — 计算信号
const double = use(count, () => count() * 2);

// Derivation without return — a "side effect" that is just a derived signal with value undefined
// 无返回值的派生 — 值永远为 undefined 的派生信号，即传统意义上的"副作用"
use(count, () => {
  console.log("count is", count());
});

// Component — a function that returns JSX, runs exactly once
// 组件 — 返回 JSX 的函数，只执行一次
function Counter() {
  return (
    <div>
      <p>Count: {count}</p>
      <p>Double: {double}</p>
      <button onClick={() => count(count() + 1)}>+1</button>
    </div>
  );
}

createApp(Counter).mount("#app");
```

---

A signal can be written regardless of how it was created. For a definition signal, the setter replaces the value. For a derivation signal, the setter triggers re-execution of the compute function. The API is the same.

信号无论怎样创建都可以被写入。定义信号的写入直接替换值。派生信号的写入触发计算函数重新执行。API 完全一致。

For a definition signal, the value passed to the setter is stored as-is. Passing a function stores the function itself; the function is not called. If you need its return value, call it explicitly before writing.

对于定义信号，setter 接收的值会原样存储。传入函数时，写入的是函数本身，函数不会被调用。如果需要写入函数返回值，必须先显式调用函数。

```js
const state = use(null);

state(() => null); // stores the function itself / 将函数本身写入信号
state()(); // invokes the stored function / 调用信号中存储的函数
state((() => null)()); // stores null / 写入 null
```

```js
const count = use(1);
const nextCount = use(count, (v) => count() + 1);

console.log(nextCount()); // 2

count(5);
console.log(nextCount()); // 6

nextCount(100); // triggers recomputation, v is 100 / 触发重算，v 为 100
console.log(nextCount()); // 6 (value unchanged, short-circuited / 值未变，短路)
```

---

## AI Coding Agents / AI 编码助手

kiaao provides an official skill compatible with the [Agent Skills](https://agentskills.io/) standard. When installed, AI coding agents such as Pi, Claude Code, Cursor, and Codex can correctly understand the kiaao API and generate code that follows the framework's conventions.

kiaao 提供兼容 [Agent Skills](https://agentskills.io/) 标准的官方 skill。安装后，Pi、Claude Code、Cursor、Codex 等 AI 编码助手能正确理解 kiaao API，并生成符合框架约定的代码。

```bash
npx skills add Himavanta/kiaao
```

The skill is shipped from this repository and stays in sync with each kiaao release.

skill 内容随 kiaao 版本同步更新。

---

## Comparison / 与其他框架的对比

|                          | React                 | Vue                | Solid               | **kiaao**                        |
| ------------------------ | --------------------- | ------------------ | ------------------- | -------------------------------- |
| Data transparency        | clean                 | opaque (Proxy)     | clean (two systems) | **clean (one system)**           |
| Component runs           | every update          | once               | once                | **once**                         |
| Virtual DOM              | yes                   | yes                | no                  | **no**                           |
| Compiler dependency      | none                  | optional           | required            | **none**                         |
| Reactivity model         | none (full re-render) | Proxy auto-collect | compile-time expand | **explicit declaration**         |
| Core concept count       | 10+                   | 8+                 | 6+                  | **3**                            |
| Update granularity       | component             | component/block    | DOM node            | **derived signal**               |
| Control flow             | ternary / map         | v-if / v-for       | `<Show>` / `<For>`  | **`<Show>` / `<Each>`**          |
| Context / provide-inject | yes                   | yes                | yes                 | **no (signals are the channel)** |

---

## Documentation / 文档

- [Reactivity / 响应式系统](./guide/reactivity.md)
- [Components / 组件](./guide/components.md)
- [Lifecycle / 生命周期](./guide/lifecycle.md)
- [Control Flow / 控制流](./guide/control-flow.md)
- [Motion / 动画](./guide/motion.md)
- [Async Components / 异步组件](./guide/async-components.md)
- [Directives / 自定义指令](./guide/directives.md)
- [Attributes / 属性处理](./guide/attributes.md)
- [SSR / 服务端渲染](./guide/ssr.md)
- [Router / 路由](./guide/router.md)
- [JSX/TSX Setup / 配置 JSX/TSX](./guide/jsx-setup.md)

---

## License / 许可证

MIT
