# TypeScript 陷阱

在 `.tsx` 中写 kiaao 组件时，以下是最容易遇到的编译器/ESLint 错误。它们不是 kiaao 的问题——是 TypeScript 类型系统与 kiaao API 设计的交互结果。

## 不该导入 `use` 时导入了

组件使用 `context.use` 创建信号时，文件顶部如果有 `import { use } from "kiaao"`，会触发两种错误：

**TS2502**（内联类型场景）：如果组件签名写了 `{ use }: { use: typeof use }`，TypeScript 将类型注解里的 `use` 解析为解构参数自身，形成自引用：

```tsx
// ❌ TS2502: 'use' is referenced directly or indirectly in its own type annotation
import { use } from "kiaao";
function Foo(_, { use }: { use: typeof use }) { ... }
```

原因：类型位置的 `typeof use` 指向的是解构参数 `use`（尚未完成类型推导），而非导入的 `use` 函数。

**noUnusedLocals**（常见场景）：解构出的 `use` 遮蔽了导入的 `use`，导入的那个 `use` 被 TS/ESLint 标记为未使用：

```tsx
// ❌ 'use' is declared but its value is never read
import { use } from "kiaao";

function Counter(_, { use }: Context) {
  const count = use(0); // 用的是 context.use，不是导入的 use
}
```

**解决**：两种错误根因相同——导入了不需要的 `use`。只导入实际需要的东西：

```tsx
// ✅ 仅用 context.use
import type { Context } from "kiaao";
function Counter(_, { use }: Context) { ... }

// ✅ 同时需要模块级信号和 context.use
import { use, type Context } from "kiaao";
const globalCount = use(0);
function Counter(_, { use }: Context) { ... }
```
