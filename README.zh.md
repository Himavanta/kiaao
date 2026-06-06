[English](README.md) | **中文**

# kiaao

一个轻量级响应式前端框架。无虚拟 DOM，不依赖编译器，不使用 Proxy，所有更新都是直接的 DOM 操作。

## 核心概念

kiaao 只有 4 个核心 API：

- **define** — 创建响应式状态
- **derive** — 创建派生状态，带缓存
- **effect** — 执行副作用，自动追踪依赖
- **h** — 创建真实 DOM 节点

其他 API 都是基于这 4 个核心的组件或工具：

- **Show** — 条件渲染
- **List** — 列表渲染
- **Teleport** — 将内容渲染到指定 DOM 容器
- **onMount / onUnmount** — 生命周期
- **mount / unmount** — 挂载与卸载
- **lazy** — 异步组件加载

## 快速开始

### 安装

```bash
npm install kiaao
```

### 创建一个响应式状态

```typescript
import { define } from "kiaao";

const [count, setCount] = define(0);

console.log(count()); // 0
setCount(42);
console.log(count()); // 42

// 支持函数式更新
setCount((prev) => prev + 1);
```

### 选择器订阅

getter 支持传入选择器函数进行精准订阅：

```typescript
const [user, setUser] = define({ name: "tom", age: 18 });

// 返回一个响应式函数，只订阅 name 字段
const name = user((v) => v.name);
console.log(name()); // "tom"

setUser((prev) => ({ ...prev, age: 19 }));
console.log(name()); // "tom" — age 变化不会触发 name 更新

setUser((prev) => ({ ...prev, name: "jerry" }));
console.log(name()); // "jerry"
```

### 副作用

```typescript
import { define, effect } from "kiaao";

const [count, setCount] = define(0);

const stop = effect(() => {
  console.log("count is", count());
});
// 立即输出: count is 0

setCount(1);
// 输出: count is 1

// 取消副作用
stop();
setCount(2);
// 不输出
```

### 派生状态

```typescript
import { define, derive } from "kiaao";

const [count, setCount] = define(5);
const double = derive(() => count() * 2);

console.log(double()); // 10

setCount(10);
console.log(double()); // 20
```

### 创建 DOM

```typescript
import { h } from "kiaao";

// 创建元素
const el = h("div", { class: "container" }, h("h1", null, "Hello"), h("p", null, "World"));
// 返回真实 DOM 节点

// 事件绑定
const btn = h(
  "button",
  {
    onClick: () => console.log("clicked"),
  },
  "Click me",
);

// 动态绑定：传入响应式函数，自动更新文本
const [count, setCount] = define(0);
const display = h(
  "p",
  null,
  count((v) => `Count: ${v}`),
);
// 当 count 变化时，p 元素的文本自动更新
```

### 组件

kiaao 的组件就是一个返回 DOM 节点的函数。组件函数只执行一次：

```typescript
import { define, h } from "kiaao";

function Counter() {
  const [count, setCount] = define(0);

  return h(
    "div",
    null,
    h(
      "p",
      null,
      count((v) => `Count: ${v}`),
    ),
    h("button", { onClick: () => setCount((p) => p + 1) }, "+1"),
  );
}

// 使用组件
const el = h(Counter, null);
```

组件通过 `h()` 的组件模式调用。`h()` 接收一个函数作为第一个参数时，会创建组件实例、执行函数、返回生成的 DOM 节点。

### Props

组件通过参数接收 props：

```typescript
function Greet(props: { name: string }) {
  return h("p", null, `Hello, ${props.name}!`);
}

const el = h(Greet, { name: "kiaao" });
```

### 生命周期

```typescript
import { define, h, onMount, onUnmount } from "kiaao";

function Timer() {
  const [time, setTime] = define(new Date());

  const timer = setInterval(() => setTime(new Date()), 1000);
  onUnmount(() => clearInterval(timer));

  return h(
    "div",
    null,
    time((v) => v.toLocaleTimeString()),
  );
}

const root = h(Timer, null);

// 挂载到页面，触发 onMount
mount(root, document.body);

// 卸载，触发 onUnmount 并清理所有 effect
unmount(root);
```

### 条件渲染

```typescript
import { define, h, Show } from "kiaao";

function App() {
  const [visible, setVisible] = define(true);

  return h(
    "div",
    null,
    h("button", { onClick: () => setVisible((v) => !v) }, "Toggle"),
    h(Show, {
      when: visible,
      fallback: () => h("p", null, "Hidden"),
      children: () => h("p", null, "Visible"),
    }),
  );
}
```

`when` 支持响应式函数（直接传入 getter）或普通函数：

```typescript
// 响应式函数
h(Show, { when: visible, children: () => ... })

// 普通函数
h(Show, { when: () => count() > 0, children: () => ... })
```

### 列表渲染

```typescript
import { define, h, List } from "kiaao";

function App() {
  const [items, setItems] = define(["a", "b", "c"]);

  return h(
    "ul",
    null,
    h(List, {
      each: items,
      key: (item: string) => item,
      children: (item: string) => h("li", null, item),
    }),
  );
}
```

### Teleport

将内容渲染到指定的 DOM 容器，逻辑上仍属于当前组件树，生命周期正常触发，卸载时自动清理。

```typescript
import { h, Teleport } from "kiaao";

function Modal() {
  return h("div", { class: "modal" }, "渲染到其他容器的内容");
}

// CSS 选择器指定目标
h(Teleport, {
  to: "#modal-root",
  children: () => h(Modal, null),
});

// 或直接传入 DOM 元素
h(Teleport, {
  to: document.querySelector("#portal")!,
  children: () => h("span", null, "传送内容"),
});
```

### 异步组件（lazy）

配合动态导入实现代码拆分。加载过程中显示空占位，加载完成后自动替换为真实组件。

```typescript
import { lazy } from "kiaao";

const HeavyProfile = lazy(() => import("./HeavyProfile.ts"));

// 像普通组件一样使用
h(HeavyProfile, { userId: 42 });
```

## 路由

kiaao 提供了一个轻量客户端路由，作为独立入口引入。完全基于核心原语（define、h、Show）构建。

```typescript
import { createRouter } from "kiaao/router";

const { RouterView, navigate, Link, currentParams } = createRouter([
  { path: "/", component: Home },
  { path: "/users/:id", component: UserProfile },
]);

function App() {
  return h(
    "div",
    null,
    h("nav", null, h(Link, { to: "/" }, "首页"), h(Link, { to: "/users/1" }, "用户 1")),
    h(RouterView),
  );
}
```

路由参数作为 props 传入匹配的组件，也可通过 `currentParams` 获取：

```typescript
function UserProfile(props: { id: string }) {
  return h("div", null, `用户 ${props.id}`);
}

// 在组件外部
console.log(currentParams()); // { id: "42" }
```

可提供 fallback 组件处理无匹配情况：

```typescript
const { RouterView } = createRouter(routes, { fallback: () => h("div", null, "页面不存在") });
```

## 安装与配置

### npm

```bash
npm install kiaao
```

### JSX / TSX 支持

kiaao 提供了 JSX 运行时，支持自动转换模式。

tsconfig.json:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "kiaao"
  }
}
```

vite.config.ts:

```ts
export default defineConfig({
  oxc: {
    jsx: {
      importSource: "kiaao",
    },
  },
});
```

使用 JSX 编写组件：

```tsx
import { define, mount } from "kiaao";

function App() {
  const [count, setCount] = define(0);

  return (
    <div>
      <p>Count: {count((v) => v)}</p>
      <button onClick={() => setCount((p) => p + 1)}>+1</button>
    </div>
  );
}

mount((<App />) as HTMLElement, document.querySelector("#app")!);
```

## API 参考

| API          | 用途                                     |
| ------------ | ---------------------------------------- |
| define       | 创建响应式状态，返回 [getter, setter]    |
| derive       | 创建派生状态，带缓存和脏标记             |
| effect       | 执行副作用，自动追踪依赖，返回 stop 函数 |
| h            | 创建真实 DOM 节点或调用组件函数          |
| Show         | 条件渲染，when 支持响应式函数            |
| List         | 列表渲染，基于 key 的节点管理            |
| Teleport     | 将内容渲染到指定 DOM 容器                |
| lazy         | 异步组件加载，配合动态导入使用           |
| onMount      | 组件挂载后执行一次                       |
| onUnmount    | 组件销毁前执行                           |
| mount        | 将组件树挂载到容器并触发生命周期         |
| unmount      | 卸载组件树并清理所有 effect              |
| createRouter | 客户端路由（来自 kiaao/router）          |

## 设计原则

- **无虚拟 DOM** — 更新是直接的 `textNode.textContent` 替换，不进行 Diff 比对
- **无编译插件依赖** — 纯 `h()` 调用或标准 JSX 转换即可工作
- **无 Proxy、无 setter、无 getter** — 状态是纯净的普通对象，没有拦截层
- **显式选择器响应式** — 开发者通过 `getter(selector)` 声明依赖，而非通过 Proxy 陷阱推断
- **无 Context / provide-inject** — 信号是值容器，可在任何位置直接 import
- **组件函数只执行一次** — 不重复渲染，只有精确的 DOM 更新
- **更新粒度为选择器结果级** — 信号变化仅触发所选值真正发生变化的 effect

## 许可证

MIT
