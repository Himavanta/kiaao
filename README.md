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
  // Component-level definition — auto-cleaned on unmount; setter stores as-is
  // 组件级定义 — 可写，卸载自动清理；原样存储，传入函数不会调用
  const count = use(0);

  // Component-level derivation — also writable, write arg passed to compute
  // 组件级派生 — 可写，写入参数传入计算函数
  const double = use(count, (v) => count() * 2);

  // Derivation without return — runs on dependency change
  // 无返回值派生 — 依赖变化时执行
  use(count, () => {
    console.log("count is", count());
  });

  return (
    <div>
      <p>Theme: {theme}</p>
      <p>Count: {count}</p>
      <p>Double: {double}</p>
      <button onClick={() => count(count() + 1)}>+1</button>
    </div>
  );
}

createApp(Counter).mount("#app");
```

This example demonstrates module-level and component-level signals, definition, derivation (including no-return derivations), and setter behaviors: definition setters store as-is, and derivation setters trigger recomputation with the arg passed to compute. For full details, follow the guides linked below.

此示例演示了模块级与组件级信号、定义、派生（含无返回值派生），以及 setter 行为：定义 setter 原样存储，派生 setter 触发重算并将入参传入计算函数。详见下方文档。

---

## AI Coding Agents / AI 编码助手

Add kiaao support to any AI coding agent compatible with the [Agent Skills](https://agentskills.io/) standard. The skill is version-synced with the installed kiaao package.

为兼容 [Agent Skills](https://agentskills.io/) 标准的 AI 编码助手添加 kiaao 支持。skill 与已安装的 kiaao 包版本同步。

```bash
npx skills add Himavanta/kiaao
```

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

- [JSX/TSX Setup / 配置 JSX/TSX](./guide/jsx-setup.md)
- [Reactivity / 响应式系统](./guide/reactivity.md)
- [Components / 组件](./guide/components.md)
- [Control Flow / 控制流](./guide/control-flow.md)
- [Lifecycle / 生命周期](./guide/lifecycle.md)
- [Attributes / 属性处理](./guide/attributes.md)
- [Async Components / 异步组件](./guide/async-components.md)
- [Directives / 自定义指令](./guide/directives.md)
- [Motion / 动画](./guide/motion.md)
- [Router / 路由](./guide/router.md)
- [SSR / 服务端渲染](./guide/ssr.md)

---

## License / 许可证

MIT
