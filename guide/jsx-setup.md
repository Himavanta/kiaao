# JSX/TSX Setup / 配置 JSX/TSX

kiaao works with standard JSX transformation. No custom compiler or plugin is required. Configure your build tool to use `kiaao` as the JSX import source.

kiaao 使用标准的 JSX 转换，不需要自定义编译器或插件。将构建工具的 JSX import source 配置为 `kiaao` 即可。

## Choosing Your Configuration / 选择配置

First, identify which transform engine your toolchain uses, then follow the corresponding section below.

首先确认你的工具链使用哪个 transform 引擎，然后按对应小节配置。

| Toolchain / 工具链 | Transform Engine / 引擎 | Config / 配置入口                            |
| ------------------ | ----------------------- | -------------------------------------------- |
| Vite (≤7)          | esbuild                 | `vite.config.ts` → `esbuild`                 |
| Vite+ / Rolldown   | oxc                     | `vite.config.ts` → `oxc`（`esbuild` 已废弃） |
| Rspack / Other     | Varies / 各异           | 见各构建工具文档                             |

⚠️ Do not configure both `esbuild.jsx` and `oxc.jsx` at the same time — Rolldown-based toolchains will ignore one and emit a warning.

⚠️ 不要同时配置 `esbuild.jsx` 和 `oxc.jsx`——基于 Rolldown 的工具链会忽略其中一个并发出警告。

---

## TypeScript / TypeScript 配置

Add the following to your `tsconfig.json`. The `jsxImportSource` field tells TypeScript where to look for JSX type definitions and runtime imports.

在 `tsconfig.json` 中添加以下配置。`jsxImportSource` 字段告诉 TypeScript 从哪里查找 JSX 类型定义和运行时导入。

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "kiaao"
  }
}
```

---

## Vite+ / Rolldown (oxc)

Vite+ uses Rolldown with oxc as the compiler. The `esbuild` field is deprecated — configure JSX under `oxc` instead.

Vite+ 使用 Rolldown 配合 oxc 编译器。`esbuild` 字段已废弃——在 `oxc` 下配置 JSX。

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  oxc: {
    jsx: {
      importSource: "kiaao",
    },
  },
});
```

The full `OxcOptions` type is defined in `vite-plus` — see `OxcJSXOptions` for the JSX sub-config.

完整的 `OxcOptions` 类型定义见 `vite-plus`——JSX 子配置参见 `OxcJSXOptions`。

---

## Vite (esbuild)

Vite uses esbuild by default for development and production builds. Configure it in `vite.config.ts`.

Vite 默认使用 esbuild 进行开发和生产构建。在 `vite.config.ts` 中配置。

```ts
import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "kiaao",
  },
});
```

---

## Verify / 验证

After configuration, you can write JSX directly in `.tsx` or `.jsx` files. The following should compile without errors.

配置完成后，即可在 `.tsx` 或 `.jsx` 文件中直接编写 JSX。以下代码应能正常编译。

```tsx
import { use, createApp } from "kiaao";

function App() {
  const count = use(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => count(count() + 1)}>+1</button>
    </div>
  );
}

const app = createApp(App);
app.mount("#app");
```

---

No Babel plugins, no Vite plugins, no custom pragma comments. Just standard JSX transform with `kiaao` as the import source.

无需 Babel 插件、无需 Vite 插件、无需自定义 pragma 注释。只需将 `kiaao` 设为 JSX import source 的标准 JSX 转换。

Now that you have JSX set up, start building components. / 现在你已经配置好 JSX，可以开始构建组件了。

- [Components / 组件](./components.md)
- [Reactivity / 响应式系统](./reactivity.md)
