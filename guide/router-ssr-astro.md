# 路由、SSR 与 Astro 集成

## 路由

轻量客户端路由作为独立包 `kiaao/router` 提供，完全基于核心原语构建。

### createRouter

`createRouter(options?)` 创建路由实例，返回 `{ RouterView, navigate, currentPath, currentParams, Link }`。

#### 参数

- **`options.fallback`**：无匹配时的后备组件，默认为显示 "404 Not Found"。

#### 返回值

| 属性            | 类型                           | 说明                                             |
| --------------- | ------------------------------ | ------------------------------------------------ |
| `RouterView`    | 组件                           | 路由视图，支持 `base`、`routes`、`fallback` 属性 |
| `navigate`      | `(path: string) => void`       | 编程式导航，接收完整绝对路径                     |
| `currentPath`   | `Getter<string>`               | 当前路径名信号                                   |
| `currentParams` | `() => Record<string, string>` | 当前 URL 查询参数                                |
| `Link`          | 组件                           | 声明式导航链接                                   |

### RouterView 组件

`RouterView` 是路由视图组件，负责根据当前 URL 匹配路由并渲染对应组件。

#### 属性

| 属性       | 类型                          | 说明                                                            |
| ---------- | ----------------------------- | --------------------------------------------------------------- |
| `base`     | `string \| undefined`         | 路径前缀，以 `/` 开头。该 RouterView 只响应 base 内的路径变化。 |
| `routes`   | `Route[] \| undefined`        | 专属路由表，不传则使用 `createRouter` 的默认路由表。            |
| `fallback` | `RouteComponent \| undefined` | 无匹配时的后备内容，不传则使用实例级 fallback。                 |

#### 嵌套路由

通过 `base` 属性实现嵌套布局。同一路由表可以被多个 RouterView 以不同的 `base` 使用：

```tsx
import { createRouter } from "kiaao/router";

const router = createRouter();

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

导航到 `/dashboard/users` 时：

- 顶层 RouterView 匹配 `dashboard` → 渲染 DashboardLayout
- 内层 RouterView（base=`/dashboard`）裁剪路径为 `/users` → 匹配 `users` → 渲染 Users
- DashboardLayout 保持不动，仅 main 区域内容更新

### Link 组件

声明式导航链接。`to` 属性接收完整绝对路径，支持响应式 getter。

```tsx
<Link to="/dashboard/users">用户管理</Link>
<Link to={item((v) => v.path)}>{item((v) => v.title)}</Link>
```

---

## 服务端渲染（SSR）

### renderToString

将组件渲染为 HTML 字符串。

```tsx
import { renderToString } from "kiaao/server";

const html = renderToString(MyComponent, { name: "kiaao" });
```

SSR 模式下：

- `effect` 被禁用，返回空 `stop` 函数
- `derive` 执行一次计算，返回固定值
- `onMount`/`onUnmount` 不触发
- `when` 指令：条件为 false 时保留宿主空元素标签（与客户端一致）
- `each` 指令：宿主元素序列化一次，子节点在内部按数组重复渲染

---

## Astro 集成

kiaao 提供官方 Astro 集成。纯静态组件零 JavaScript 输出，`client:only` 组件在浏览器端完整挂载。

### 安装

```bash
npm install kiaao astro
```

### 配置

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import kiaao from "kiaao/astro";

export default defineConfig({
  integrations: [kiaao()],
});
```

### 使用

静态组件（零 JS 输出）：

```astro
---
import MyComponent from "./MyComponent";
---

<MyComponent />
```

客户端组件（浏览器端挂载）：

```astro
---
import MyComponent from "./MyComponent";
---

<MyComponent client:only />
```
