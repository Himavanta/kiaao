# kiaao

一个轻量级响应式前端框架。无虚拟 DOM，不依赖编译器，所有更新都是直接的 DOM 操作。

## 核心概念

kiaao 只有 4 个核心 API：

- **define** — 创建响应式状态
- **derive** — 创建派生状态，带缓存
- **effect** — 执行副作用，自动追踪依赖
- **h** — 创建真实 DOM 节点

其他 API 都是基于这 4 个核心的组件或工具：

- **Show** — 条件渲染
- **List** — 列表渲染
- **onMount / onUnmount** — 生命周期
- **mount / unmount** — 挂载与卸载

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

| API       | 用途                                     |
| --------- | ---------------------------------------- |
| define    | 创建响应式状态，返回 [getter, setter]    |
| derive    | 创建派生状态，带缓存和脏标记             |
| effect    | 执行副作用，自动追踪依赖，返回 stop 函数 |
| h         | 创建真实 DOM 节点或调用组件函数          |
| Show      | 条件渲染，when 支持响应式函数            |
| List      | 列表渲染，基于 key 的节点管理            |
| onMount   | 组件挂载后执行一次                       |
| onUnmount | 组件销毁前执行                           |
| mount     | 将组件树挂载到容器并触发生命周期         |
| unmount   | 卸载组件树并清理所有 effect              |

## 设计原则

- 不引入虚拟 DOM
- 不依赖编译插件
- 不使用 Proxy
- 不提供 Context / provide-inject（信号本身就是共享通道）
- 组件函数只执行一次
- 更新粒度为选择器结果级

## 许可证

MIT
