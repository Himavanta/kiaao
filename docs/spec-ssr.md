# Kiaao SSR 与 Astro 集成规范 v1.4

## 一、目标

为 Kiaao 框架提供 **Astro 第一阶段** 集成支持，仅包含两种模式：

- **纯静态组件**（无 `client:` 指令）：服务端渲染为 HTML 字符串，零 JavaScript 输出。
- **`client:only` 组件**：完全在浏览器端挂载，保留所有响应式交互。

暂不实现客户端水合（hydration），即不支持 `client:load`、`client:idle` 等指令。

## 二、新增内部符号

```ts
export const SSR_COMPONENT = Symbol("kiaao.ssr");
```

控制流组件（`Show`、`List`、`Teleport`、`lazy` 返回的代理组件）通过此符号挂载 SSR 变体。

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

**规则**：文本内容用 `escapeHtml`，属性值用 `escapeAttr`。

## 四、渲染模式

内部状态（`runtime.ts`）使用字符串字面量：

```ts
type RenderMode = "dom" | "ssr" | "hydrate"; // hydrate 预留
let currentRenderMode: RenderMode = "dom";
export function setRenderMode(mode: RenderMode) {
  currentRenderMode = mode;
}
export function getRenderMode(): RenderMode {
  return currentRenderMode;
}
```

## 五、核心 API 在 SSR 中的行为调整

- **`effect`**：SSR 下禁用，直接返回空 `stop` 函数。
- **`derive`**：退化为一次性计算，返回的函数**必须保留 `IS_REACTIVE` 标记**。
- **`onMount` / `onUnmount`**：SSR 中不触发，因为它们仅在 `mount()` 时执行。

## 六、`h()` 的模式分发与 SSR 渲染

所有 SSR 相关代码（`hSSR`、控制流 SSR 变体）均定义在 `dom.ts` 中，与浏览器 `h()` 同文件。`h()` 内部添加极简分支：

```ts
if (getRenderMode() === "ssr") return hSSR(tag, props, children);
```

- `hSSR` 实现字符串拼接（元素模式、组件模式）。`hSSR` 在处理 props 时，对每个属性值先判断是否为响应式函数（`IS_REACTIVE` 标记）。若是，则调用 `value()` 获取当前静态值，再用该值进行 HTML 拼接。事件属性在 SSR 中直接跳过。
- 控制流 SSR 变体通过 `SSR_COMPONENT` 挂载：
  - `Show`、`List`：正常渲染分支/列表。
  - `Teleport`、`lazy`：返回占位注释。

## 七、公开 API：`renderToString`

定义在 `dom.ts`，重导出至 `kiaao/server`：

```ts
export function renderToString(
  component: (props: any) => HTMLElement,
  props?: any,
  options?: { slots?: Record<string, string> },
): string;
```

**行为**：设置 SSR 模式，合并 `slots.default` 为 `props.children`，调用 `h()`，恢复模式，返回字符串。

## 八、Astro 集成 `@kiaao/astro`

### 8.1 集成入口 (`index.ts`)

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

### 8.2 服务端渲染器 (`server.ts`)

严格按照 Astro 的 `SSRLoadedRendererValue` 接口实现，**增加 `metadata` 参数**（当前阶段不使用，但必须接收以保证兼容性）。

```ts
import type { AstroComponentMetadata } from "astro";
import { renderToString } from "kiaao/server";

export default {
  name: "kiaao",
  check(
    Component: unknown,
    props?: any,
    slots?: Record<string, string>,
    metadata?: AstroComponentMetadata,
  ): boolean {
    return typeof Component === "function";
  },
  async renderToStaticMarkup(
    Component: any,
    props: any,
    { default: children, ...slotted }: Record<string, string>,
    metadata?: AstroComponentMetadata,
  ) {
    const slots = { default: children, ...slotted };
    const html = renderToString(Component, props, { slots });
    return { html };
  },
};
```

### 8.3 客户端入口 (`client.ts`)

严格遵循 Astro 客户端入口标准：外层工厂函数接收 `element`，内层异步函数接收 `(Component, props, slots, { client })`。  
同时监听 `astro:unmount` 事件来执行清理（调用 `unmount`）。

```ts
import { h, mount, unmount } from "kiaao";

export default (element: HTMLElement) => {
  return async (
    Component: any,
    props: any,
    slots: Record<string, string>,
    { client }: { client: string },
  ) => {
    // 暂时只完整支持 client:only，其他策略降级警告
    if (client !== "only") {
      console.warn(`[kiaao] Hydration "${client}" not yet supported, falling back to client:only.`);
    }

    // 清空容器（Astro 可能生成静态占位）
    element.innerHTML = "";

    // 合并插槽到 props.children（client:only 下通常为空，但保留未来扩展）
    const mergedProps = { ...props, children: slots.default ?? props.children };

    // 纯客户端挂载
    const el = h(Component, mergedProps);
    mount(el, element);

    // 清理：岛屿卸载时销毁组件
    element.addEventListener(
      "astro:unmount",
      () => {
        unmount(el);
      },
      { once: true },
    );
  };
};
```

## 九、插槽约定

- **默认插槽**：SSR 时通过 `slots.default` 传入 `props.children`（HTML 字符串），`hSSR` 直接嵌入（不二次转义）。
- **`client:only`**：插槽内容通常为空，组件需自行处理缺失 `children` 的情况。

## 十、使用示例

纯静态：`<Counter />`  
完全客户端：`<Counter client:only />`

## 十一、限制与未来计划

- `Teleport`、`lazy` 纯静态下仅输出占位注释，需 `client:only` 获取完整功能。
- 当前不支持水合指令，使用它们会降级为 `client:only` 行为并警告。
- SSR 中不执行生命周期与副作用，`derive` 返回固定值但保留响应式标记。
- 第二阶段将实现水合、支持所有 `client:*` 指令、`lazy` 预加载等。
