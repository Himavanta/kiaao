# JSX/TSX Setup / 配置 JSX/TSX

kiaao works with standard JSX transformation. No custom compiler or plugin is required. Configure your build tool to use `kiaao` as the JSX import source.

kiaao 使用标准的 JSX 转换，不需要自定义编译器或插件。将构建工具的 JSX import source 配置为 `kiaao` 即可。

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

## Vite (oxc)

If you use oxc as the compiler, configure it with the `oxc` field instead. oxc is used by tools like Rolldown and some newer Vite setups.

如果你使用 oxc 作为编译器，请在 `oxc` 字段中配置。oxc 用于 Rolldown 和一些较新的 Vite 配置。

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
