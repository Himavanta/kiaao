# Kiaao SSR 与 Astro 集成规范 v1.2

---

## 一、目标

提供 Kiaao 框架在 Astro 中的**第一阶段**支持：

- **纯静态组件**：服务端渲染为 HTML 字符串，零客户端 JavaScript。
- **`client:only` 组件**：完全在浏览器端挂载，保留所有响应式交互。

暂不实现客户端水合（hydration）。

---

## 二、新增内部符号

在 `types.ts` 中新增：

```ts
/** 挂载 SSR 变体的唯一键 */
export const SSR_COMPONENT = Symbol("kiaao.ssr");
```

所有控制流组件的 SSR 版本均通过此 Symbol 挂载到原组件函数上。

---

## 三、字符串转义工具

零依赖，位于 `src/escape.ts`：

```ts
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

---

## 四、渲染模式

内部状态（`runtime.ts`）使用字符串字面量，仅用于框架内部：

```ts
type RenderMode = "dom" | "ssr" | "hydrate"; // 'hydrate' 预留
let currentRenderMode: RenderMode = "dom";

export function setRenderMode(mode: RenderMode) {
  currentRenderMode = mode;
}
export function getRenderMode(): RenderMode {
  return currentRenderMode;
}
```

---

## 五、核心 API 在 SSR 中的行为调整

### 5.1 `effect(fn)`

**SSR 模式下完全禁用**：不执行回调，不注册依赖，直接返回空 `stop` 函数 `() => {}`。避免在开发服务器长时间运行时产生副作用累积。

### 5.2 `derive(computeFn)`

**SSR 模式下退化为一次性计算**：立即调用 `computeFn` 获取初始值，返回一个固定值函数（非响应式）。保证组件在服务端可获取正确的初始数据，但不建立响应式追踪。

### 5.3 `onMount` / `onUnmount`

SSR 过程中不执行生命周期钩子。它们只在 `mount()` 调用时触发，而 SSR 环境下不会调用 `mount`，因此自然安全，无需额外处理。

---

## 六、`h()` 的模式分发与 SSR 渲染

### 6.1 文件组织

所有 SSR 相关的 `hSSR` 函数及控制流 SSR 变体均与浏览器端 `h()` **定义在同一个文件 `dom.ts` 中**。这消除了循环依赖，保持了代码极简。

### 6.2 `h()` 签名保留

`h()` 的公开类型签名保持为返回 `HTMLElement`，内部对 SSR 分支的返回值做 `as any` 转换，不影响用户侧类型安全。

### 6.3 `h()` 内部分发

在 `h()` 顶部增加极简分支：

```ts
export function h(tag: any, props?: any, ...children: any[]): any {
  if (getRenderMode() === "ssr") {
    return hSSR(tag, props, children);
  }
  // ... 原有浏览器 DOM 创建逻辑
}
```

### 6.4 `hSSR` 内部函数

`hSSR` 为同一文件内的私有函数，专用于服务端字符串拼接。

#### 6.4.1 元素模式

- 拼接 `<tag`，处理 `class`、`style` 及非事件属性（忽略所有 `on` 前缀属性）。
- 递归处理子节点：
  - 响应式函数（`IS_REACTIVE` 标记） → 调用一次取其当前值，转义后拼接。
  - 字符串 / 数字 → `escapeHtml` 后拼接。
  - `null` / `undefined` / `boolean` → 跳过。
  - DOM 节点 → 忽略。
- 拼接 `</tag>`。

#### 6.4.2 组件模式（`tag` 为函数）

1. 检查 `tag[SSR_COMPONENT]`，若存在则直接调用该 SSR 变体。
2. 否则调用 `tag(props)`（组件内部 `h()` 调用自动进入 SSR 分支）。
3. 收集返回结果：若为字符串则直接返回；若为对象（如 `{html}`）则取其 `html` 属性返回。

---

## 七、控制流组件的 SSR 变体

所有 SSR 变体均通过 `SSR_COMPONENT` 挂载到原始组件上。

| 组件       | SSR 行为                                                                             |
| ---------- | ------------------------------------------------------------------------------------ |
| `Show`     | 判断 `when()`，调用对应分支函数，用 `hSSR` 包裹为 `<div>` 返回内容。                 |
| `List`     | 遍历 `each()`，对每个项目调用 `children(item, index)`，拼接所有返回的字符串。        |
| `Teleport` | 返回 `'<!-- teleport placeholder -->'`。                                             |
| `lazy`     | 在其工厂函数内部为代理组件挂载 `SSR_COMPONENT`，返回 `'<!-- lazy placeholder -->'`。 |

示例：

```ts
Show[SSR_COMPONENT] = (props: any) => {
  const when = props.when();
  if (when) {
    return props.children ? hSSR("div", null, [props.children()]) : "";
  }
  return props.fallback ? hSSR("div", null, [props.fallback()]) : "";
};

List[SSR_COMPONENT] = (props: any) => {
  const items = props.each();
  let html = "";
  for (let i = 0; i < items.length; i++) {
    html += hSSR(props.children, null, [items[i], i]);
  }
  return html;
};

Teleport[SSR_COMPONENT] = () => "<!-- teleport placeholder -->";

// 在 lazy 工厂内部：
LazyComponent[SSR_COMPONENT] = () => "<!-- lazy placeholder -->";
```

---

## 八、公开 API：`renderToString`

`renderToString` 定义并导出自 `dom.ts`，通过 `kiaao/server` 重导出。

**签名：**

```ts
export function renderToString(
  component: (props: any) => HTMLElement,
  props?: any,
  options?: { slots?: Record<string, string> },
): string;
```

**行为：**

1. 保存当前渲染模式。
2. 设置模式为 `'ssr'`。
3. 合并插槽：若 `options.slots.default` 存在，赋给 `props.children`。
4. 调用 `h(component, mergedProps)`，获取字符串结果。
5. 恢复原始渲染模式。
6. 返回 HTML 字符串。

**重导出入口：**

```ts
// kiaao/server.ts
export { renderToString } from "./src/dom";
```

---

## 九、Astro 集成 `@kiaao/astro`

### 9.1 文件结构

```
@kiaao/astro
├── index.ts      # AstroIntegration
├── server.ts     # 服务端渲染器
└── client.ts     # 客户端入口
```

### 9.2 集成入口 (`index.ts`)

```ts
import type { AstroIntegration } from "astro";

export default function createIntegration(): AstroIntegration {
  return {
    name: "kiaao",
    hooks: {
      "astro:config:setup": ({ addRenderer }) => {
        addRenderer({
          name: "kiaao",
          serverEntrypoint: "@kiaao/astro/server.js",
          clientEntrypoint: "@kiaao/astro/client.js",
        });
      },
    },
  };
}
```

### 9.3 服务端渲染器 (`server.ts`)

```ts
import { renderToString } from "kiaao/server";

export default {
  check(Component: unknown): boolean {
    return typeof Component === "function";
  },
  async renderToStaticMarkup(Component: any, props: any, { slots }: any) {
    const html = renderToString(Component, props, { slots });
    return { html };
  },
};
```

### 9.4 客户端入口 (`client.ts`)

仅处理 `client:only`，使用浏览器原生 API：

```ts
import { h, mount } from "kiaao";

export default async (Component: any, props: any, root: HTMLElement, hydrateType: string) => {
  if (hydrateType === "only") {
    root.innerHTML = ""; // 清空 Astro 占位
    const el = h(Component, props);
    mount(el, root);
  }
  // 其他 hydrateType 暂不处理，留待水合阶段扩展
};
```

---

## 十、插槽约定

- **默认插槽** 通过 `props.children` 传递给组件。
- **SSR 静态组件** 中，`props.children` 是字符串（插槽的 HTML 内容），组件直接将其作为子内容渲染。
- **`client:only` 组件** 中，`props.children` 为空或 `undefined`（因为未执行服务端渲染），组件需自行处理缺失子内容的情况。

---

## 十一、用户使用示例

### 纯静态组件

```tsx
// Counter.tsx
import { define } from "kiaao";

export default function Counter() {
  const [count, setCount] = define(0);
  return (
    <div>
      <p>Count: {count((v) => v)}</p>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
    </div>
  );
}
```

```astro
---
import Counter from '../components/Counter';
---
<Counter /> <!-- 纯静态 HTML，按钮无交互 -->
```

### `client:only` 组件

```astro
<Counter client:only /> <!-- 完全在浏览器端挂载，拥有完整响应式交互 -->
```

---

## 十二、限制与未来计划

- **Teleport 和 lazy** 在纯静态模式下仅输出占位注释，需配合 `client:only` 使用才能获得完整功能。
- 当前**不支持**任何带水合指令（`client:load` / `client:idle` / `client:visible` 等）。
- SSR 过程中**不执行**生命周期钩子，**不运行**副作用（`effect` 被禁用），`derive` 退化为一次性计算。
- 未来第二阶段将引入水合支持，届时 `hydrate` 模式将被填充，`lazy` 可预加载，插槽行为也会完善。

---

## 十三、总结

本规范以**零依赖、零破坏、最小增量**的方式，将 Kiaao 接入 Astro 生态。所有 SSR 逻辑聚合在 `dom.ts` 单一文件内，通过模式字符串和 `Symbol` 标记实现纯净的环境分支。开发者只需安装 `kiaao` 和 `@kiaao/astro`，即可在 Astro 项目中享受 Kiaao 的高性能响应式组件，无论是极致静态输出还是完全客户端渲染。
