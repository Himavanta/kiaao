# Kiaao SSR 与 Astro 集成规范 v1.1

---

## 一、目标

为 Kiaao 提供 **Astro 第一阶段** 集成支持，涵盖两种模式：

- **纯静态组件**（无 `client:` 指令）：服务端渲染为 HTML 字符串，零 JavaScript 输出。
- **`client:only` 组件**：完全在浏览器端挂载，保留所有响应式交互。

暂不实现客户端水合（hydration）。

---

## 二、新增内部符号

在 `types.ts` 中新增：

```ts
/** 挂载 SSR 变体的唯一键 */
export const SSR_COMPONENT = Symbol("kiaao.ssr");
```

所有 SSR 版本的控制流组件均通过此 Symbol 挂载到原组件函数上。

---

## 三、字符串转义工具

极简实现，零依赖，位于 `src/escape.ts`：

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

内部维护一个渲染模式状态（仅在 `runtime.ts` 中操作）：

```ts
type RenderMode = "dom" | "ssr" | "hydrate"; // 'hydrate' 为预留
let currentRenderMode: RenderMode = "dom";

export function setRenderMode(mode: RenderMode) {
  currentRenderMode = mode;
}
export function getRenderMode(): RenderMode {
  return currentRenderMode;
}
```

模式使用**字符串字面量**，不采用 Symbol，原因：内部状态无冲突风险，且字符串在调试时更直观。

---

## 五、核心 `h()` 与 `hSSR`

所有代码均位于 `src/dom.ts` 同一文件中，避免循环依赖。

### 5.1 `h()` 模式分发

在 `h()` 顶部增加极简分发：

```ts
export function h(tag: any, props?: any, ...children: any[]): any {
  if (getRenderMode() === "ssr") {
    return hSSR(tag, props, children);
  }
  // ... 原有浏览器 DOM 创建逻辑不变
}
```

### 5.2 `hSSR` 内部函数

`hSSR` 为同一文件内的私有函数，专用于服务端字符串拼接。

#### 5.2.1 元素模式

- 拼接 `<tag`，处理 `class`、`style` 及非事件属性（忽略所有 `on` 前缀属性）。
- 递归处理子节点：
  - 响应式函数（`IS_REACTIVE` 标记） → 调用一次取当前值，转字符串。
  - 字符串 / 数字 → `escapeHtml` 后拼接。
  - `null` / `undefined` / `boolean` → 跳过。
  - DOM 节点 → 忽略。
- 拼接 `</tag>`。

#### 5.2.2 组件模式（`tag` 为函数）

1. 检查 `tag[SSR_COMPONENT]`，若存在则直接调用该 SSR 变体。
2. 否则调用 `tag(props)`（组件内部 `h()` 调用自动进入 SSR 分支）。
3. 收集返回结果：若为字符串则直接返回；若为对象（如 `{html}`）则取其 `html` 属性返回。

---

## 六、控制流组件的 SSR 变体

所有 SSR 变体均通过 `SSR_COMPONENT` 挂载到原始组件上，逻辑直接写入 `dom.ts`。

| 组件       | SSR 行为                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------- |
| `Show`     | 判断 `when()`，调用对应分支函数，用 `hSSR` 将结果包裹为 `<div>` 返回（或直接返回片段内容字符串）。 |
| `List`     | 遍历 `each()`，对每个项目调用 `children(item, index)`，拼接所有返回的字符串。                      |
| `Teleport` | 直接返回 `'<!-- teleport placeholder -->'`。                                                       |
| `lazy`     | 在其工厂函数内部为代理组件挂载 `SSR_COMPONENT`，返回 `'<!-- lazy placeholder -->'`。               |

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

// 在 lazy 内部：
LazyComponent[SSR_COMPONENT] = () => "<!-- lazy placeholder -->";
```

---

## 七、公开 API：`renderToString`

`renderToString` 直接在 `dom.ts` 中定义并导出，重新聚合为 `kiaao/server` 的公共入口。

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

## 八、Astro 集成 `@kiaao/astro`

### 8.1 文件结构

```
@kiaao/astro
├── index.ts      # AstroIntegration
├── server.ts     # 服务端渲染器
└── client.ts     # 客户端入口
```

### 8.2 集成入口 (`index.ts`)

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

### 8.3 服务端渲染器 (`server.ts`)

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

### 8.4 客户端入口 (`client.ts`)

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

## 九、插槽约定

- **默认插槽** 通过 `props.children` 传递给组件。
- **SSR 静态组件** 中，`props.children` 是字符串（插槽的 HTML 内容），组件直接渲染即可。
- **`client:only` 组件** 中，`props.children` 为空或 `undefined`（因为未执行服务端渲染），组件需自行处理缺失子内容的情况。

---

## 十、用户使用方式

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

## 十一、限制与未来计划

- **Teleport 和 lazy** 在纯静态模式下仅输出占位注释，需配合 `client:only` 使用才能获得完整功能。
- 当前**不支持**任何带水合指令（`client:load` / `client:idle` / `client:visible` 等）。
- SSR 过程中**不执行**生命周期钩子（`onMount` / `onUnmount`），它们只与 DOM 挂载相关。
- 未来第二阶段将引入水合支持，届时 `hydrate` 模式将被填充，`lazy` 可预加载，插槽行为也会完善。

---

## 十二、总结

本规范以**零依赖、零破坏、最小增量**的方式，将 Kiaao 接入 Astro 生态。所有 SSR 逻辑聚合在 `dom.ts` 单一文件内，通过模式字符串和 `Symbol` 标记实现纯净的环境分支。开发者只需安装 `kiaao` 和 `@kiaao/astro`，即可在 Astro 项目中享受 Kiaao 的高性能响应式组件，无论是极致静态输出还是完全客户端渲染。
