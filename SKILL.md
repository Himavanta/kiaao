---
name: kiaao
description: Build reactive UIs with the kiaao framework — a pure-runtime, zero-virtual-DOM alternative to Solid, React, and Vue. Use when writing kiaao components, using `use()` to create `Signal<T>` state, using `<Show>`/`<Each>`/`<Case>` control flow, configuring JSX/TSX, working with kiaao lifecycle, router, SSR, motion, or any task mentioning kiaao.
license: MIT
---

# kiaao

kiaao 是一个纯运行时、零虚拟 DOM 的响应式 UI 框架。

## 何时应用此 skill

出现以下任一信号时加载：

- 导入路径含 `kiaao`，或代码使用 `use(`
- 出现 `<Show>` / `<Each>` / `<Case>` 控制流组件
- 涉及 kiaao 内置模块：router / motion / ssr / astro / lynx
- 用户提到 kiaao、Signal、显式响应式

## agent 视角关键提示

**kiaao 与 Solid 表面最像（显式响应式、组件只跑一次、`<Show>`/`<For>` 控制流），但 API 完全相反。** React/Vue/Solid 三种框架的写法都不能直接套用：

### ❌ Solid 思维（API 最像，最容易混淆）

| 错（Solid 写法）                          | 对（kiaao 写法）                             |
| ----------------------------------------- | -------------------------------------------- |
| `const [get, set] = createSignal(0)`      | `const s = use(0)`（单函数读写一体）         |
| `set(x)` 赋值                             | `s(x)` 同一函数读写                          |
| `createEffect(() => ...)` 副作用          | `use(dep, () => ...)` 无返回值派生           |
| `<div>{count()}</div>` 模板调函数         | `<div>{count}</div>` 直接传引用              |
| `<For each={items}>{(item) => ...}</For>` | `<Each items={items}>{(item) => ...}</Each>` |

### ❌ React 思维

| 错（React 写法）               | 对（kiaao 写法）                   |
| ------------------------------ | ---------------------------------- |
| `useState(0)` 返回 `[s, setS]` | `use(0)` 返回单函数                |
| `useEffect(() => ...)` 副作用  | `use(dep, () => ...)` 无返回值派生 |
| `condition && <div>`           | `<Show when={condition}>`          |
| `items.map(renderItem)`        | `<Each items={items}>`             |

**为什么**：kiaao 组件只执行一次。`{cond && ...}` 和 `{items.map(...)}` 只在首次渲染时计算一次，之后**不会响应信号变化**——视图会"卡住"。`<Show>`/`<Each>`/`<Case>` 内部订阅依赖信号，依赖变化时框架精确增删/移动 DOM 节点。

### ❌ Vue 思维

| 错（Vue 写法）                  | 对（kiaao 写法）                   |
| ------------------------------- | ---------------------------------- |
| `const r = ref(0); r.value = 5` | `const s = use(0); s(5)`           |
| `computed(() => ...)`           | `use(dep, () => ...)` 派生         |
| `watch(src, cb)`                | `use(dep, () => ...)` 无返回值派生 |

回答时优先用 kiaao 的术语和机制：

- **Signal<T> 是单函数**：无参读，有参写；不要解构成 `[get, set]` 元组
- **派生信号 setter 触发重算**，不是赋值；新值由 compute 返回值决定
- **组件只执行一次**，不重跑——不要按 React 的 setState→重渲染 思维回答
- **控制流必须用 `<Show>`/`<Each>`/`<Case>`**：组件只执行一次，`{cond && ...}` 和 `{items.map(...)}` 首次渲染后就被冻结，不会响应信号变化
- **没有"副作用"概念**：无返回值派生 = 值为 undefined 的派生信号
- **零虚拟 DOM**：DOM 精确更新，不做 diff/patch
- **没有"只读信号"**：所有信号都可写，"逻辑只读"通过派生包装实现
- **状态值在模板里直接传引用**：`{count}` 而非 `{count()}`

## 详细文档（按需查阅）

**完整示例与配置（首次写 kiaao 代码时必读）：**

- [README — 最小可运行应用、import、mount](README.md)
- [JSX/TSX 配置 — jsxImportSource、tsconfig、构建工具](guide/jsx-setup.md)

**具体 API（按主题）：**

- [响应式系统 — Signal、use()、派生、isUse、toValue、逻辑只读](guide/reactivity.md)
- [组件 — 组件函数、props、children、Owner](guide/components.md)
- [控制流 — Show、Each、Case](guide/control-flow.md)
- [生命周期 — onMount、onUnmount、onUpdate](guide/lifecycle.md)
- [路由 — Router、RouterView、路由匹配](guide/router.md)
- [SSR — 字符串渲染、水合](guide/ssr.md)
- [动效 — 动效指令、from、to、exit](guide/motion.md)
- [指令 — 自定义指令](guide/directives.md)
- [属性处理 — class、style、event、attribute](guide/attributes.md)

**写代码前必读**：直接 `read` README + guide/jsx-setup.md。其他 API 按需查对应 guide。
