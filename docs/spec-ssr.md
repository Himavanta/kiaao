# Kiaao SSR 与 Astro 集成规范 v1.3

---

## 一、目标

为 Kiaao 框架提供 **Astro 第一阶段** 集成支持，仅包含两种模式：

- **纯静态组件**（无 `client:` 指令）：在服务端渲染为 HTML 字符串，输出零 JavaScript。
- **`client:only` 组件**：完全在浏览器端挂载，保留所有响应式交互。

暂不实现客户端水合（hydration），即不支持 `client:load`、`client:idle`、`client:visible`、`client:media` 等指令。

---

## 二、新增内部符号

在 `types.ts` 中新增：

```ts
/** 挂载 SSR 变体的唯一键 */
export const SSR_COMPONENT = Symbol("kiaao.ssr");
```

所有控制流组件（`Show`、`List`、`Teleport`、`lazy` 返回的代理组件）的 SSR 版本，均通过此 Symbol 挂载到原组件函数上。

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

**使用原则**：

- 文本内容（标签之间的子内容）调用 `escapeHtml`。
- 属性值调用 `escapeAttr`。

---

## 四、渲染模式

内部状态（`runtime.ts`）使用字符串字面量，仅用于框架内部分发：

```ts
type RenderMode = "dom" | "ssr" | "hydrate"; // 'hydrate' 为未来预留
let currentRenderMode: RenderMode = "dom";

export function setRenderMode(mode: RenderMode) {
  currentRenderMode = mode;
}
export function getRenderMode(): RenderMode {
  return currentRenderMode;
}
```

**设计决策**：模式使用字符串而非 Symbol，因为它是模块私有变量，不存在外部冲突风险，且调试时字符串更可读。

---

## 五、核心 API 在 SSR 中的行为调整

### 5.1 `effect(fn)`

**SSR 模式下完全禁用**：不执行回调，不注册依赖，直接返回空 `stop` 函数 `() => {}`。  
避免副作用在长时间运行（如开发服务器）中累积。

```ts
export function effect(fn: () => void): () => void {
  if (getRenderMode() === "ssr") {
    return () => {};
  }
  // ... 原有逻辑
}
```

### 5.2 `derive(computeFn)`

**SSR 模式下退化为一次性计算**：立即调用 `computeFn` 获取初始值，返回一个固定值函数（非响应式）。  
保证组件在服务端能获取正确的初始数据，但不建立响应式追踪。

```ts
export function derive<T>(computeFn: () => T): () => T {
  if (getRenderMode() === "ssr") {
    const value = computeFn();
    return () => value;
  }
  // ... 原有逻辑
}
```

### 5.3 `onMount` / `onUnmount`

SSR 过程中不触发生命周期钩子。它们只在 `mount()` 调用时才执行，而 SSR 环境不会调用 `mount`，因此自然安全，无需额外处理。

---

## 六、`h()` 的模式分发与 SSR 渲染

### 6.1 文件组织

所有 SSR 相关的 `hSSR` 内部函数及控制流 SSR 变体，均与浏览器端 `h()` 定义在 **同一个文件 `dom.ts`** 中。这彻底消除了循环依赖，并保持代码极简、内聚。

### 6.2 `h()` 类型签名

`h()` 的公开类型签名保持为返回 `HTMLElement`。内部对 SSR 分支的返回值使用 `as any` 转型，不影响用户侧类型安全。

### 6.3 模式分发入口

在 `h()` 函数顶部增加极简分支：

```ts
export function h(tag: any, props?: any, ...children: any[]): any {
  if (getRenderMode() === "ssr") {
    return hSSR(tag, props, children);
  }
  // ... 原有浏览器 DOM 创建逻辑保持不变
}
```

### 6.4 `hSSR` 内部函数

`hSSR` 为文件内私有函数，专用于服务端字符串拼接。

#### 6.4.1 元素模式（`tag` 为字符串）

- 拼接 `<tag`。
- 处理属性：
  - `class` / `className` → `class` 属性，转义值。
  - `style` → 支持字符串直接使用，或对象形式转换为分号分隔的 CSS 字符串。
  - 忽略所有 `on` 前缀的事件属性。
  - 其余非事件属性直接设置，值转义。
- 拼接 `>`。
- 递归处理 `children`（扁平化后）：
  - 响应式函数（带 `IS_REACTIVE` 标记） → 立即调用一次取其当前值，`escapeHtml` 后拼接。
  - 字符串 / 数字 → `escapeHtml` 后拼接。
  - `null` / `undefined` / `boolean` → 跳过。
  - DOM 节点 → 忽略（理论上 SSR 中不应出现）。
- 拼接 `</tag>`。
- 返回拼接后的字符串。

#### 6.4.2 组件模式（`tag` 为函数）

1. 检查 `tag[SSR_COMPONENT]`，若存在则直接调用该 SSR 变体，返回其字符串。
2. 否则调用 `tag(props)`。此时组件内部任何 `h()` 调用都会进入 SSR 分支，最终返回字符串。
3. 收集返回值：若为字符串则返回；若为对象（如 `{html}`），取其 `html` 属性返回；否则返回空字符串。

---

## 七、控制流组件的 SSR 变体

所有 SSR 变体均通过 `SSR_COMPONENT` 挂载到原始组件上，逻辑直接写入 `dom.ts`。

| 组件       | SSR 行为                                                                                 | 实现要点                         |
| ---------- | ---------------------------------------------------------------------------------------- | -------------------------------- |
| `Show`     | 判断 `when()`，调用对应分支函数，用 `hSSR` 包裹为 `<div>` 返回其内容字符串。             | 若分支函数不存在则返回空字符串。 |
| `List`     | 遍历 `each()`，对每个项目调用 `children(item, index)`，拼接所有返回的字符串。            | 无需额外包裹，直接拼接。         |
| `Teleport` | 返回 `'<!-- teleport placeholder -->'`。                                                 | 服务端无目标容器，不做任何渲染。 |
| `lazy`     | 在工厂函数内部为返回的代理组件挂载 `SSR_COMPONENT`，返回 `'<!-- lazy placeholder -->'`。 | 服务端不进行异步加载。           |

**示例代码**：

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

`renderToString` 直接在 `dom.ts` 中定义并导出，并通过 `kiaao/server` 子路径重新导出为公共入口。

### 8.1 函数签名

```ts
export function renderToString(
  component: (props: any) => HTMLElement,
  props?: any,
  options?: { slots?: Record<string, string> },
): string;
```

### 8.2 行为

1. 保存当前渲染模式。
2. 调用 `setRenderMode('ssr')`。
3. 构建合并后的 `props`：
   - 若 `options.slots.default` 存在，将其作为 `props.children`（覆盖原有 `props.children`）。
   - 具名插槽暂不处理（第一阶段仅支持默认插槽）。
4. 调用 `h(component, mergedProps)`，获取渲染结果（应为字符串）。
5. 调用 `setRenderMode(prevMode)` 恢复原始模式。
6. 返回 HTML 字符串。

### 8.3 重导出入口

```ts
// kiaao/server.ts
export { renderToString } from "./src/dom";
```

终端用户或 `kiaao/astro` 通过 `import { renderToString } from 'kiaao/server'` 使用。

---

## 九、Astro 集成 `kiaao/astro`

### 9.1 文件结构

```
kiaao/astro
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
          serverEntrypoint: "kiaao/astro/server.js",
          clientEntrypoint: "kiaao/astro/client.js",
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

**采用工厂模式**（参考 Astro 渲染器标准），外层接收岛屿根元素，内层返回实际挂载函数。

```ts
import { h, mount } from "kiaao";

export default (rootElement: HTMLElement) => {
  return async (
    Component: any,
    props: any,
    _slots: any,
    { client: hydrateType }: { client: string },
  ) => {
    // 第一阶段仅完整支持 client:only
    if (hydrateType !== "only") {
      console.warn(
        `[kiaao] Hydration "${hydrateType}" is not yet supported. Falling back to client:only behavior.`,
      );
    }

    // 清空 Astro 可能生成的静态占位，并进行纯客户端挂载
    rootElement.innerHTML = "";
    const el = h(Component, props);
    mount(el, rootElement);
  };
};
```

**注意**：当前版本无论何种 `hydrateType`，都执行同样的 `client:only` 降级逻辑（清空容器 + 全量挂载），确保组件能正常工作并给出清晰的控制台警告。

---

## 十、插槽约定

- **默认插槽** 通过 `props.children` 传递给组件。
- **SSR 静态组件** 中，`props.children` 为 HTML 字符串（插槽内容），组件直接将其作为子内容渲染。`hSSR` 不对该字符串再次转义，直接嵌入输出。
- **`client:only` 组件** 中，`props.children` 为空或 `undefined`（因为跳过服务端渲染），组件需自行处理缺失子内容的情况（例如渲染空状态）。

具名插槽暂不在第一阶段支持。

---

## 十一、用户使用示例

### 纯静态组件

```tsx
// components/Counter.tsx
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

- **Teleport 和 lazy** 在纯静态模式下仅输出占位注释（`<!-- teleport placeholder -->` / `<!-- lazy placeholder -->`），需配合 `client:only` 使用以获得完整功能。
- 当前**不支持**任何需要水合的指令（`client:load`、`client:idle`、`client:visible`、`client:media` 等），使用它们将降级为 `client:only` 行为并输出警告。
- SSR 过程中**不执行**生命周期钩子，**不运行**副作用（`effect` 被禁用），`derive` 退化为一次性计算。
- 未来第二阶段将引入客户端水合支持，届时 `hydrate` 模式将被填充，`lazy` 可实现异步预加载，插槽行为也会完善。

---

## 十三、总结

本规范以**零依赖、零破坏、最小增量**的方式，将 Kiaao 接入 Astro 生态。所有 SSR 逻辑聚合在 `dom.ts` 单一文件内，通过模式字符串和 `Symbol` 标记实现纯净的环境分支。开发者只需安装 `kiaao`，即可在 Astro 项目中享受 Kiaao 的高性能响应式组件，无论是极致静态输出还是完全客户端渲染。
