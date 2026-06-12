# SSR / 服务端渲染

kiaao provides `renderToString` for server-side rendering. In SSR mode, the component tree is rendered to an HTML string. Reactive bindings are evaluated once at render time. No client-side hydration is performed — the output is static HTML.

kiaao 提供 `renderToString` 用于服务端渲染。在 SSR 模式下，组件树被渲染为 HTML 字符串。响应式绑定在渲染时执行一次求值。不执行客户端水合——输出为静态 HTML。

---

## `renderToString` / 渲染为字符串

```jsx
import { renderToString } from "kiaao/server";
import App from "./App";

const html = renderToString(App, { title: "My Page" });
// <div><h1>My Page</h1>...</div>
```

The first argument is the component function. The second argument is the props object. The return value is an HTML string.

第一个参数是组件函数。第二个参数是 props 对象。返回值为 HTML 字符串。

---

## SSR Behavior / SSR 行为

During SSR, some framework behaviors differ from client-side execution. This is because there is no DOM to interact with and no ongoing reactivity after the render completes.

SSR 期间，框架的某些行为与客户端执行不同。这是因为没有 DOM 可供交互，且渲染完成后不再有持续的响应式更新。

**Derivations / 派生**：Each `use(...deps, fn)` derivation executes its compute function once at creation time to produce the initial cached value. The value is then embedded in the HTML output. Derivations do not re-run after the render.

**派生**：每个 `use(...deps, fn)` 派生在创建时执行一次计算函数，生成初始缓存值。该值随后被嵌入 HTML 输出。渲染完成后派生不再重新执行。

**Lifecycle / 生命周期**：`onMount` and `onUnmount` callbacks are not invoked during SSR. They only run when the component is mounted or unmounted on the client.

**生命周期**：SSR 期间不触发 `onMount` 和 `onUnmount` 回调。它们仅在客户端的组件挂载或卸载时运行。

**Async components / 异步组件**：Async components are **not supported** in SSR. `renderToString` is synchronous and cannot wait for Promises. If an async component is encountered during SSR, the framework throws an error. For data-fetching scenarios in SSR, fetch the data outside the component and pass it via props to a synchronous component.

**异步组件**：异步组件在 SSR 中**不受支持**。`renderToString` 是同步函数，无法等待 Promise。如果在 SSR 期间遇到异步组件，框架会抛出错误。对于 SSR 中的数据获取场景，应在组件外部获取数据，通过 props 传入同步组件。

**Control flow / 控制流**：`when` and `each` directives render their initial state into the HTML. `when` outputs the truthy branch (or `else` if falsy, or nothing if no `else`). `each` iterates over the data source and renders each item's node.

**控制流**：`when` 和 `each` 指令将其初始状态渲染到 HTML 中。`when` 输出 truthy 分支（或 `else` 如果为 falsy，无 `else` 则无输出）。`each` 遍历数据源并渲染每个条目的节点。

---

## Attributes in SSR / SSR 中的属性

Only attributes that have meaning in static HTML are serialized. The SSR serialization follows the same attribute handling rules as the client, with some differences:

只有对静态 HTML 有意义的属性才会被序列化。SSR 序列化遵循与客户端相同的属性处理规则，但存在一些差异：

- **`attr:` prefix / `attr:` 前缀**

  Output as HTML attributes. `attr:value="init"` becomes `value="init"`.  
  作为 HTML 属性输出。`attr:value="init"` 输出为 `value="init"`。

- **`prop:` prefix / `prop:` 前缀**

  Ignored. These are only meaningful for client-side DOM property assignment.  
  忽略。仅对客户端 DOM property 赋值有意义。

- **Event handlers / 事件处理器**

  Ignored. `onClick`, `onInput`, etc. are not serialized.  
  忽略。`onClick`、`onInput` 等不会被序列化。

- **FORCE_ATTRIBUTE**

  Standard HTML attributes (`class`, `id`, `disabled`, `src`, `href`, etc.) are output normally.  
  标准 HTML 属性（`class`、`id`、`disabled`、`src`、`href` 等）正常输出。

- **`aria-*` / `data-*`** — Output as-is. / 原样输出。

- **`value` `checked` / `value`**

  Not output by default. Use `attr:value` or `attr:checked` to include initial values in the static HTML.  
  默认不输出。使用 `attr:value` 或 `attr:checked` 在静态 HTML 中包含初始值。

For the full attribute handling specification, see the Attribute Handling document.

完整的属性处理规范参见属性处理文档。

---

## Example / 示例

```jsx
// server.js
import { renderToString } from "kiaao/server";
import App from "./App";

const html = renderToString(App, { items: ["a", "b", "c"] });

// The returned HTML is a complete, static string.
// 返回的 HTML 是完整的静态字符串。
// Each item in the list is rendered. The initial count is 0.
// 列表中的每个条目都被渲染。初始 count 为 0。
```

```jsx
// App.tsx
function App({ items }, context) {
  const [count, setCount] = use(0);

  return (
    <div>
      <h1>Count: {count}</h1>
      <ul each={items}>{(item) => <li>{item}</li>}</ul>
    </div>
  );
}
```

---

## No Hydration / 无水合

`renderToString` produces static HTML. There is no built-in hydration mechanism to reconnect client-side reactivity to server-rendered HTML. If you need interactive components, mount a fresh kiaao app on the client alongside the static HTML, or use the Astro integration with `client:only`.

`renderToString` 生成静态 HTML。没有内置的水合机制将客户端响应式重新连接到服务端渲染的 HTML。如果需要交互式组件，可以在客户端静态 HTML 旁边挂载一个全新的 kiaao 应用，或使用 Astro 集成配合 `client:only`。

---

## Astro Integration / Astro 集成

kiaao provides an official Astro integration. Install it alongside `astro` and add it to your Astro configuration.

kiaao 提供官方的 Astro 集成。与 `astro` 一起安装并添加到 Astro 配置中。

```bash
npm install kiaao astro
```

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import kiaao from "kiaao/astro";

export default defineConfig({
  integrations: [kiaao()],
});
```

**Static components / 静态组件**：By default, kiaao components in Astro are rendered to static HTML at build time with zero JavaScript output. `onMount`, `onUnmount`, and reactive updates are not included.

**静态组件**：默认情况下，Astro 中的 kiaao 组件在构建时渲染为静态 HTML，零 JavaScript 输出。不包含 `onMount`、`onUnmount` 和响应式更新。

```astro
---
import Counter from './Counter'
---

<Counter />
```

**Client components / 客户端组件**：Add `client:only` to mount a fully interactive kiaao app on the client. The component is rendered at build time as static HTML, and the client-side kiaao app takes over when the page loads.

**客户端组件**：添加 `client:only` 可在客户端挂载完全交互式的 kiaao 应用。组件在构建时渲染为静态 HTML，页面加载时客户端 kiaao 应用接管。

```astro
---
import Counter from './Counter'
---

<Counter client:only />
```

---

- [Router / 路由](./router.md)
