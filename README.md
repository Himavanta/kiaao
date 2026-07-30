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
import { use, createApp, type Context } from "kiaao";

// Module-level — global state, outlives any component
// 模块级 — 全局状态，独立于组件
const theme = use("light");

function Counter(_, { use }: Context) {
  // Component-level definition — writable, auto-cleaned on unmount
  // 组件级定义 — 可写信号，卸载时自动清理
  const count = use(0);

  // Component-level derivation — recomputes when dependency changes
  // 组件级派生 — 依赖变化时重算
  const double = use(count, () => count() * 2);

  // Cross-type derivation — number to string
  // 跨类型派生 — 数字到字符串
  const label = use(count, () => `Count is ${count()}`);

  // Component-level derivation with setter — write triggers recomputation
  // 组件级派生（带 setter）—— 写入触发重算
  const nextCount = use(count, (v) => count() + 1);

  // Component-level side effect — derivation without return value
  // 组件级副作用 — 无返回值的派生，依赖变化时执行
  use(count, () => {
    console.log("count is", count());
  });

  // Storing a function — setter stores as-is, never calls it
  // 存储函数 — setter 原样存储，不会调用
  const stored = use(() => "hello");
  // stored()    → the function itself / 函数本身
  // stored()()  → "hello" / 调用存储的函数

  // Logically read-only — derivation ignores setter argument
  // 逻辑只读 — 派生忽略 setter 参数
  const _raw = use(0);
  const readOnly = use(_raw, () => _raw());
  // readOnly(999) → no-op, value unchanged / 空操作，值不变

  return (
    <div>
      <p>Theme: {theme}</p>
      <p>Count: {count}</p>
      <p>Double: {double}</p>
      <p>{label}</p>
      <p>nextCount: {nextCount}</p>
      <p>ReadOnly: {readOnly}</p>
      <p>Stored: {stored()()}</p>
      <button onClick={() => count(count() + 1)}>+1</button>
      <button onClick={() => nextCount(count() + 100)}>
        nextCount(count()+100)
      </button>
      <button onClick={() => stored(() => "world")}>
        stored(() => "world")
      </button>
      <button onClick={() => readOnly(999)}>
        readOnly(999)
      </button>
    </div>
  );
}

createApp(Counter).mount("#app");
```

This example covers every signal concept in kiaao: module-level and component-level scope, definition, derivation, cross-type derivation, setter-triggered recomputation with short-circuit, side effects, function storage, and logically read-only wrapping. For full details, follow the guides linked below.

此示例覆盖了 kiaao 的全部信号概念：模块级与组件级作用域、定义、派生、跨类型派生、setter 触发重算与短路、副作用、函数存储、逻辑只读包装。详见下方文档。

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
