> ⚠️ **已废弃 / Deprecated**
> 本文档描述的方案已被新路由 API 取代,请参考 [路由 API 方案](./路由API方案.md)。
> 保留用于历史追溯。

# RouterView 嵌套路由与布局稳定性设计

## 概述

`RouterView` 是 kiaao 路由系统的核心组件，负责将当前 URL 路径匹配到对应的路由组件并渲染。在嵌套布局场景中，外层布局组件（如包含侧边栏的仪表盘布局）需要在子路由切换时保持不变，仅内部内容区域更新。为了在 kiaao 的纯运行时、无虚拟 DOM 架构下实现这一目标，`RouterView` 采用了分层单段路由设计，并结合内部的 `SKIP_UPDATE` 机制保证布局组件不被不必要地重建。

## 路由表设计

### 路径约束

每个路由的 `path` 必须是**单个路径段**，不能包含 `/` 字符。空字符串 `""` 表示当前层级的默认子路由（即该 base 下的根路径）。

**有效示例**：`""`, `"dashboard"`, `"users"`  
**无效示例**：`"/dashboard"`, `"/users/42"`

### 路由表分层

- **顶层路由表**：定义应用根路径下的第一段路由。
- **子路由表**：每个布局组件可拥有自己的路由表，路径段相对其 `base` 定义。

### 示例

```ts
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

const usersRoutes = [
  { path: "", component: UsersList },
  { path: "detail", component: UserDetail },
];
```

## RouterView 组件

### 属性

| 属性       | 类型                     | 说明                                                                                                                 |
| ---------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `base`     | `string \| undefined`    | 当前 RouterView 的路径前缀，以 `/` 开头，不含尾 `/`。如 `"/dashboard"`。根路径可用 `"/"`，其行为与不传 `base` 等价。 |
| `routes`   | `Route[] \| undefined`   | 当前 RouterView 专用的路由表。不传则使用 `createRouter` 时传入的默认路由表。                                         |
| `fallback` | `() => any \| undefined` | 当前 RouterView 无匹配时的后备内容。若不传则使用 `createRouter` 的全局 fallback。                                    |

### 匹配逻辑

1. **提取当前段**：从 `currentPath` 中取出当前 RouterView 所负责的路径段。
   - 若 `base` 存在，先验证路径是否在 `base` 范围内（`startsWith` + 斜杠边界检查），再裁剪得到相对路径，取第一个 `/` 前的内容作为段。
   - 若 `base` 不存在，直接取完整路径的第一个段。
   - 尾斜杠、多余斜杠等异常情况会自然过滤为 `""`。
2. **匹配路由**：使用 `matchRoute` 函数在 `routes` 中查找 `path` 与当前段完全相等的路由（纯字符串比较）。不支持动态段（`:param`）。若未找到，则渲染 fallback。

### 布局稳定性与 SKIP_UPDATE 机制

`RouterView` 内部使用 `when` 指令包裹内容，惰性函数会在依赖（`currentPath`）变化时重新执行。为了避免在同一布局内的子路由切换时重建外层布局组件，`RouterView` 引入了 **`SKIP_UPDATE`** 内部协议。

**`SKIP_UPDATE`** 是一个框架内部的 `Symbol`，由 `RouterView` 的惰性函数返回，用于通知 `when` 指令“本次更新无需操作 DOM”。

**工作流程**：

1. `RouterView` 惰性函数执行时，先提取当前段并匹配路由。
2. 将当前段与上一次渲染时的段进行比较。
   - 若**相同**，表示布局组件不应改变，返回 `SKIP_UPDATE`。`when` 指令收到此值后，**不清空旧 DOM，不插入新 DOM**，保持原有 DOM 不变。
   - 若**不同**，更新缓存的段，并根据匹配到的组件创建新的 DOM 节点返回。`when` 指令正常替换内容。

这样，当从 `/dashboard/users` 切换到 `/dashboard/settings` 时：

- 顶层 RouterView（`base="/"` 或未设）提取的段仍为 `"dashboard"`，与缓存相同 → 返回 `SKIP_UPDATE` → 外层 `DashboardLayout` 保持不动，搜索框焦点、输入状态均不丢失。
- 内层 RouterView（`base="/dashboard"`）提取的段从 `"users"` 变为 `"settings"`，与缓存不同 → 正常重新渲染内容区域。

### 实现要点

- 段提取需处理 `base="/"` 的特殊情况（`startsWith("/")` 恒真，行为同无 `base`）。
- 边界检查防止 `/dashboard-v2` 误匹配 `base="/dashboard"`。
- 路由匹配为纯字符串相等，无任何前缀或模式匹配。
- `SKIP_UPDATE` 仅在 `RouterView` 内部使用，不对外暴露。

### 动态参数

路由不支持 `:param` 语法。需要传递动态值时使用查询字符串，并通过 `URLSearchParams` 解析。

```tsx
<Link to="/dashboard/users/detail?id=42">用户详情</Link>;
// 组件内
const id = new URLSearchParams(window.location.search).get("id");
```

### 导航与链接

`navigate(path)` 和 `<Link to={path}>` 均接受**完整绝对路径**，与路由表 `base` 无关。

## 与旧版路由的差异

- `path` 从完整路径改为单段，禁止包含 `/`。
- 废弃多段精确匹配和 `:param` 语法。
- 新增 `RouterView` 的 `base`、`routes`、`fallback` 属性。
- 导航必须使用完整绝对路径。

## 总结

`RouterView` 通过分层单段路由和内部的 `SKIP_UPDATE` 机制，在保持 kiaao 极简哲学的前提下，实现了嵌套布局的稳定渲染。布局组件在子路由切换时不会被销毁重建，状态和焦点得以保留，同时路由匹配逻辑保持极其简单的纯字符串比较。这个设计避免了虚拟 DOM 或通用组件缓存的复杂性，是 kiaao “用最小概念解决最大问题”原则的体现。
