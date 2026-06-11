# Router / 路由

Client-side routing is provided as a standalone package `kiaao/router`. It is built entirely on the core primitives — signals for current path, `when` for route matching, and components for views and links. There is no router-specific reactivity system.

客户端路由作为独立包 `kiaao/router` 提供。它完全基于核心原语构建——用信号管理当前路径，用 `when` 进行路由匹配，用组件构建视图和链接。没有路由器专属的响应式系统。

```bash
npm install kiaao
```

The router is included in the `kiaao` package. Import it from `kiaao/router`.

路由包含在 `kiaao` 包中。从 `kiaao/router` 导入即可。

---

## `createRouter` / 创建路由

`createRouter(options?)` creates a router instance. It returns the components and signals needed for routing. Call it once at the application root.

`createRouter(options?)` 创建一个路由实例。它返回路由所需的组件和信号。在应用根部调用一次。

```jsx
import { createRouter } from "kiaao/router";

const { RouterView, Link, navigate, currentPath, currentParams } = createRouter({
  fallback: NotFound, // optional / 可选
});
```

### Options / 参数

| Option / 参数 | Type / 类型 | Description / 说明                                                                |
| ------------- | ----------- | --------------------------------------------------------------------------------- |
| `fallback`    | Component   | Component to render when no route matches. Defaults to a "404 Not Found" message. |
| `fallback`    | 组件        | 无匹配时渲染的组件。默认为显示 "404 Not Found"。                                  |

### Return Value / 返回值

| Property / 属性 | Type / 类型                      | Description / 说明                                  |
| --------------- | -------------------------------- | --------------------------------------------------- |
| `RouterView`    | Component                        | The route view. Renders the matched component.      |
| `RouterView`    | 组件                             | 路由视图。渲染匹配的组件。                          |
| `Link`          | Component                        | Declarative navigation link.                        |
| `Link`          | 组件                             | 声明式导航链接。                                    |
| `navigate`      | `(path: string) => void`         | Programmatic navigation. Receives an absolute path. |
| `navigate`      | `(path: string) => void`         | 编程式导航。接收完整绝对路径。                      |
| `currentPath`   | `Getter<string>`                 | A signal holding the current pathname.              |
| `currentPath`   | `Getter<string>`                 | 保存当前路径名的信号。                              |
| `currentParams` | `Getter<Record<string, string>>` | A signal holding the current URL query parameters.  |
| `currentParams` | `Getter<Record<string, string>>` | 保存当前 URL 查询参数的信号。                       |

---

## `RouterView` / 路由视图

`RouterView` is the component that watches the current path and renders the matched route. It uses a `when` directive internally with map mode — the route path acts as the key, and the route component is the branch.

`RouterView` 是监听当前路径并渲染匹配路由的组件。它内部使用映射表模式的 `when` 指令——路由路径作为 key，路由组件作为分支。

### Props

| Prop / 属性 | Type / 类型 | Description / 说明                                                                               |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `routes`    | `Route[]`   | Array of route definitions.                                                                      |
| `routes`    | `Route[]`   | 路由定义数组。                                                                                   |
| `base`      | `string`    | Path prefix. The RouterView only responds to path changes within this base. Must start with `/`. |
| `base`      | `string`    | 路径前缀。该 RouterView 只响应 base 内的路径变化。必须以 `/` 开头。                              |
| `fallback`  | Component   | Fallback when no route matches. Overrides the instance-level fallback.                           |
| `fallback`  | 组件        | 无匹配时的后备内容。覆盖实例级 fallback。                                                        |

### Route Definition / 路由定义

```ts
interface Route {
  path: string; // path segment to match / 要匹配的路径段
  component: any; // component function to render / 要渲染的组件函数
}
```

---

## Basic Usage / 基本用法

```jsx
import { createRouter } from "kiaao/router";
import { mount } from "kiaao";

const { RouterView } = createRouter();

const routes = [
  { path: "", component: Home },
  { path: "about", component: About },
  { path: "users", component: Users },
];

function App() {
  return (
    <div>
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/users">Users</a>
      </nav>
      <main>
        <RouterView routes={routes} />
      </main>
    </div>
  );
}

mount(<App />, document.getElementById("app"));
```

Navigating to `/about` renders the `About` component inside the `<main>` element. The rest of the page (the `<nav>`) is unchanged. This is because `RouterView` only re-renders its own children — not the entire application.

导航到 `/about` 会在 `<main>` 元素内渲染 `About` 组件。页面的其余部分（`<nav>`）保持不变。这是因为 `RouterView` 只重新渲染自己的子节点——而不是整个应用。

---

## Nested Routes / 嵌套路由

Use the `base` prop on nested `RouterView` components to create layouts. A parent route renders a layout component, which contains another `RouterView` with a narrower `base`. The same routes array can be reused, or each level can have its own routes.

在嵌套的 `RouterView` 上使用 `base` 属性可创建布局。父路由渲染一个布局组件，其中包含另一个具有更窄 `base` 的 `RouterView`。可以复用同一个路由数组，也可以每层拥有独立的路由。

```jsx
const { RouterView } = createRouter();

const appRoutes = [
  { path: "", component: Home },
  { path: "login", component: Login },
  { path: "dashboard", component: DashboardLayout },
];

const dashboardRoutes = [
  { path: "", component: DashboardHome },
  { path: "users", component: Users },
  { path: "settings", component: Settings },
];

function App() {
  return <RouterView routes={appRoutes} />;
}

function DashboardLayout() {
  return (
    <section>
      <Sidebar />
      <main>
        <RouterView base="/dashboard" routes={dashboardRoutes} />
      </main>
    </section>
  );
}
```

When navigating to `/dashboard/users`:

1. The top-level `RouterView` matches `dashboard` → renders `DashboardLayout`.
2. Inside `DashboardLayout`, the nested `RouterView` with `base="/dashboard"` strips the prefix, leaving `/users`.
3. It matches `users` in `dashboardRoutes` → renders `Users`.
4. `DashboardLayout` (including `Sidebar`) stays in the DOM. Only the content inside `<main>` updates.

导航到 `/dashboard/users` 时：

1. 顶层 `RouterView` 匹配 `dashboard` → 渲染 `DashboardLayout`。
2. 在 `DashboardLayout` 内部，带有 `base="/dashboard"` 的嵌套 `RouterView` 将前缀裁剪，剩下 `/users`。
3. 在 `dashboardRoutes` 中匹配 `users` → 渲染 `Users`。
4. `DashboardLayout`（包括 `Sidebar`）保留在 DOM 中。只有 `<main>` 中的内容更新。

---

## `Link` / 导航链接

`Link` is a declarative navigation component. It renders an `<a>` element that intercepts click events and calls `navigate` internally, preventing full page reloads. The `to` prop accepts an absolute path string or a signal getter.

`Link` 是声明式导航组件。它渲染一个 `<a>` 元素，拦截点击事件并在内部调用 `navigate`，阻止完整页面重载。`to` 属性接受绝对路径字符串或信号 getter。

```jsx
<Link to="/dashboard/users">Users</Link>

// Reactive target / 响应式目标
const [item] = use({ path: '/dashboard', title: 'Dashboard' })
<Link to={item(v => v.path)}>{item(v => v.title)}</Link>
```

---

## Programmatic Navigation / 编程式导航

Use `navigate(path)` for imperative navigation — inside event handlers, after async operations, or anywhere outside of JSX.

使用 `navigate(path)` 进行命令式导航——在事件处理器内部、异步操作之后，或任何 JSX 之外的地方。

```jsx
const { navigate } = createRouter();

function handleLogin() {
  // authenticate...
  navigate("/dashboard");
}
```

---

## Reading the Current Path / 读取当前路径

`currentPath` is a signal getter. You can use it in any derivation or JSX expression to react to path changes.

`currentPath` 是一个信号 getter。可以在任何派生或 JSX 表达式中使用它来响应路径变化。

```jsx
const { currentPath } = createRouter();

const [isActive] = use(currentPath, () => currentPath().startsWith("/admin"));

return <div class={isActive ? "active" : ""}>Current: {currentPath}</div>;
```

`currentParams` provides the parsed query string as an object. It is also a signal.

`currentParams` 以对象形式提供解析后的查询字符串。它也是一个信号。

```jsx
const { currentParams } = createRouter();

// URL: /search?q=kiaao&page=1
console.log(currentParams()); // { q: 'kiaao', page: '1' }
```
