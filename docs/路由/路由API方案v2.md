# 路由 API 方案 v2

**状态**:探索中,逐步完善
**日期**:2026-07-23
**取代**:[路由 API 方案](./路由API方案.md)(已过期)
**相关**:[动态路由方案](./动态路由方案.md)

## 一、背景与动机

### v1 方案的问题

[路由 API 方案 v1](./路由API方案.md) 采用 `define` + `base` 字符串的模式:

```ts
const AppView = define({ routes: [...] });
const DashboardView = define({ base: "/dashboard", routes: [...] });
const UsersView = define({ base: "/dashboard/users", routes: [...] });
```

存在三个核心问题:

1. **路由树拓扑隐式**:父子关系靠 `base` 字符串前缀推断,集中定义后仍需阅读字符串判断层级
2. **base 字符串无类型安全**:拼写错误(`/dashoard`)运行时才暴露,编译期无法检测
3. **动态路由数据流分散**:嵌套动态路由时需多个独立信号,与服务端菜单树结构不匹配

### v2 的核心洞察

通过 `""` 键作为"一定渲染的 layout/索引页",统一了布局组件与索引页概念,让**树形定义**与**段匹配 O(1)** 兼得:

- 路由用嵌套对象定义,拓扑显式
- 每层 RouterView 仍用 `extractSegment` 取一段,匹配是 O(1) 查表
- `""` 一定渲染,RouterView 只匹配非 `""` 的子路由
- 函数与目录等效(`fn` 等同于 `{"": fn}`),消除叶子/目录区分
- **只有 `""` 键对应的组件收到 `props.RouterView`**,叶子组件不收到

## 二、路由定义

### 基本结构

```ts
const routes = {
  "": RootLayout, // 根 layout/索引页,一定渲染
  demo: {
    "": DemoLayout, // /demo 的 layout/索引页
    hello: HelloComp, // /demo/hello(叶子)
    world: {
      // /demo/world(目录)
      "": WorldLayout,
      say: SayComp, // /demo/world/say
    },
  },
};
```

### 核心规则

1. **每个目录对象的 `""` 键是 layout,一定渲染**
2. **RouterView 只匹配非 `""` 的子路由**
3. **值是函数 → 叶子组件**(自动包装为 `{"": fn}`)
4. **值是对象 → 子目录**(渲染其 `""`,递归)
5. **`""` 既是 layout 也是索引页**:URL `/demo` 时 DemoLayout 渲染,内部 RouterView 无匹配(空渲染或 children fallback),DemoLayout 本身就是索引页内容
6. **只有 `""` 键对应的组件收到 `props.RouterView`**:叶子组件(函数)不收到 RouterView,它是末端展示组件,没有子路由出口

### 等效简写

```ts
// 以下两种写法等效
demo: () => <div>demoLayout</div>
demo: { "": () => <div>demoLayout</div> }
```

函数自动包装为 `{ "": fn }`。叶子是目录的退化形式。

## 三、RouterView 与 RouteGroup 机制

### 核心设计:交替嵌套

RouterView 和 RouteGroup 交替嵌套,逐层深入,**不做一次性递归处理整个路由树**:

- **RouteGroup**:接收路由对象和 base,渲染 `""`(layout),把去掉 `""` 的 others 传给 RouterView
- **RouterView**:接收 others 和 base,用 Case 做段匹配,预处理 others(函数不动,对象替换为 RouteGroup 包装)

### 工厂函数伪代码

```ts
function createRouterGroup({ routes, base, current }) {
  const { "": index, ...others } = routes;
  const RouterView = createRouterView({ base, others, current });
  return () => (index ? h(index, { RouterView }) : null);
}

function createRouterView({ base, others, current }) {
  // 预处理 others:函数不动,对象替换为 RouteGroup 组件
  for (const key in others) {
    if (!isFunction(others[key])) {
      others[key] = createRouterGroup({
        base: [base, key].join("/"),
        routes: others[key],
        current,
      });
    }
  }

  return ({ children: fallback }) => {
    const segment = use(current, () => extractSegment(current(), base));
    return h(Case, { value: segment }, others, fallback);
  };
}
```

### 关键决策

1. **只有 `""` 键对应的组件收到 RouterView**:RouteGroup 渲染 `""` 时传 `props.RouterView`,Case 渲染叶子(函数)时不传
2. **预处理直接修改原对象**:`others[key] = createRouterGroup(...)` 直接修改,不做不可变处理
3. **惰性求值**:RouteGroup 只在被匹配时才创建,不提前处理整棵树
4. **base 累加**:`[base, key].join("/")`,如 base="" + key="demo" → "/demo"
5. **children fallback**:RouterView 的 children 第一个元素作为 Case 的 fallback

### 运行流程(URL = /demo/hello)

**顶层**:

```ts
const routes = {
  "": RootLayout,
  demo: {
    "": DemoLayout,
    hello: HelloComp,
  },
};

// createRouter 返回的 RouteGroup
const RouteGroup = createRouterGroup({ routes, base: "", current });
// RouteGroup 拆分 "" 和 others,渲染 "",传 RouterView
```

**App 渲染 `<RouteGroup />`**:

- RouteGroup 拆分:`""` = RootLayout,others = `{demo: {...}}`
- 创建 RouterView(others, base="")
- 渲染 RootLayout,传 `props.RouterView`

**RootLayout 内部 `<RouterView />`**:

- 预处理:demo 是对象 → 替换为 RouteGroup
- segment = extractSegment("/demo/hello", "") = "demo"
- Case 匹配 "demo" → 渲染 RouteGroup

**RouteGroup(demo, base="/demo")**:

- 拆分:`""` = DemoLayout,others = `{ hello: HelloComp }`
- 创建 RouterView(others, base="/demo")
- 渲染 DemoLayout,传 `props.RouterView`

**DemoLayout 内部 `<RouterView />`**:

- 预处理:hello 是函数,不动
- segment = extractSegment("/demo/hello", "/demo") = "hello"
- Case 匹配 "hello" → 渲染 HelloComp(函数,不传 RouterView)

### segment 为空时的处理

- `extractSegment("/demo", "/demo")` 返回 `""`
- RouterView 的 others 中无 `""` 键(已被 RouteGroup 拆分)
- → Case 无匹配 → 走 fallback(children 函数)

### 局部 fallback

RouterView 接受 children 作为无匹配时的 fallback,**children 第一个元素是函数**:

```tsx
function DemoLayout({ RouterView }) {
  return (
    <div>
      <h1>Demo Section</h1>
      <RouterView>{() => <p>这是 demo 索引页内容(/demo 直接访问时)</p>}</RouterView>
    </div>
  );
}
```

URL `/demo` → DemoLayout 渲染,内部 RouterView 无匹配 → 调用 children 函数显示 fallback。
URL `/demo/hello` → DemoLayout 渲染,内部 RouterView 匹配 hello → 显示 HelloComp。

**每层 RouterView 处理自己的 fallback**。createRouter 不接受 fallback 参数,fallback 在 RouterView 调用处通过 children 传入。

## 四、运行示例

### URL = `/`(根)

- 顶层 RouteGroup(routes, base=""):
  - 拆分:`""` = RootLayout,others = `{demo: {...}}`
  - 创建 RouterView(others, base="")
  - 渲染 RootLayout,传 `props.RouterView`
- RootLayout 内部 `<RouterView />`:segment="" → Case 无匹配 → children/空
- **结果**:RootLayout(就是索引页)

### URL = `/demo`

- 顶层 RouteGroup(routes, base=""):
  - 拆分:`""` = RootLayout,others = `{demo}`
  - 渲染 RootLayout,传 `props.RouterView`(others, base="")
- RootLayout 内部 `<RouterView />`:
  - 预处理:demo 是对象 → 替换为 RouteGroup
  - segment="demo" → Case 匹配 "demo" → 渲染 RouteGroup
- RouteGroup(demo, base="/demo"):
  - 拆分:`""` = DemoLayout,others = `{hello, world}`
  - 渲染 DemoLayout,传 `props.RouterView`(others, base="/demo")
- DemoLayout 内部 `<RouterView />`:segment="" → Case 无匹配 → children/空
- **结果**:RootLayout + DemoLayout(就是 /demo 的索引页)

### URL = `/demo/hello`

- 顶层 RouteGroup → RootLayout + RouterView(others, base="")
- RootLayout 内部 RouterView:segment="demo" → 渲染 RouteGroup(demo, base="/demo")
- RouteGroup(demo) → DemoLayout + RouterView(others={hello, world}, base="/demo")
- DemoLayout 内部 RouterView:segment="hello" → Case 匹配 "hello" → 渲染 HelloComp(函数,不传 RouterView)
- **结果**:RootLayout + DemoLayout + HelloComp

### URL = `/demo/world/say`

- 顶层 RouteGroup → RootLayout + RouterView(others, base="")
- RootLayout 内部 RouterView:segment="demo" → RouteGroup(demo, base="/demo")
- RouteGroup(demo) → DemoLayout + RouterView(others={hello, world}, base="/demo")
- DemoLayout 内部 RouterView:segment="world" → Case 匹配 "world" → `others["world"]` 是对象 → 替换为 RouteGroup(world, base="/demo/world")
- RouteGroup(world) → WorldLayout + RouterView(others={say}, base="/demo/world")
- WorldLayout 内部 RouterView:segment="say" → 渲染 SayComp(函数,不传 RouterView)
- **结果**:RootLayout + DemoLayout + WorldLayout + SayComp

## 五、布局保留

URL 从 `/demo/hello` 切到 `/demo/world`:

- 顶层 RouteGroup:RootLayout 保留(它是 `""`,一定渲染)
- RootLayout 内部 RouterView:segment 仍是 "demo" → RouteGroup(demo) 保留
- RouteGroup(demo):DemoLayout 保留(它是 `""`,一定渲染)
- DemoLayout 内部 RouterView:segment 从 "hello" 变 "world" → Case 切换分支
- **父布局自然保留**(段匹配的优雅保留)

## 六、API 设计

### createRouter

```ts
createRouter(options: {
  routes: RouteMap;                                   // 嵌套对象路由树
  onRoute?: (to: string, from: string | null) =>
    string | void | Promise<string | void>;           // 完整路径含 search
}): {
  RouteGroup: ComponentFunction;    // 顶层 RouteGroup 组件(已绑定 routes 和 base="")
  Link: ComponentFunction;
  push: (path: string) => Promise<void>;
  current: Signal<string>;          // pathname,派生只读
  search: Signal<Record<string, string>>;  // query params,派生只读
};
```

**注意**:

- createRouter 返回的是 **RouteGroup**,不是 RouterView
- createRouter **不接受 fallback 参数**,fallback 在 RouterView 调用处通过 children 传入

### RouteMap 类型

```ts
interface RouteMap {
  "": ComponentFunction; // layout/索引页,必须存在
  [key: string]: ComponentFunction | RouteMap;
}
```

**注意**:TS 无法强制 `""` 必须存在且是函数,运行时需判断 `typeof`。这是动态特性的代价,可接受。

### RouterView 的 props

```ts
interface RouterViewProps {
  children?: [() => any]; // fallback 函数数组,第一个元素作为 Case 的 fallback
}
```

### 使用示例

```tsx
import { createRouter } from "kiaao/router";

const routes = {
  "": RootLayout,
  demo: {
    "": DemoLayout,
    hello: HelloComp,
    world: {
      "": WorldLayout,
      say: SayComp,
    },
  },
};

const { RouteGroup, Link, push, current, search } = createRouter({
  routes,
  onRoute: async (to, from) => {
    if (to.startsWith("/demo") && !(await checkAuth())) {
      return "/login";
    }
  },
});

function App() {
  return <RouteGroup />;
}

function RootLayout({ RouterView }) {
  return (
    <div>
      <nav>
        <Link to="/demo">Demo</Link>
      </nav>
      <RouterView>{() => <p>根索引页内容</p>}</RouterView>
    </div>
  );
}

function DemoLayout({ RouterView }) {
  return (
    <div>
      <h1>Demo</h1>
      <RouterView>{() => <p>demo 索引页</p>}</RouterView>
    </div>
  );
}
```

## 七、与 v1 方案保留的设计

以下设计与 v1 一致,不再重复论证:

| 项                 | 设计                                                             |
| ------------------ | ---------------------------------------------------------------- |
| `push`             | 异步,返回 `Promise<void>`,可 await                               |
| `onRoute`          | `(to, from) => string \| void \| Promise<...>`,完整路径含 search |
| onRoute 返回值     | string=重定向,void=放行,Promise=异步                             |
| 重定向链           | 每次都跑 onRoute,软上限 10 次                                    |
| 首次进入           | `onRoute(initialPath, null)`,用 `replaceState`                   |
| popstate           | 走 onRoute 流程,重定向用 `replaceState`                          |
| 异常处理           | `console.error` + 取消导航,Promise reject                        |
| `current`/`search` | 派生只读,内部 `_url` 源信号派生                                  |
| Link 内部          | `push(...).catch(() => {})`                                      |
| 并发 push          | 不处理竞态,文档说明                                              |

## 八、动态路由(初步)

### 单信号整体替换

routes 是单一对象,可用信号包装:

```ts
const routes = use({});
fetch("/api/menus").then((m) => routes(menusToRoutes(m)));
const { RouteGroup } = createRouter({ routes });
```

routes 变化时,整棵树替换。顶层 RouteGroup 用 [动态路由方案](./动态路由方案.md) 中的方案 G(bool 翻转 + Show)触发重建。

### 整体重建的代价

- 场景 A(初始化):可接受(routes 从空到填充,本来无状态)
- 场景 B(运行时变更):子层状态丢失,需用户用信号持久化

### 服务端菜单树适配

服务端返回的嵌套菜单树天然匹配 RouteMap 结构:

```ts
// 服务端返回
[{ path: "demo", component: "DemoLayout", children: [{ path: "hello", component: "HelloComp" }] }];

// 前端映射
function menusToRoutes(menus): RouteMap {
  const map: any = {};
  for (const m of menus) {
    map[m.path] = m.children
      ? { "": componentMap[m.component], ...menusToRoutes(m.children) }
      : componentMap[m.component];
  }
  return map;
}
```

## 九、RouterView 的 props 注入机制(已定案)

### 决策:props 直接传 `RouterView`

**只有 `""` 键对应的组件(layout)收到 `props.RouterView`**,叶子组件不收到。

```ts
// RouteGroup 内部
const RouterView = createRouterView({ base, others, current });
return () => (index ? h(index, { RouterView }) : null);
```

```tsx
// layout 组件使用
function DemoLayout({ RouterView }: { RouterView: ComponentFunction }) {
  return (
    <div>
      <h1>Demo</h1>
      <RouterView />
    </div>
  );
}
```

### 决策理由

1. **显式 > 隐式**:kiaao 哲学强调显式声明。props 直接传,用户一眼看到 `function DemoLayout({ RouterView })`,知道这是收到的子 RouterView
2. **简单**:不需要 Context 机制(虽然 kiaao 有 createContext,但路由层用 props 足够)
3. **类型友好**:`Props = { RouterView: ComponentFunction }`,类型清晰
4. **约定命名**:框架约定 `RouterView` 作为 props key,用户必须用这个名字。与 `children` 等约定类似,可接受
5. **只有 layout 需要 RouterView**:叶子组件是末端展示,没有子路由出口,不需要 RouterView

### 不暴露 base/routes 给 layout

layout 只需要 RouterView,不需要知道 base/routes(那是内部绑定信息)。如果 layout 真要读当前路径,用 `current`/`search` 信号即可。

### children 方案的探索与否定

曾考虑用 children 传递 RouterView,以支持"组件角色可切换"(同一组件既作普通组件又作路由 layout):

```tsx
// children 方案:组件内部用 <Children /> 渲染
function Demo({ children: Children }) {
  return (
    <div>
      <h1>Demo</h1>
      <Children />
    </div>
  );
}

// 场景 1:普通组件
<Demo>
  <SomeContent />
</Demo>;

// 场景 2:路由 layout(框架把 RouterView 作为 children 注入)
routes[""] = Demo;
```

**动机**:组件代码不改,角色切换由使用方式决定,提升复用性。

**最终否定,理由**:

1. **children 语义冲突**:kiaao 的 children 通常是 VNode(已渲染节点),此方案要求 children 是 ComponentFunction。用户写 `<Demo><SomeContent /></Demo>` 时,`<SomeContent />` 是 VNode,但 Demo 内部 `<Children />` 会把 VNode 当组件渲染——类型不匹配,行为错误。用户必须改写为 `<Demo>{SomeContent}</Demo>` 或 `<Demo>{() => <SomeContent />}</Demo>`,改变了 kiaao 的 children 使用习惯。

2. **与 kiaao 其他组件语义不一致**:`<Show>`/`<Each>` 的 children 都是 VNode,若 layout 的 children 是 ComponentFunction,用户需记忆"不同组件 children 语义不同",增加心智负担。

3. **fallback 表达混乱**:RouterView 自己的 children 是 fallback(VNode),layout 的 children 又是 ComponentFunction(框架注入的 RouterView),两层 children 语义不同,容易混淆。

4. **JSX 用法不自然**:`{children()}` 比 `<RouterView />` 难写难读,用户可能写成 `{children}`(忘记调用),得到函数本身而非渲染结果,调试困难。

5. **无实质优势**:children 方案的灵活性(函数可传参)在路由场景用不上——RouterView 不需要传参。复用场景虽有价值,但 props.RouterView 也能实现(默认值处理),且语义更清晰。

**结论**:坚持 props.RouterView,与 kiaao 整体语义一致。

## 十、匹配机制:与当前方案的一致性与变动

### 10.1 当前方案的匹配机制(回顾)

```
当前 RouterView(props):
  1. myBase = props.base                    // 用户传的字符串
  2. myRoutes = props.routes                // 用户传的 Route[]
  3. segment = use(currentPath, () => extractSegment(currentPath(), myBase))
  4. routeMap = Object.fromEntries(routes.map(r => [r.path, () => h(r.component)]))
  5. return h(Case, { value: segment }, routeMap, fallback)
```

关键:

- `extractSegment` 算 segment
- `routeMap` 是 `{ [path]: ComponentFunction }`,从 Route[] 转换
- `<Case>` 用 segment 作为 key,在 routeMap 查表
- 匹配 = `routeMap[segment]`

### 10.2 一致的部分(核心匹配算法不变)

| 项                    | 当前                                          | 新方案                        |
| --------------------- | --------------------------------------------- | ----------------------------- |
| `extractSegment` 逻辑 | startsWith + 边界检查 + slice + split         | **完全相同**                  |
| segment 派生          | `use(currentPath, () => extractSegment(...))` | **完全相同**                  |
| 匹配的 key            | segment                                       | segment                       |
| 查表方式              | `routeMap[segment]`(对象查 key)               | `routes[segment]`(对象查 key) |
| 布局保留机制          | segment 不变 → Case 不切换                    | segment 不变 → 不重渲染       |

**核心匹配算法(extractSegment + segment 查表)完全一致**。v2 没有破坏当前方案最优雅的部分。

### 10.3 变动的部分

#### 变动 1:routes 的数据结构

```ts
// 当前:Route[] 数组
const routes = [
  { path: "", component: Home },
  { path: "demo", component: Demo },
];

// 新方案:RouteMap 对象
const routes = {
  "": Home,
  demo: Demo,
};
```

影响:

- 当前需要 `Object.fromEntries(routes.map(...))` 把 Route[] 转 routeMap
- 新方案 routes 本身就是对象,**省去转换步骤**,直接 `routes[segment]`

**这其实是简化**。

#### 变动 2:layout(`""` 键)的语义

当前方案:

- `""` 是 Route[] 中的一个普通 path(如 `{ path: "", component: Home }`)
- `<Case>` 匹配 segment="" 时渲染 Home
- Home 是"索引页",不是"layout"——没有子 RouterView 的概念

新方案:

- `""` 是 layout,**一定渲染**
- RouteGroup 拆分 `""` 和 others,`""` 单独渲染作为 layout
- `""` 收到 `props.RouterView`(绑定 others 的子 RouterView)

**这是最大的语义变动**。`""` 从"被 segment 匹配的索引页"变为"一定渲染的 layout 壳"。

#### 变动 3:RouterView 与 RouteGroup 的职责分离

当前方案 RouterView:

- 算 segment
- 查 routeMap
- 渲染匹配的组件(通过 `<Case>`)
- **不管 layout 概念**——layout 是用户自己在组件里嵌套 `<RouterView>` 实现的

新方案:

- **RouteGroup**:拆分 `""` 和 others,渲染 `""` 作为 layout,创建 RouterView 传给 layout
- **RouterView**:用 Case 匹配 others,预处理(函数不动,对象替换为 RouteGroup)

**职责分离**:RouteGroup 管 layout,RouterView 管匹配。交替嵌套,惰性求值。

#### 变动 4:嵌套的实现方式

当前方案:

- 用户在组件内手动写 `<RouterView base="/demo" routes={demoRoutes} />`
- 每层 RouterView 独立,base 由用户传

新方案:

- 框架自动创建 RouteGroup 和 RouterView,base 自动累加
- 用户在 layout 内部写 `<RouterView />`(已绑定,无需传 base/routes)

**自动化程度提升**,用户代码更简洁。

#### 变动 5:与 `<Case>` 的关系

当前方案:

- RouterView 内部用 `<Case>`:`return h(Case, { value: segment }, routeMap, fallback)`
- `<Case>` 负责 key 比较与分支切换

新方案:

- RouterView **仍用 `<Case>`**,但只用于 others 的段匹配
- `""` 不参与 Case,由 RouteGroup 单独渲染
- RouterView 预处理 others:函数不动,对象替换为 RouteGroup 包装

**`<Case>` 的角色变化**:从"RouterView 的全部匹配逻辑"变为"others 的段匹配工具"。`""` 的处理在 RouteGroup。

### 10.4 变动的代价与收益

**代价**:

1. **实现复杂度上升**:引入 RouteGroup 和 RouterView 两个工厂函数
2. **`<Case>` 的角色缩小**:只用于 others 匹配,`""` 处理在 RouteGroup
3. **预处理修改原对象**:`others[key] = createRouterGroup(...)` 直接修改,不做不可变处理

**收益**:

1. **路由定义统一**:RouteMap 对象,拓扑显式
2. **layout 内建**:RouteGroup 自动渲染 `""` 作为 layout
3. **base/routes 自动绑定**:用户零配置
4. **省去 Route[] → routeMap 转换**
5. **惰性求值**:只在匹配路径上创建 RouteGroup,不一次性递归整棵树
6. **交替嵌套清晰**:RouteGroup(layout)→ RouterView(匹配)→ RouteGroup(layout)→ ...

### 10.5 关键结论

- **匹配算法核心(extractSegment + segment 查表)完全一致**,v2 保留了当前方案最优雅的部分
- **变动集中在 layout 概念和职责分离**,不影响匹配效率
- **`<Case>` 仍被使用**,但只用于 others 的段匹配,`""` 处理在 RouteGroup
- **交替嵌套 + 惰性求值**是核心优势,避免一次性递归整棵树

## 十一、待完善的问题

### 1. RouterView 与 RouteGroup 的实现细节

- 预处理修改原对象的副作用(是否可接受)
- base 累加规则(`[base, key].join("/")`)
- children fallback 的传递路径(children 第一个元素)
- 顶层 RouteGroup 的绑定(createRouter 返回的 RouteGroup 已绑定 routes 和 base="")

### 2. 类型安全

- RouteMap 类型如何表达"`""` 必须存在且是函数"
- 是否提供工具函数 `defineRoutes()` 做运行时校验
- 嵌套对象的递归类型定义
- layout 组件的 props 类型(`RouterView: ComponentFunction`)

### 3. 动态路由的整体重建

- 方案 G 的 bool 翻转如何集成到 RouteGroup/RouterView
- 嵌套动态路由(每层独立信号)是否支持
- 与 [动态路由方案](./动态路由方案.md) 的关系

### 4. URL 路径与查询的处理（已决策）

**4.1 末尾斜杠：保留字面值**

- `push("/foo")` 与 `push("/foo/")` 都按字面值写入 `history.pushState`；
- `extractSegment` 对两者返回相同 segment（匹配结果一致）；
- 浏览器历史记录与 `location.pathname` 按用户原样保留；
- 框架不做隐式规范化或重定向。

依据：

- kiaao 不提供隐藏的智能默认行为；
- 尾斜杠规范化如需提供，应作为独立 option（如 `trailingSlash: "strip" | "preserve"`），但 v2 不预留该 API；
- `route.path` 不允许包含 `/`，单段定义隐含了 `""` layout 与 leaf 的明确区别，与尾斜杠无关。

**4.2 查询字符串**

- v2 暴露两个对外信号：`current` 与 `search`；
- `current` 为 `location.pathname`（不含 `?` 与 `#`）；
- `search` 为 `parseSearch(location.search)` 结果；
- 两者均由框架内部源信号派生，对外为逻辑只读信号（派生 + 忽略 setter 参数）。

**4.3 Hash**

- v2 不解析、不响应 `location.hash` 变化；
- hash 由用户控制，框架不触发 `onRoute`；
- 文档明确说明此限制。

**4.4 URL 编码**

- 框架使用 `location.pathname` 的实际值（已解码）；
- 不做编码/规范化；
- 用户调用 `push("/foo bar")` 后，浏览器实际 URL 为 `/foo%20bar`，`current()` 返回 `/foo bar`；
- 与 `window.location.pathname` 行为一致，避免隐藏转换。

**4.5 大小写敏感**

- v2 字符串匹配（`startsWith`、`includes`、`split`）全部大小写敏感；
- `/Admin` 与 `/admin` 是不同 URL 字符串；
- 不做大小写规范化。

**4.6 `base` 为 `/`**

- `base === "/"` 等价于“不限定 base”，匹配所有路径；
- 与不传 `base` 的行为完全一致；
- 根 `RouteGroup` 的 base 默认就是 `/`，路径拼接结果完整。

### 5. SSR 支持

- 当前不考虑,utils 薄封装便于未来扩展

## 十二、与 v1 的对比

| 维度             | v1(define+base)             | v2(嵌套对象+RouteGroup/RouterView) |
| ---------------- | --------------------------- | ---------------------------------- |
| 拓扑表达         | ✗ base 字符串,隐式          | ✓ 嵌套对象,显式                    |
| 类型安全         | ✓ Route[] 明确              | △ RouteMap 弱                      |
| 段匹配 O(1)      | ✓                           | ✓                                  |
| 索引页           | ✓ path:""                   | ✓ `""` 键                          |
| layout 概念      | ✗ 与普通组件混              | ✓ `""` 统一                        |
| RouterView 注入  | ✗ 用户传 base/routes        | ✓ props 自动绑定(只有 layout)      |
| 局部 fallback    | ✓ RouterView fallback prop  | ✓ RouterView children(函数)        |
| 动态路由单信号   | ✗ 每层独立                  | ✓ 单一对象                         |
| 布局保留         | ✓                           | ✓                                  |
| 实现复杂度       | 低                          | 中                                 |
| 服务端菜单树适配 | △ 需 flatten                | ✓ 天然匹配                         |
| 与 `<Case>` 关系 | RouterView 用 Case 全部匹配 | RouterView 用 Case 匹配 others     |
| 递归处理         | 一次性                      | 惰性(交替嵌套)                     |

## 十三、待办

- [ ] 完善 RouterView 与 RouteGroup 实现细节（第十一章 #1）
- [ ] 设计 RouteMap 类型与工具函数（第十一章 #2）
- [ ] 验证动态路由方案 G 的集成（第十一章 #3）—— 动态路由本版本不实现
- [x] 决策路径末尾斜杠（第十一章 #4）—— 已决策：保留字面值，不预留 `trailingSlash` API
- [ ] 编写测试用例（覆盖第四章运行示例的所有场景）
- [ ] 更新 `guide/router.md`（单独任务）
- [ ] 更新 `packages/example` 示例

## 十四、相关文档

- [路由 API 方案 v1](./路由API方案.md) — 已过期,被本方案取代
- [动态路由方案](./动态路由方案.md) — 动态路由的独立讨论,本方案第八章初步集成
- [嵌套 RouterView 方案讨论与设计](./嵌套RouterView方案讨论与设计.md) — 历史文档
- [when 指令扩展与 RouterView 重构方案](./when指令扩展与RouterView重构方案.md) — 历史文档
