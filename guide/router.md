# Router / 路由

Client-side routing is built on kiaao's core primitives — signals for path management, `<Case>` for route matching, and components for views and links.

客户端路由基于 kiaao 核心原语构建——用信号管理路径，用 `<Case>` 进行路由匹配，用组件构建视图和链接。

The router is included in the `kiaao` package. Import it from `kiaao/router`.

路由包含在 `kiaao` 包中。从 `kiaao/router` 导入即可。

```jsx
import { createRouter } from "kiaao/router";
```

---

## `createRouter` / 创建路由

`createRouter(options)` creates a router instance. It returns a `Router` component for the application root, a `Link` component for navigation, and signals for the current path and query.

`createRouter(options)` 创建路由实例，返回应用根组件 `Router`、导航组件 `Link`，以及当前路径和查询的信号。

```jsx
const { Router, Link, push, current, search } = createRouter({
  routes: {
    "": RootLayout,
    login: LoginPage,
    dashboard: {
      "": DashboardLayout,
      users: UsersPage,
      settings: SettingsPage,
    },
  },
  onRoute: async (to, from) => {
    if (to.startsWith("/dashboard") && !(await checkAuth())) {
      return "/login";
    }
  },
});
```

### Options / 参数

| Option / 参数 | Type / 类型                                    | Description / 说明                                                                    |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `routes`      | `RouteMap`                                     | Nested route definition. The `""` key is always the layout / index page.              |
|               |                                                | 嵌套路由定义。`""` 键始终是 layout / 索引页。                                         |
| `onRoute`     | `(to, from) => string \| void \| Promise<...>` | Navigation guard. Returns a string to redirect, `void` to allow, or throws to cancel. |
|               |                                                | 导航守卫。返回 `string` 触发重定向，`void` 放行，throw 取消导航。                     |

### Return Value / 返回值

| Property / 属性 | Type / 类型                       | Description / 说明                                                |
| --------------- | --------------------------------- | ----------------------------------------------------------------- |
| `Router`        | Component                         | Top-level route component. Render once in your application root.  |
|                 |                                   | 顶层路由组件。在应用根部渲染一次。                                |
| `Link`          | Component                         | Declarative navigation. Renders an `<a>` that intercepts clicks.  |
|                 |                                   | 声明式导航。渲染拦截点击的 `<a>` 元素。                           |
| `push`          | `(path: string) => Promise<void>` | Programmatic navigation. Async — await it to wait for guards.     |
|                 |                                   | 编程式导航。异步——可 await 等待守卫完成。                         |
| `current`       | `Signal<string>`                  | Read-only signal for the current pathname. Writing has no effect. |
|                 |                                   | 只读信号，当前 pathname。写入无效。                               |
| `search`        | `Signal<Record<string, string>>`  | Read-only signal for the parsed query string.                     |
|                 |                                   | 只读信号，解析后的查询字符串。                                    |

---

## Route Map / 路由表

Routes are defined as a nested object. The `""` key in each object is the **layout** — it always renders. Other keys are child routes, matched segment by segment. A plain function value is shorthand for `{ "": fn }`.

路由使用嵌套对象定义。每个对象中的 `""` 键是 **layout** ——始终渲染。其他键是子路由，逐段匹配。函数值简写等价于 `{ "": fn }`。

```js
const routes = {
  "": RootLayout, // root layout, always renders / 根 layout，始终渲染
  login: LoginPage, // function shorthand → leaf / 函数简写 → 叶子
  dashboard: {
    "": DashboardLayout, // /dashboard layout / /dashboard 的 layout
    users: UsersPage, // /dashboard/users
    settings: SettingsPage, // /dashboard/settings
  },
};
```

- Leaf route functions do **not** receive `RouterView` — they are terminal components.
- Directory objects render their `""` layout, which receives `RouterView` to render child routes.

- 叶子路由不收 `RouterView` ——它们是末端组件。
- 目录对象渲染 `""` layout，layout 收到 `RouterView` 用于渲染子路由。

---

## Router / 顶级路由组件

`Router` is the top-level component returned by `createRouter`. Mount it once in your application root. It manages the route tree and renders the root layout with the first `RouterView`.

`Router` 是 `createRouter` 返回的顶层组件。在应用根部挂载一次。它管理路由树并渲染根 layout 及首个 `RouterView`。

```jsx
const { Router } = createRouter({ routes: { "": RootLayout } });

function App() {
  return <Router />;
}
```

---

## RouterView / 路由视图

`RouterView` is injected into layout components via props. It renders the matched child route at the current path segment. **Only layouts receive `RouterView`** — leaf components do not.

`RouterView` 通过 props 注入到 layout 组件中。它渲染当前路径段匹配的子路由。**只有 layout 才能收到 `RouterView`** ——叶子组件不收到。

```jsx
function DashboardLayout({ RouterView }: { RouterView: ComponentFunction }) {
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

When navigating to `/dashboard/users`, `DashboardLayout` stays in the DOM. Only the content in `<main>` updates — `RouterView` switches from an empty state to rendering `UsersPage`.

导航到 `/dashboard/users` 时，`DashboardLayout` 保留在 DOM 中。只有 `<main>` 中的内容更新——`RouterView` 从空状态切换到渲染 `UsersPage`。

### Local Fallback / 局部 fallback

Pass a function as the first child of `RouterView` to serve as fallback when no route matches the current segment.

将函数作为 `RouterView` 的第一个子元素传入，当前段无匹配时作为 fallback。

```jsx
function DashboardLayout({ RouterView }) {
  return (
    <section>
      <RouterView>{() => <NotFound />}</RouterView>
    </section>
  );
}
```

---

## `push` / 编程式导航

`push(path)` triggers navigation. It calls the `onRoute` guard (if configured), processes redirects, and updates the browser URL. Returns a `Promise` — await it to wait for guard completion.

`push(path)` 触发导航。调用 `onRoute` 守卫（如已配置），处理重定向，更新浏览器 URL。返回 `Promise`——可 await 等待守卫完成。

```js
const { push } = createRouter({ routes });

await push("/dashboard/users");
// Guard completed, URL updated
```

If `onRoute` returns a `string`, the navigation is redirected. The redirect chain is capped at 10 hops.

如果 `onRoute` 返回 `string`，导航被重定向。重定向链上限 10 次。

```js
const { push } = createRouter({
  routes,
  onRoute: (to) => (to.startsWith("/admin") ? "/login" : undefined),
});
```

---

## Link / 导航链接

`Link` renders an `<a>` element that intercepts click events and calls `push`, preventing full page reloads. The `to` prop accepts a string or a `Signal<string>`.

`Link` 渲染 `<a>` 元素，拦截点击事件并调用 `push`，阻止完整页面重载。`to` 属性接受字符串或 `Signal<string>`。

```jsx
<Link to="/dashboard/users">Users</Link>;

// Reactive target / 响应式目标
const target = use("/dashboard");
<Link to={target}>Dashboard</Link>;
```

When `to` is a `Signal<string>`, the `href` attribute updates automatically.

当 `to` 是 `Signal<string>` 时，`href` 属性会自动更新。

---

## `current` / `search` — 只读信号

`current` exposes the current pathname as a signal. `search` exposes the parsed query string as a signal. Both are **logically read-only** — writing has no effect. The only way to change them is through `push`.

`current` 以信号形式暴露当前 pathname。`search` 以信号形式暴露解析后的查询字符串。两者均为**逻辑只读**——写入无效。改变它们的唯一途径是 `push`。

```js
const { current, search } = createRouter({ routes });

// URL: /search?q=kiaao
current(); // "/search"
search(); // { q: "kiaao" }

current("/anything"); // 写入无效
search({ q: "x" }); // 写入无效
```

---

## `onRoute` / 导航守卫

`onRoute(to, from)` fires before every navigation — `push`, browser back/forward, and the initial page load.

`onRoute(to, from)` 在每次导航前触发——包括 `push`、浏览器前进/后退、首次页面加载。

| Return / 返回          | Behavior / 行为                                   |
| ---------------------- | ------------------------------------------------- |
| `void` / `undefined`   | Allow navigation / 放行                           |
| `string`               | Redirect to this path / 重定向到此路径            |
| throw / Promise reject | Cancel navigation, URL stays / 取消导航，URL 不变 |

The guard can be `async`. During async guards, the URL does not change — no visual flicker.

守卫可以是 `async`。异步守卫期间 URL 不变——无视觉闪烁。

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

---

## Nested Routes Example / 嵌套路由完整示例

```jsx
import { createRouter } from "kiaao/router";

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
        <RouterView />
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

function App() {
  return <Router />;
}
```

When navigating:

1. `/` — `RootLayout` renders. Its `RouterView` shows the layout's fallback (or nothing).
2. `/demo/hello` — `RootLayout` stays. `RouterView` matches `demo` → `DemoLayout` renders. Inside `DemoLayout`, `RouterView` matches `hello` → `<h1>Hello</h1>`.
3. `/demo/world` — Same as above, but the inner `RouterView` switches to `<h1>World</h1>`. No layout rebuilds.

路由切换时：

1. `/` — `RootLayout` 渲染。其 `RouterView` 显示 layout 的 fallback（或空）。
2. `/demo/hello` — `RootLayout` 保留。`RouterView` 匹配 `demo` → 渲染 `DemoLayout`。`DemoLayout` 内 `RouterView` 匹配 `hello` → 渲染 `<h1>Hello</h1>`。
3. `/demo/world` — 同上，但内层 `RouterView` 切换到 `<h1>World</h1>`。所有 layout 保留。

---

- [Components / 组件](./components.md)
- [Reactivity / 响应式系统](./reactivity.md)
