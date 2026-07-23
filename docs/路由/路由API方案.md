# 路由 API 方案

**状态**:已确认,待实施
**日期**:2026-07-23

## 一、背景与目标

当前路由 API(`createRouter` + `<RouterView>`)存在以下问题:

1. **路由树隐式散落**:`<RouterView routes={...} base={...} />` 调用散落在各个组件内部,路由层级关系难以追踪排查。全局搜索 `RouterView` 得到一堆结果,每个 `base` 都要点开上下文才能判断层级。
2. **命名不一致**:`navigate` / `currentPath` / `currentParams` 命名风格不统一,`currentParams` 暗示路径参数但实际是 query string。
3. **缺少导航守卫**:无法在路由切换前做鉴权、重定向等决策。
4. **异步场景缺失**:鉴权等场景需要异步决策,当前 `navigate` 是同步的,无法等待。
5. **信号可写性未约束**:`currentPath` / `currentParams` 对外是可写信号,但页面内直接写入会绕过 onRoute 守卫、绕过 pushState,破坏"push 是唯一导航入口"的契约。

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
  current: Signal<string>;                              // pathname,派生只读
  search: Signal<Record<string, string>>;               // query params,派生只读
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
    // 鉴权重定向(to 含完整路径,可基于 query 决策)
    if (to.startsWith("/dashboard") && !(await checkAuth())) {
      return "/login?redirect=" + encodeURIComponent(to);
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
- **后续切换**:`from` 为当前完整路径(含 search)。

### 参数格式:完整路径(含 search)

`to` / `from` 均为**完整路径字符串**,可包含 query string,如 `"/dashboard?tab=secret"`。

**为什么必须是完整路径**(而非仅 pathname):

1. **onRoute 返回值作为 push 参数**:onRoute 返回字符串会触发重定向,该字符串直接传给 `push`。如果 onRoute 看不到 query,就无法构造带回跳地址的重定向(如 `return "/login?redirect=" + to`)。这是功能完整性的硬约束。
2. **基于 query 的鉴权**:某些场景需要根据 query 参数决策(如 `?token=xxx`),只传 pathname 无法支持。
3. **search 变化必须触发 onRoute**:`push("demo?a=2")` 从 `demo?a=1` 跳转是一次明确的导航动作,不触发 onRoute 违反直觉。只有完整路径作为参数,onRoute 才能区分这种切换(`to !== from`)。

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
// path 可为 "/dashboard" 或 "/dashboard?a=1&page=2"
```

1. 调用 `onRoute(path, currentUrl)`(若存在),其中 `currentUrl` 是当前完整路径
2. await 期间 URL 不变,旧 UI 保持(不 unmount、不切换组件)
3. resolve 后:
   - 返回 `void` → 执行 `history.pushState` + 更新内部源信号
   - 返回 `string` → 用该字符串作为新 path,重新走流程(重定向链)
4. 异常 → `console.error` + 取消导航,Promise reject
5. 正常完成 → Promise resolve

**返回 Promise 的设计**:可 await 但不强制。默认火灾即忘,需要时(如等待鉴权完成后再做后续操作)可以 await。

**触发规则**:**任何 `push` 调用都触发 onRoute**,无论 pathname 是否变化。这是唯一一致的设计——用户调用了 push 就该走完整流程,避免"有时候触发有时候不触发"的迷惑行为。

## 五、current / search 信号的只读设计

### 问题:可写信号的风险

若 `current` / `search` 对外是可写信号,组件内可直接 `current("/xxx")` 修改路径,这会:

- 绕过 onRoute 守卫(鉴权失效)
- 绕过 pushState(URL 不变,信号和 URL 不一致)
- 破坏"push 是唯一导航入口"的契约

因此这两个信号必须**对外只读**。

### kiaao 的只读方案:派生信号

kiaao 的 `Signal<T>` 是读写统一的(无参读、有参写),没有独立的"只读信号"概念(见 README 第 11 行)。因此"派生实现只读"采用以下方式:

```ts
// router 内部维护一个可写的源信号(完整 URL)
const _url = use(getPathname() + getSearch());

// 对外暴露的是派生信号
const current = use(_url, () => _url().split("?")[0] || "/");
const search = use(_url, () => parseSearch(_url().split("?")[1] || ""));
```

- 用户调用 `current("/xxx")` 会触发派生重算,但派生函数读取的还是 `_url()` 原值,所以**写入无效**(自然短路)
- 实现了"逻辑只读",无需引入新的 readonly 概念
- 符合 kiaao "不区分可写/只读信号"的哲学

### 统一源信号设计

内部用一个 `_url` 完整路径信号,`current` / `search` 都从它派生:

- **保证一致性**:current 和 search 永远同步,不会出现一个更新了另一个没更新的情况
- **简化 onRoute 的 from 构造**:`from = _url()` 一行搞定
- **popstate 处理简单**:监听 popstate 时只需更新 `_url` 一个信号,派生信号自动响应

### 信号更新流程

```
push(path)
  → onRoute(path, _url())
  → 通过 → history.pushState(null, "", finalPath)
         → _url(finalPath)                // 仅更新源信号
         → current / search 自动派生响应
```

## 六、define 的设计动机

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

## 七、命名决策

| 旧命名              | 新命名        | 理由                                                        |
| ------------------- | ------------- | ----------------------------------------------------------- |
| `navigate`          | `push`        | 直接对应 `history.pushState`,为未来 `replace`/`back` 留空间 |
| `currentPath`       | `current`     | 简化;在路由上下文中无歧义                                   |
| `currentParams`     | `search`      | 直接对应 `location.search`,避免"路径参数还是查询参数"的歧义 |
| `RouterView` 组件   | `define` 工厂 | 集中定义路由树;返回组件而非 JSX 元素                        |
| `onEnter`/`onLeave` | `onRoute`     | 单一钩子处理所有场景,避免镜像冗余                           |

## 八、取消的 API

以下项目**不提供**,理由如下:

| 项目                          | 理由                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `RouterView` 组件导出         | 被 `define` 完全取代,减少 API 表面                          |
| `onLeave`                     | 与 `onRoute(to, from)` 信息对称,冗余                        |
| `isNavigating` 信号           | onRoute 内部用户可自管 loading;典型场景(鉴权)不需要 UI 反馈 |
| loading 状态                  | 属于渲染层,由未来的 Suspense 机制统一处理,不在 router 层    |
| 重定向次数兜底                | 用户自负,符合 kiaao 控制权交给用户的哲学                    |
| 动态参数 `:param`             | 保持路由匹配为纯字符串比较,无解析开销;用 query string 传值  |
| `current` / `search` 的可写性 | 派生实现只读,避免绕过 onRoute 的非法导航                    |
| `:param` 守卫                 | 同上                                                        |

## 九、嵌套机制(不变)

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

**注意**:`extractSegment` 接收的是 pathname(不含 search),由 `current` 信号提供。search 部分不参与路由匹配,仅通过 `search` 信号供组件读取。

### 逐层匹配示例

URL = `/dashboard/users?a=1`:

1. **顶层 define**(无 base)
   - `extractSegment("/dashboard/users", undefined)` → `"dashboard"`
   - 匹配 `appRoutes` 中的 `dashboard` → 渲染 `DashboardView`
2. **DashboardView**(base="/dashboard")
   - `extractSegment("/dashboard/users", "/dashboard")` → `"users"`
   - 匹配 `dashboardRoutes` 中的 `users` → 渲染 `Users`

每层只取第一段,下一层用更深的 base 重新看完整路径。父布局天然驻留(因为父层 segment 未变,`<Case>` 不切换)。

## 十、内部实现要点

### 统一源信号 + 派生只读

```ts
function createRouter(options: RouterOptions): Router {
  // 内部可写源信号(完整 URL)
  const _url = use(getPathname() + getSearch());

  // 对外只读派生
  const current = use(_url, () => _url().split("?")[0] || "/");
  const search = use(_url, () => parseSearch(_url().split("?")[1] || ""));

  async function push(path: string): Promise<void> {
    try {
      const result = options.onRoute ? await options.onRoute(path, _url()) : undefined;
      const finalPath = typeof result === "string" ? result : path;
      // finalPath 可能再次触发 onRoute(重定向链),由 push 递归处理
      if (typeof result === "string") {
        return push(finalPath);
      }
      history.pushState(null, "", finalPath);
      _url(finalPath); // 仅更新源信号,current/search 自动派生
    } catch (err) {
      console.error("[kiaao] onRoute error:", err);
      throw err; // 让 await push(...) 感知失败
    }
  }

  // popstate 同步源信号
  window.addEventListener("popstate", () => {
    _url(getPathname() + getSearch());
  });

  // 初始化:首次进入触发 onRoute(initialPath, null)
  // (实现时需处理 from=null 的特殊调用)

  return { current, search, push, define, Link };
}
```

### define 实现

```ts
function define(defOptions: DefineOptions): ComponentFunction {
  const { base, routes, fallback } = defOptions;
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

## 十一、与当前实现的差异

`src/router/index.ts` 需要的改动:

1. `navigate` → `push`,改为 async,集成 `onRoute` 调用 + 重定向链 + 异常处理
2. `currentPath` → `current`(派生只读),`currentParams` → `search`(派生只读)
3. 内部引入统一源信号 `_url`,`current`/`search` 从其派生
4. 新增 `define` 工厂函数(包装现有 RouterView 内部逻辑)
5. 删除 `RouterView` 导出
6. `createRouter` 接收 `onRoute` 选项
7. 初始化时触发 `onRoute(initialPath, null)`
8. `onRoute` 的 `to`/`from` 参数为完整路径(含 search)

测试需同步更新:`tests/router/router.test.ts`、`tests/router/router-extreme.test.ts`。

## 十二、待办

- [ ] 实施 `src/router/index.ts` 重构
- [ ] 更新测试用例
- [ ] 更新 `guide/router.md`(单独任务,反映新 API)
- [ ] 更新 `packages/example` 中的路由使用示例(若有)

## 十三、相关历史文档

以下文档已废弃,保留用于历史追溯:

- [嵌套 RouterView 方案讨论与设计](./嵌套RouterView方案讨论与设计.md) — 旧 RouterView 嵌套设计
- [when 指令扩展与 RouterView 重构方案](./when指令扩展与RouterView重构方案.md) — 旧 RouterView 重构(when 扩展部分仍可参考)
