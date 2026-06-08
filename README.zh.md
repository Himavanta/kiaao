[English](README.md) | **中文**

# kiaao

一个纯运行时、零虚拟 DOM 的响应式 UI 框架。不使用 Proxy，不依赖编译器，所有更新都是精确的 DOM 操作。

## 设计原则

kiaao 的设计建立在对主流框架的反思之上。如果你曾因 Vue 的 Proxy 魔法感到不安、因 React 的重复渲染和缓存规则感到疲惫、因 Solid 的编译依赖和割裂原语感到困惑，那么 kiaao 可能是你想要的答案。

- **无虚拟 DOM** — 更新是直接的 `textNode.textContent = newValue` 或属性赋值，不进行树形 Diff 对比。
- **无 Proxy 拦截** — 状态是纯净的普通对象，调试时看到的就是真实值，没有隐藏的响应式外壳。
- **显式选择器响应式** — 开发者通过 `getter(selector)` 明确声明依赖，而非通过 Proxy 陷阱或编译器推断。
- **组件只执行一次** — 没有重复渲染，没有 `useMemo`/`useCallback` 心智负担，只有精确的 DOM 更新。
- **无编译插件依赖** — 纯 `h()` 调用或标准 JSX 转换即可工作，不需要专属编译器。
- **无 Context / provide-inject** — 信号是独立的值容器，可在模块层级创建和共享，无需额外的跨层级通信机制。
- **更新粒度为选择器结果级** — 信号变化仅触发所选值真正发生变化的 effect，不会引发无关组件的重跑。

由于 getter 本身也是一个携带 `IS_REACTIVE` 标记的函数，在 JSX 中 `{count}` 和 `{count(v => v)}` 行为一致——两者都能被框架识别并建立动态绑定，前者订阅整个值的变化，后者通过选择器订阅局部变化。

## 核心概念

kiaao 只有 4 个核心 API，它们构成了整个框架的响应式系统：

- **define** — 创建响应式状态，返回 getter/setter 对
- **derive** — 创建派生状态，带缓存和脏标记，计算结果不变时不通知下游
- **effect** — 执行副作用，自动追踪依赖，返回停止函数
- **h** — 创建真实 DOM 节点，并内置了 `when` 和 `each` 属性指令来处理条件渲染和列表渲染

其他 API 都是基于这 4 个核心构建的组件或工具：

- **Teleport** — 传送门组件
- **onMount / onUnmount** — 生命周期钩子
- **mount / unmount** — 显式挂载与卸载
- **lazy** — 异步组件加载

> **注意**：`when` 和 `each` 指令只能用于原生 HTML 元素（如 `<div>`、`<section>`、`<ul>` 等），不能用于自定义组件。如需在组件中使用，请将指令放在组件内部的根元素上。

## 与其他框架的对比

| 维度            | React    | Vue           | Solid      | kiaao              |
| --------------- | -------- | ------------- | ---------- | ------------------ |
| 数据纯净度      | 纯净     | 不纯净(Proxy) | 纯净(两套) | 纯净(一套)         |
| 组件运行次数    | 每次重跑 | 外壳一次      | 外壳一次   | 外壳一次           |
| 虚拟 DOM        | 有       | 有            | 无         | 无                 |
| 编译器依赖      | 无       | 可选          | 强依赖     | 无                 |
| 响应式原理      | 无(全量) | Proxy         | 编译期展开 | 显式选择器         |
| 控制流方式      | 三元/map | v-if/v-for    | Show/For   | when/each 属性指令 |
| 更新粒度        | 组件级   | 组件/块级     | DOM节点级  | 选择器结果级       |
| Context/Provide | 有       | 有            | 有         | 无(信号即通道)     |

## 安装与 JSX 配置

```bash
npm install kiaao
```

**tsconfig.json：**

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "kiaao"
  }
}
```

**vite.config.ts（使用 oxc 编译器）：**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  oxc: {
    jsx: {
      importSource: "kiaao",
    },
  },
});
```

如果使用 esbuild 作为编译器，则在 `vite.config.ts` 中配置：

```ts
export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "kiaao",
  },
});
```

配置完成后即可直接在 `.tsx` 文件中编写组件，编译后自动转换为 `h()` 调用。如果不想使用 JSX，也可以直接用 `h()` 函数。

## 快速开始

### 创建响应式状态

```tsx
import { define } from "kiaao";

const [count, setCount] = define(0);

console.log(count()); // 0
setCount(42);
console.log(count()); // 42

// 支持函数式更新
setCount((prev) => prev + 1);
```

### 选择器订阅

getter 支持传入选择器函数进行精准订阅。选择器返回的是一个派生函数，仅当所选值变化时才会触发依赖更新。

```tsx
import { define, effect } from "kiaao";

const [user, setUser] = define({ name: "tom", age: 18 });

const name = user((v) => v.name);

effect(() => {
  console.log("name:", name());
});
// 立即输出: name: tom

setUser((prev) => ({ ...prev, age: 19 }));
// age 变化，name 不变，不输出

setUser((prev) => ({ ...prev, name: "jerry" }));
// 输出: name: jerry
```

### 副作用

```tsx
import { define, effect } from "kiaao";

const [count, setCount] = define(0);

const stop = effect(() => {
  console.log("count is", count());
});
// 立即输出: count is 0

setCount(1); // 输出: count is 1
stop();
setCount(2); // 不输出
```

### 派生状态

`derive` 会缓存计算结果，并在上游变化时重新计算。若新结果与缓存相同，则不通知下游，有效避免无效更新。与 `getter(selector)` 返回的普通派生函数（无缓存）不同，`derive` 适合计算昂贵或需要多处复用的场景。

```tsx
import { define, derive, effect } from "kiaao";

const [count, setCount] = define(5);
const double = derive(() => count() * 2);

effect(() => {
  console.log("double:", double());
});
// 立即输出: double: 10

setCount(10); // 输出: double: 20
setCount(10); // 值相同，double 不通知下游，不输出
```

### 组件

组件就是返回 JSX 的函数，只执行一次。状态变化时组件函数不重跑，只有被响应式函数绑定的 DOM 节点原地更新。

```tsx
import { define } from "kiaao";

function Counter() {
  const [count, setCount] = define(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((p) => p + 1)}>+1</button>
    </div>
  );
}

// 使用组件
const el = h(Counter, null);
```

### Props

组件通过参数接收 props，与函数参数完全一致。

```tsx
function Greet(props: { name: string }) {
  return <p>Hello, {props.name}!</p>;
}

const el = h(Greet, { name: "kiaao" });
```

### 动态属性与事件

JSX 中所有属性均支持传入响应式函数进行动态绑定，包括 `class`、`style` 及任意 data 属性。事件使用标准的 `onXxx` 驼峰写法。

```tsx
import { define } from "kiaao";

function App() {
  const [isActive, setActive] = define(false);

  return (
    <div
      class={isActive((v) => (v ? "active" : "inactive"))}
      data-state={isActive}
      onClick={() => setActive((v) => !v)}
    >
      Click to toggle
    </div>
  );
}
```

### 生命周期

组件通过 `onMount` 和 `onUnmount` 注册生命周期回调，需要在组件函数顶层同步调用。组件通过 `mount` 挂载到容器后才触发 `onMount`。

```tsx
import { define, onMount, onUnmount, mount, unmount } from "kiaao";

function Timer() {
  const [time, setTime] = define(new Date());

  onMount(() => console.log("Timer mounted"));

  const timer = setInterval(() => setTime(new Date()), 1000);
  onUnmount(() => clearInterval(timer));

  return <div>{time((v) => v.toLocaleTimeString())}</div>;
}

const root = h(Timer, null);
mount(root, document.body); // 挂载并触发 onMount
// ...
unmount(root); // 卸载并触发 onUnmount，清理所有 effect
```

### 条件渲染与列表渲染

kiaao 通过 `h()` 的原生属性指令 `when` 和 `each` 实现控制流，无需额外的组件。这两个指令只能用于原生 HTML 元素，不能用于自定义组件。

`when` 控制宿主元素内部子节点的显示。当条件为假时，子节点被移除并自动清理。`when` 也支持惰性求值函数，在条件成立时才执行渲染，避免不必要的初始化。

`each` 可遍历多种数据源（数组、对象、Map、Set 等），内部自动为每个条目创建响应式信号。提供 `key` 函数可启用增量 DOM 复用，保留列表项的输入焦点和状态。

```tsx
import { define } from "kiaao";

function App() {
  const [visible, setVisible] = define(true);
  const [items, setItems] = define(["a", "b", "c"]);

  return (
    <div>
      <button onClick={() => setVisible((v) => !v)}>Toggle</button>

      {/* display: contents 可使宿主元素不参与布局，仅作为逻辑容器 */}
      <section when={visible} style="display: contents">
        <span>可见</span>
      </section>

      <ul each={() => items()} key={(item) => item}>
        {(item) => <li>{item}</li>}
      </ul>
    </div>
  );
}
```

### Teleport

将内容渲染到指定 DOM 容器，逻辑上仍属于当前组件树。组件卸载时内容自动从目标容器移除。若目标容器不存在，Teleport 返回一个占位注释节点，内容不会渲染。

```tsx
import { Teleport } from "kiaao";

function Modal() {
  return (
    <Teleport to="#modal-root">
      <div class="modal">传送内容</div>
    </Teleport>
  );
}
```

### 异步组件（lazy）

配合动态导入实现代码拆分。加载中显示占位注释，加载完成后自动替换为真实组件。加载失败时抛出错误，可被上层错误边界捕获。

```tsx
import { lazy } from "kiaao";
const HeavyProfile = lazy(() => import("./HeavyProfile.tsx"));
const el = h(HeavyProfile, { userId: 42 });
```

## 服务端渲染、Astro 集成与路由

详见 [`guide/router-ssr-astro.md`](guide/router-ssr-astro.md)。

- **服务端渲染**：通过 `renderToString` 将组件渲染为 HTML（来自 `kiaao/server`）
- **Astro 集成**：官方 `kiaao/astro` 插件，支持纯静态和 `client:only` 组件
- **路由**：轻量客户端路由 `kiaao/router`，支持嵌套布局

## API 参考

| API            | 用途                                                              |
| -------------- | ----------------------------------------------------------------- |
| define         | 创建响应式状态，返回 [getter, setter]                             |
| derive         | 创建派生状态，带缓存和脏标记，值不变时不通知下游                  |
| effect         | 执行副作用，自动追踪依赖，返回 stop 函数                          |
| h              | 创建真实 DOM 节点，内置 when/each 指令（仅原生元素可用）          |
| Teleport       | 将内容渲染到指定 DOM 容器，保持生命周期；目标不存在时返回占位注释 |
| lazy           | 异步组件加载；失败时抛出错误，可被错误边界捕获                    |
| onMount        | 组件挂载后执行一次                                                |
| onUnmount      | 组件销毁前执行                                                    |
| mount          | 将组件树挂载到容器并触发生命周期                                  |
| unmount        | 卸载组件树并清理所有 effect                                       |
| renderToString | 服务端渲染为 HTML 字符串（详见 `guide/router-ssr-astro.md`）      |
| createRouter   | 客户端路由（详见 `guide/router-ssr-astro.md`）                    |

## 许可证

MIT
