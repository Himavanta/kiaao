# 路由 API 方案

**状态**:已确认,待实施
**日期**:2026-07-23

## 一、背景与目标

当前路由 API(`createRouter` + `<RouterView>`)存在以下问题:

1. **路由树隐式散落**:`<RouterView routes={...} base={...} />` 调用散落在各个组件内部,路由层级关系难以追踪排查。全局搜索 `RouterView` 得到一堆结果,每个 `base` 都要点开上下文才能判断层级。
2. **命名不一致**:`navigate` / `currentPath` / `currentParams` 命名风格不统一,`currentParams` 暗示路径参数但实际是 query string。
3. **缺少导航守卫**:无法在路由切换前做鉴权、重定向等决策。
4. **异步场景缺失**:鉴权等场景需要异步决策,当前 `navigate` 是同步的,无法等待。

本方案通过重新设计 API 解决上述问题,同时保持 kiaao 的极简哲学:不引入 isNavigating、loading、Suspense 等概念(这些属于渲染层,由未来的 Suspense 机制统一处理)。

## 二、API 设计

### createRouter

```ts
createRouter(options: {
  onRoute?: (to: string, from: string | null) =>
    string | void | Promise<string | void>;
  fallback?: ComponentFunction;
}): {
  Link: ComponentFunction;
  define: (options: DefineOptions) => ComponentFunction;
  push: (path: string) => Promise<void>;
  current: Signal<string>;                              // pathname
  search: Signal<Record<string, string>>;               // query params
};
```

### define(路由视图工厂)

```ts
interface DefineOptions {
  /** 路径前缀,以 / 开头不含尾 /。如 "/dashboard"。根路径用 "/"。 */
  base?: string;
  /** 路由定义数组。 */
  routes: Route[];
  /** 当前视图无匹配时的后备组件。不传则用 createRouter 的 fallback。 */
  fallback?: ComponentFunction;
}

interface Route {
  /** 单个路径段,不允许包含 /。空字符串 "" 表示默认子路由。 */
  path: string;
  component: ComponentFunction;
}
```

### 使用示例

```tsx
// routes.tsx — 集中定义,路由树显式可追踪
import { createRouter } from "kiaao/router";
import { Home, DashboardLayout, DashboardHome, Users, Login } from "./pages";

const { Link, define, push, current, search } = createRouter({
  onRoute: async (to, from) => {
    // 鉴权重定向
    if (to.startsWith("/dashboard") && !(await checkAuth())) {
      return "/login";
    }
    // 返回 void 放行
  },
  fallback: NotFound,
});

const AppView = define({
  routes: [
    { path: "", component: Home },
    { path: "login", component: Login },
    { path: "dashboard", component: DashboardView },
  ],
});

const DashboardView = define({
  base: "/dashboard",
  routes: [
    { path: "", component: DashboardHome },
    { path: "users", component: Users },
  ],
});

// app.tsx — 调用处只引用一个组件
function App() {
  return <AppView />;
}
```

## 三、onRoute 钩子

### 语义

`onRoute(to, from)` 在每次路由切换前触发,用于导航决策(鉴权、重定向、日志等)。

- **首次进入**:`from = null`,触发 `onRoute(initialPath, null)`。
- **后续切换**:`from = current()`(当前 pathname)。

### 返回值

| 返回类型             | 行为                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `void` / `undefined` | 放行,执行 pushState + 更新信号                                               |
| `string`             | 重定向:用该字符串作为新目标,再次触发 `onRoute`(重定向链)                     |
| `Promise<T>`         | 异步决策:await 期间 URL 不变(不 pushState),避免闪烁;resolve 后按上述规则处理 |

### 重定向链

- 返回字符串会再次触发 `onRoute`,形成重定向链。
- **无最大次数兜底**:用户需自行保证终止条件(如检查 `to === from` 直接 return),否则会无限循环。
- 这符合 kiaao "把控制权交给用户"的哲学,框架不做隐藏的状态干预。

### 异常处理

- `onRoute` 抛异常(同步或 Promise reject)→ `console.error` 输出错误 + 取消导航(不 pushState,信号不变)。
- `push` 返回的 Promise 会 reject,让 `await push(...)` 的调用方能感知失败。

### 同步场景

- 未传 `onRoute` → `push` 直接执行 pushState + 更新信号,仍返回 Promise(立即 resolve),保持 API 一致性。
- `onRoute` 同步返回 → Promise 立即 resolve,无视觉影响。

## 四、push 行为

```ts
push(path: string): Promise<void>
```

1. 调用 `onRoute(path, current())`(若存在)
2. await 期间 URL 不变,旧 UI 保持(不 unmount、不切换组件)
3. resolve 后:
   - 返回 `void` → 执行 `history.pushState` + 更新 `current` / `search` 信号
   - 返回 `string` → 用该字符串作为新 path,重新走流程(重定向链)
4. 异常 → `console.error` + 取消导航,Promise reject
5. 正常完成 → Promise resolve

**返回 Promise 的设计**:可 await 但不强制。默认火灾即忘,需要时(如等待鉴权完成后再做后续操作)可以 await。

## 五、define 的设计动机

### 痛点:RouterView 散落

当前模式:

```tsx
// 路由配置散落在组件内部,排查困难
function DashboardLayout() {
  return (
    <section>
      <Sidebar />
      <RouterView base="/dashboard" routes={[...]} />
    </section>
  );
}

function Users() {
  return <RouterView base="/dashboard/users" routes={[...]} />;
}
```

- 全局搜 `RouterView` 得到一堆,每个 `base` 要点开看上下文
- 路由树是隐式的,没有单一文件能一眼看全
- 想给某层加守卫/过渡,要在每个 RouterView 处重复处理

### 解决:define 集中定义

```tsx
// routes.tsx — 路由树拓扑一眼可见
const AppView = define({ routes: [...] });
const DashboardView = define({ base: "/dashboard", routes: [...] });
const UsersView = define({ base: "/dashboard/users", routes: [...] });
```

- 打开 routes.tsx 就知道整个应用的路由结构
- 全局搜 `define` 得到所有视图定义,每个 `base` 在同一上下文
- 想给某个 view 单独加 fallback,直接在那条 define 上加,不污染组件代码
- 组件纯净:组件只管渲染,不掺杂路由配置

### 与 kiaao 哲学的一致性

kiaao 强调"显式声明依赖"。当前模式把路由依赖隐式散落在组件树里,其实是反 kiaao 的。`define` 把路由结构变成显式声明,更符合框架精神。

## 六、命名决策

| 旧命名              | 新命名        | 理由                                                        |
| ------------------- | ------------- | ----------------------------------------------------------- |
| `navigate`          | `push`        | 直接对应 `history.pushState`,为未来 `replace`/`back` 留空间 |
| `currentPath`       | `current`     | 简化;在路由上下文中无歧义                                   |
| `currentParams`     | `search`      | 直接对应 `location.search`,避免"路径参数还是查询参数"的歧义 |
| `RouterView` 组件   | `define` 工厂 | 集中定义路由树;返回组件而非 JSX 元素                        |
| `onEnter`/`onLeave` | `onRoute`     | 单一钩子处理所有场景,避免镜像冗余                           |

## 七、取消的 API

以下项目**不提供**,理由如下:

| 项目                  | 理由                                                        |
| --------------------- | ----------------------------------------------------------- |
| `RouterView` 组件导出 | 被 `define` 完全取代,减少 API 表面                          |
| `onLeave`             | 与 `onRoute(to, from)` 信息对称,冗余                        |
| `isNavigating` 信号   | onRoute 内部用户可自管 loading;典型场景(鉴权)不需要 UI 反馈 |
| loading 状态          | 属于渲染层,由未来的 Suspense 机制统一处理,不在 router 层    |
| 重定向次数兜底        | 用户自负,符合 kiaao 控制权交给用户的哲学                    |
| 动态参数 `:param`     | 保持路由匹配为纯字符串比较,无解析开销;用 query string 传值  |
| `:param` 守卫         | 同上                                                        |

## 八、嵌套机制(不变)

`base` 字符串约定 + `extractSegment` 逐段匹配逻辑保持不变。

### 匹配算法

```ts
function extractSegment(fullPath: string, base?: string): string | null {
  if (base) {
    if (base === "/") {
      // 匹配所有路径
    } else {
      if (!fullPath.startsWith(base)) return null;
      if (fullPath.length > base.length && fullPath[base.length] !== "/") return null;
    }
  }
  const relative = base ? fullPath.slice(base.length) : fullPath;
  return relative.replace(/^\/+/, "").split("/")[0] || "";
}
```

### 逐层匹配示例

URL = `/dashboard/users`:

1. **顶层 define**(无 base)
   - `extractSegment("/dashboard/users", undefined)` → `"dashboard"`
   - 匹配 `appRoutes` 中的 `dashboard` → 渲染 `DashboardView`
2. **DashboardView**(base="/dashboard")
   - `extractSegment("/dashboard/users", "/dashboard")` → `"users"`
   - 匹配 `dashboardRoutes` 中的 `users` → 渲染 `Users`

每层只取第一段,下一层用更深的 base 重新看完整路径。父布局天然驻留(因为父层 segment 未变,`<Case>` 不切换)。

## 九、内部实现要点

`define` 返回的组件内部逻辑(基于现有 `<Case>` 机制):

```ts
function define(options: DefineOptions): ComponentFunction {
  const { base, routes, fallback } = options;
  const routeMap = Object.fromEntries(
    routes.map((r) => [r.path, () => h(r.component, undefined)] as const),
  );
  const myFallback = fallback ?? defaultFallback;

  return () => {
    const segment = use(current, () => extractSegment(current(), base));
    return h(Case, { value: segment }, routeMap, myFallback);
  };
}
```

- `use(current, ...)` 显式声明依赖,`current` 变化时自动重算 segment
- 路由表转 map 在 `define` 调用时执行一次
- `<Case>` 内部处理 key 比较与分支切换(已有机制,不变)

## 十、与当前实现的差异

`src/router/index.ts` 需要的改动:

1. `navigate` → `push`,改为 async,集成 `onRoute` 调用 + 重定向链 + 异常处理
2. `currentPath` → `current`,`currentParams` → `search`
3. 新增 `define` 工厂函数(包装现有 RouterView 内部逻辑)
4. 删除 `RouterView` 导出
5. `createRouter` 接收 `onRoute` 选项
6. 初始化时触发 `onRoute(initialPath, null)`

测试需同步更新:`tests/router/router.test.ts`、`tests/router/router-extreme.test.ts`。

## 十一、待办

- [ ] 实施 `src/router/index.ts` 重构
- [ ] 更新测试用例
- [ ] 更新 `guide/router.md`(单独任务,反映新 API)
- [ ] 更新 `packages/example` 中的路由使用示例(若有)

## 十二、相关历史文档

以下文档已废弃,保留用于历史追溯:

- [嵌套 RouterView 方案讨论与设计](./嵌套RouterView方案讨论与设计.md) — 旧 RouterView 嵌套设计
- [when 指令扩展与 RouterView 重构方案](./when指令扩展与RouterView重构方案.md) — 旧 RouterView 重构(when 扩展部分仍可参考)
