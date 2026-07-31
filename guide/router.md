# Router / 路由

Client-side routing in kiaao is not a separate subsystem. It is built entirely on things you already know: nested objects for route structure, `<Case>` for segment matching, signals for path and query state, components for views and links. The router library does one thing — maps a URL to the right position in your component tree. Everything else is just JavaScript and kiaao.

kiaao 中的客户端路由不是一个独立的子系统。它完全构建在你已经知道的东西之上：用嵌套对象表达路由结构，用 `<Case>` 做段匹配，用信号管理路径和查询状态，用组件构建视图和链接。路由库只做一件事——把 URL 映射到你组件树的正确位置。其他的，都是 JavaScript 和 kiaao 本身的能力。

---

## The Core Insight / 核心洞察

A route map is a nested object. A component tree is a nested structure. In kiaao, **they are the same shape**.

路由表是一个嵌套对象。组件树是一个嵌套结构。在 kiaao 中，**它们形状一致**。

```js
const routes = {
  "": RootLayout,
  demo: {
    "": DemoLayout,
    hello: HelloComp,
  },
};
```

This object directly describes what renders on the page:

这个对象直接描述了页面上会渲染什么：

```
<RootLayout>
  <RouterView />           ← 匹配 "demo"
    <DemoLayout>
      <RouterView />       ← 匹配 "hello"
        <HelloComp />
    </DemoLayout>
</RootLayout>
```

- **`""` key** — The layout. Always renders. Receives `RouterView` as a prop.
- **Other keys** — Child routes. Matched segment-by-segment by `RouterView`.
- **Function value** — Shorthand for `{ "": fn }`. A leaf component.

- **`""` 键** — Layout。始终渲染。通过 props 接收 `RouterView`。
- **其他键** — 子路由。由 `RouterView` 逐段匹配。
- **函数值** — `{ "": fn }` 的简写。叶子组件。

You don't need to learn a "route config DSL". You're looking at a JavaScript object. The nesting of this object is the nesting of your layouts. The `""` key is the only convention you need to remember.

你不需要学一套"路由配置 DSL"。你看到的就是一个 JavaScript 对象。对象的嵌套就是布局的嵌套。`""` 键是你唯一需要记住的约定。

---

## Quick Start / 快速开始

```bash
npm install kiaao
```

```jsx
import { createRouter } from "kiaao/router";
import { createApp } from "kiaao";

// 1. Define routes as a nested object / 用嵌套对象定义路由
const routes = {
  "": RootLayout,
  login: LoginPage,
  dashboard: {
    "": DashboardLayout,
    users: UsersPage,
    settings: SettingsPage,
  },
};

// 2. Create router / 创建路由实例
const { Router, Link, push, current } = createRouter({ routes });

// 3. Mount / 挂载
createApp(Router).mount("#app");

// ── Layout components / 布局组件 ──────────────

function RootLayout({ RouterView }) {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/login">Login</Link>
        <Link to="/dashboard/users">Users</Link>
      </nav>
      <main>
        <RouterView />
      </main>
    </div>
  );
}

function DashboardLayout({ RouterView }) {
  return (
    <section>
      <Sidebar />
      <main>
        <RouterView />
      </main>
    </section>
  );
}

// ── Leaf components / 叶子组件 ──────────────

function LoginPage() {
  return <h1>Login</h1>;
}

function UsersPage() {
  return <h1>Users</h1>;
}
```

That's the entire mental model. The rest of this guide explains each piece in detail.

这就是完整的心智模型。本文档的剩余部分逐一解释每个部分。

---

## Route Map / 路由表

### The `""` Key / `""` 键

In every nested object, the `""` key is the **layout**. It always renders when that level of the route is active. It receives a `RouterView` component as a prop, which it must render somewhere in its JSX output. If you forget to render `<RouterView />`, child routes will not appear — the framework does not inject it for you.

在每个嵌套对象中，`""` 键是 **layout**。当该层级的路由处于活动状态时，它始终渲染。它通过 props 接收一个 `RouterView` 组件，必须在自己的 JSX 输出中渲染它。如果忘记渲染 `<RouterView />`，子路由不会出现——框架不会替你注入。

```jsx
function DashboardLayout({ RouterView }) {
  return (
    <section>
      <Sidebar />
      <main>
        <RouterView />
      </main>
    </section>
  );
}
```

### Leaf vs Directory / 叶子与目录

- A **function value** is a leaf component. Equivalent to `{ "": fn }`.
- An **object value** is a directory. It must contain a `""` key (the layout for that level).

- **函数值**是叶子组件。等价于 `{ "": fn }`。
- **对象值**是目录。必须包含 `""` 键（该层级的 layout）。

```js
// These are equivalent / 以下两种写法等效
demo: () => <div>Demo</div>
demo: { "": () => <div>Demo</div> }
```

### Why Nested Objects / 为什么是嵌套对象

- **Topology is explicit** — nesting in code mirrors nesting on screen.
- **No string-based prefix matching** — no `/dashboard/users` strings to parse. Each level only knows its own segment.
- **Service menu trees map naturally** — a server returning nested menu data can be directly transformed into a route map.

- **拓扑显式** — 代码中的嵌套对应屏幕上的嵌套。
- **无需字符串前缀匹配** — 没有 `/dashboard/users` 这种需要解析的字符串。每层只知道自己的段。
- **服务端菜单树天然映射** — 服务端返回的嵌套菜单数据可以直接转换为路由表。

---

## `createRouter` / 创建路由

```ts
import { createRouter } from "kiaao/router";

const { Router, Link, push, current, search } = createRouter({
  routes,
  onRoute: async (to, from) => {
    // navigation guard / 导航守卫
  },
});
```

### Options / 参数

| Option / 参数 | Type / 类型                                    | Description / 说明                                                            |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `routes`      | `RouteMap`                                     | Nested route object. The `""` key is required at the root level.              |
|               |                                                | 嵌套路由对象。根层级必须包含 `""` 键。                                        |
| `onRoute`     | `(to, from) => string \| void \| Promise<...>` | Navigation guard. Runs before every navigation. Returns a string to redirect. |
|               |                                                | 导航守卫。每次导航前执行。返回 string 触发重定向，void 放行。                 |

### Return Value / 返回值

| Property / 属性 | Type / 类型                       | Description / 说明                                      |
| --------------- | --------------------------------- | ------------------------------------------------------- |
| `Router`        | Component                         | Top-level route component. Mount once at your app root. |
|                 |                                   | 顶层路由组件。在应用根部挂载一次。                      |
| `Link`          | Component                         | Declarative navigation link. Renders an `<a>` element.  |
|                 |                                   | 声明式导航链接。渲染 `<a>` 元素。                       |
| `push`          | `(path: string) => Promise<void>` | Programmatic navigation. Async — resolves after guards. |
|                 |                                   | 编程式导航。异步——守卫完成后 resolve。                  |
| `current`       | `Signal<string>`                  | Read-only signal for the current pathname.              |
|                 |                                   | 只读信号，当前 pathname。                               |
| `search`        | `Signal<Record<string, string>>`  | Read-only signal for parsed query string.               |
|                 |                                   | 只读信号，解析后的查询字符串。                          |

---

## `RouterView` / 路由视图

`RouterView` is injected into layout components via props. It renders the matched child route at the current path segment. **Only layouts (the `""` key) receive `RouterView`** — leaf components do not.

`RouterView` 通过 props 注入到 layout 组件中。它渲染当前路径段匹配的子路由。**只有 layout（`""` 键）才能收到 `RouterView`** ——叶子组件不收到。

```jsx
function RootLayout({ RouterView }) {
  return (
    <div>
      <nav>...</nav>
      <main>
        <RouterView />
      </main>
    </div>
  );
}
```

When the URL changes, `RouterView` re-evaluates which child route matches the current segment. Layouts stay in the DOM — only the content inside `<RouterView>` updates.

URL 变化时，`RouterView` 重新判断当前段匹配哪个子路由。Layout 保留在 DOM 中——只有 `<RouterView>` 内部的内容更新。

### Local Fallback / 局部 fallback

Pass a function as the first child of `RouterView` to show when no child route matches the current segment (e.g., when the URL points directly to a directory's index).

将函数作为 `RouterView` 的第一个子元素传入，当没有子路由匹配当前段时显示（例如 URL 直接指向某个目录的索引页）。

```jsx
function DashboardLayout({ RouterView }) {
  return (
    <section>
      <h2>Dashboard</h2>
      <RouterView>{() => <p>Select a page from the sidebar.</p>}</RouterView>
    </section>
  );
}
```

- URL `/dashboard` → `RouterView` has no match → shows fallback.
- URL `/dashboard/users` → `RouterView` matches `users` → shows `UsersPage`.

- URL `/dashboard` → `RouterView` 无匹配 → 显示 fallback。
- URL `/dashboard/users` → `RouterView` 匹配 `users` → 显示 `UsersPage`。

Each `RouterView` manages its own fallback independently. There is no global "not found" concept built into the router — you define it at each level where it makes sense.

每个 `RouterView` 独立管理自己的 fallback。路由没有内置的全局"未找到"概念——你在每个有意义的层级自己定义。

---

## Navigation / 导航

### `push` / 编程式导航

```js
const { push } = createRouter({ routes });

await push("/dashboard/users");
// Guard completed, URL updated
// 守卫完成，URL 已更新
```

`push` is async. It runs the `onRoute` guard (if configured), processes redirects, and updates the browser URL. Await it to know when navigation is complete.

`push` 是异步的。它执行 `onRoute` 守卫（如已配置），处理重定向，更新浏览器 URL。可 await 等待导航完成。

### `Link` / 导航链接

`Link` renders an `<a>` element that intercepts clicks and calls `push`, preventing full page reloads.

`Link` 渲染 `<a>` 元素，拦截点击事件并调用 `push`，阻止完整页面重载。

```jsx
<Link to="/dashboard/users">Users</Link>
```

The `to` prop can be a string or a `Signal<string>`. When reactive, the `href` attribute updates automatically.

`to` 属性可以是字符串或 `Signal<string>`。响应式时，`href` 属性自动更新。

```jsx
const target = use("/dashboard");
<Link to={target}>Dashboard</Link>;
```

---

## Navigation Guards / 导航守卫

`onRoute(to, from)` runs before every navigation — `push`, browser back/forward, and the initial page load.

`onRoute(to, from)` 在每次导航前触发——包括 `push`、浏览器前进/后退、首次页面加载。

```js
const { push } = createRouter({
  routes,
  onRoute: async (to, from) => {
    if (to.startsWith("/admin")) {
      const ok = await checkAuth();
      if (!ok) return "/login";
    }
  },
});
```

| Return / 返回          | Behavior / 行为                        |
| ---------------------- | -------------------------------------- |
| `void` / `undefined`   | Allow navigation / 放行                |
| `string`               | Redirect to this path / 重定向到此路径 |
| throw / Promise reject | Cancel navigation / 取消导航           |

There is no per-route guard API. Since `to` is the full path, you branch on path prefixes inside the function. For complex logic, compose smaller guard functions:

没有按路由拆分的守卫 API。`to` 是完整路径，你在函数内部按路径前缀分支判断即可。复杂逻辑可以组合更小的守卫函数：

```js
async function checkAuth(to) {
  /* ... */
}
async function checkPermission(to) {
  /* ... */
}

const { push } = createRouter({
  routes,
  onRoute: async (to, from) => {
    return (await checkAuth(to)) || (await checkPermission(to));
  },
});
```

---

## `current` and `search` / 路径与查询信号

`current` exposes the current pathname as a read-only signal. `search` exposes the parsed query string as a read-only signal. Both are derived from the internal URL state — writing to them has no effect. The only way to change them is through `push` or browser navigation.

`current` 以只读信号形式暴露当前 pathname。`search` 以只读信号形式暴露解析后的查询字符串。两者由内部 URL 状态派生——写入无效。改变它们的唯一途径是 `push` 或浏览器导航。

```js
// URL: /search?q=kiaao
current(); // "/search"
search(); // { q: "kiaao" }
```

**Parameterized routes / 参数化路由**：There is no `:id` syntax in the route map. Use `search` for query parameters, or read `current` and parse it yourself. This keeps the route matching logic simple — it only does segment lookup. Everything else is data processing you control.

**参数化路由**：路由表中没有 `:id` 语法。查询参数用 `search`，路径参数自己解析 `current`。这让路由匹配逻辑保持简单——它只做段查找。其他的都是你自己控制的数据处理。

```js
// Instead of /users/:id → /users?id=42
<Link to="/users?id=42">User 42</Link>;

// Or parse from current / 或从 current 解析
const id = use(current, () => {
  const parts = current().split("/");
  return parts[parts.length - 1];
});
```

**Meta information / 元信息**：There is no `meta` property on routes. Pass whatever data you need as props to the route component directly:

**路由元信息**：路由上没有 `meta` 属性。需要什么数据，直接作为 props 传给路由组件：

```js
const routes = {
  "": RootLayout,
  admin: () => <AdminPage requiredRole="admin" />,
};
```

This is just JSX. No new concepts.

这就是 JSX。没有新概念。

---

## Nested Routes Walkthrough / 嵌套路由完整示例

```jsx
const routes = {
  "": RootLayout,
  demo: {
    "": DemoLayout,
    hello: () => <h1>Hello</h1>,
    world: () => <h1>World</h1>,
  },
};

const { Router, Link } = createRouter({ routes });

function RootLayout({ RouterView }) {
  return (
    <div>
      <nav>
        <Link to="/demo/hello">Hello</Link>
        <Link to="/demo/world">World</Link>
      </nav>
      <main>
        <RouterView>{() => <p>Welcome. Select a demo page.</p>}</RouterView>
      </main>
    </div>
  );
}

function DemoLayout({ RouterView }) {
  return (
    <section>
      <h2>Demo Section</h2>
      <RouterView>{() => <p>Select a demo page.</p>}</RouterView>
    </section>
  );
}

createApp(Router).mount("#app");
```

**URL = `/`** → `RootLayout` renders. Its `RouterView` has no match → shows fallback.

**URL = `/demo/hello`** → `RootLayout` stays. `RouterView` matches `demo` → `DemoLayout` renders. Inside `DemoLayout`, `RouterView` matches `hello` → `<h1>Hello</h1>`.

**URL = `/demo/world`** → Same as above, but the inner `RouterView` switches to `<h1>World</h1>`. No layout rebuilds.

**URL = `/`** → `RootLayout` 渲染。其 `RouterView` 无匹配 → 显示 fallback。

**URL = `/demo/hello`** → `RootLayout` 保留。`RouterView` 匹配 `demo` → 渲染 `DemoLayout`。`DemoLayout` 内 `RouterView` 匹配 `hello` → 渲染 `<h1>Hello</h1>`。

**URL = `/demo/world`** → 同上，但内层 `RouterView` 切换到 `<h1>World</h1>`。所有 layout 保留。

---

## Lazy Routes / 懒加载路由

Use `lazy()` to code-split route components. It works the same for layouts and leaf components.

使用 `lazy()` 对路由组件进行代码分割。layout 和叶子组件均可使用。

```jsx
import { lazy } from "kiaao";

const routes = {
  "": lazy(() => import("./layouts/RootLayout")),
  dashboard: {
    "": lazy(() => import("./layouts/DashboardLayout")),
    users: lazy(() => import("./pages/UsersPage")),
  },
};
```

Lazy layouts receive `RouterView` as a prop just like synchronous ones. The initial page load only downloads components for the current route.

懒加载 layout 像同步组件一样通过 prop 接收 `RouterView`。首次页面加载只下载当前路由所需的组件。

---

## URL Behavior / URL 行为

- **Trailing slash** — Preserved as-is. `push("/foo")` and `push("/foo/")` both work; the browser URL reflects exactly what you passed.
- **Query string** — Parsed into `search` signal. `push("/users?id=42")` works.
- **Hash** — Not tracked by the router. `location.hash` changes do not trigger `onRoute`.
- **Case sensitivity** — All segment matching is case-sensitive. `/Admin` and `/admin` are different paths.
- **Encoding** — `current` returns the decoded pathname (same as `window.location.pathname`). No hidden encoding or normalization.

- **尾斜杠** — 原样保留。`push("/foo")` 和 `push("/foo/")` 均有效；浏览器 URL 精确反映你传入的内容。
- **查询字符串** — 解析为 `search` 信号。`push("/users?id=42")` 可用。
- **Hash** — 路由不追踪。`location.hash` 变化不触发 `onRoute`。
- **大小写敏感** — 所有段匹配大小写敏感。`/Admin` 与 `/admin` 是不同的路径。
- **编码** — `current` 返回已解码的路径名（与 `window.location.pathname` 一致）。无隐藏编码或规范化。

---

## Design Philosophy / 设计哲学

The router does not introduce new concepts beyond what kiaao already provides. Route matching is segment lookup. Layout nesting is object nesting. Navigation is signal updates. Guards are async functions. Meta info is component props. Parameterized routes are query strings or string parsing.

路由不引入 kiaao 已有概念之外的任何新概念。路由匹配是段查找。布局嵌套是对象嵌套。导航是信号更新。守卫是异步函数。元信息是组件 props。参数化路由是查询字符串或字符串解析。

If you can build a kiaao component, you can build a kiaao route. There is nothing extra to learn.

如果你会构建 kiaao 组件，你就会构建 kiaao 路由。没有额外需要学习的东西。

---

Now that you understand routing, learn about control flow and lifecycle. / 现在你了解了路由，继续学习控制流和生命周期。

- [Control Flow / 控制流](./control-flow.md)
- [Lifecycle / 生命周期](./lifecycle.md)
- [SSR / 服务端渲染](./ssr.md)
