# `any` 类型替换计划

> 目标：将 `src/` 中所有 `: any` 替换为精确类型
> 原则：不惧怕类型定义数量，类型系统清晰健壮优先

---

## 分析工具

- LSP `lsp_hover` 确认预期类型
- `lsp_diagnostics` 验证替换后无错误
- `vp check --fix` 最终验证

---

## Phase 1: `owner: any` → `Owner`

**核心类型**：`Owner` 定义在 `src/core/types.ts:100`，不依赖 DOM

| 文件                          | 行                                                                 | 当前 `: any`                           | 替换为            | 影响范围 |
| ----------------------------- | ------------------------------------------------------------------ | -------------------------------------- | ----------------- | -------- |
| `component.ts:44`             | `createContextUse(owner: any)`                                     | `Owner`                                | 内部使用 + 调用方 |
| `component.ts:58`             | `createContext(owner: any): Context`                               | `Owner`                                | 公开 API          |
| `component.ts:88`             | `mergeResults(items: any[], owner: any): Node[]`                   | `(HResult \| Node)[], Owner`           | 内部调用          |
| `component.ts:116`            | `handleAsyncComponent(promise: Promise<any>, owner: any): HResult` | `Promise<HResult \| HResult[]>, Owner` | 仅内部            |
| `component.ts:150`            | `const owner: any = createOwner()`                                 | `Owner`                                | 局部变量          |
| `direct.ts:43`                | `createDirectiveContext(owner: any): DirectiveContext`             | `Owner`                                | 公开 API          |
| `directives.ts:21`            | `appendResult(el, result, owner: any)`                             | `Owner`                                | 内部              |
| `directives.ts:77,90,102,120` | 各种 mode 函数的 `owner: any`                                      | `Owner`                                | 内部              |
| `directives.ts:170`           | `let branchOwner: any`                                             | `Owner \| null`                        | 局部变量          |
| `directives.ts:216`           | `itemOwner: any`                                                   | `Owner`                                | 局部变量          |

**替换后收益**：`Owner` 类型在整个核心层被正确传递，编译时捕获 parent/children/cleanups 等属性误用。

---

## Phase 2: 适配器和 Element 类型

**核心类型**：`RenderAdapter.createElement` 返回 `unknown`（设计如此，不改）

| 文件                | 行                                           | 当前 `: any` | 替换为                   | 说明 |
| ------------------- | -------------------------------------------- | ------------ | ------------------------ | ---- |
| `h.ts:68`           | `const el: any = adapter.createElement(tag)` | `Element`    | DOM 模式下已知是 Element |
| `dom/adapter.ts:95` | `setProp(el: any, ...)`                      | `Element`    | 浏览器层已知是 Element   |
| `dom/props.ts:21`   | `setProp(el: any, ...)`                      | `Element`    | 同上                     |
| `dom/props.ts:60`   | `setProps(el: any, ...)`                     | `Element`    | 同上                     |

> 注意：`core/` 不能依赖 DOM 类型，`el: any` 在 core 层保留。

---

## Phase 3: 信号内部状态类型

**当前问题**：`Signal<T>` 的内部状态（`SignalState<T>`）通过 `(x as any)[REACTIVE]` 访问

| 文件            | 行                                           | 当前 `: any`     | 替换为        |
| --------------- | -------------------------------------------- | ---------------- | ------------- |
| `signal.ts:80`  | `createSignal<T>(fn: Signal<T>, state: any)` | `SignalState<T>` |
| `signal.ts:111` | `func: (v?: any) => T`                       | `(v?: T) => T`   | 参数是 T 类型 |

---

## Phase 4: Props/Children 类型

**定义新类型**：

```ts
// src/core/types.ts 或 src/core/component.ts
type Props = Record<string, any>; // 保持开放，放宽 key
```

| 文件           | 行                                          | 当前 `: any`                  | 替换为 |
| -------------- | ------------------------------------------- | ----------------------------- | ------ |
| `h.ts:27`      | `Fragment(props: { children?: any }): any`  | `{ children?: any }` → 保持   |
| `h.ts:33`      | `handleDomMode(tag, props: any, ...)`       | `Record<string, any> \| null` |
| `h.ts:80`      | `handleDirectiveMode(tag, props: any, ...)` | `Record<string, any>`         |
| `h.ts:117-119` | `h(tag, props?: any, ...)`                  | `Record<string, any> \| null` |

---

## Phase 5: Motion 动画类型

| 文件                           | 行                                                             | 当前 `: any`                  | 替换为 |
| ------------------------------ | -------------------------------------------------------------- | ----------------------------- | ------ |
| `create-group-motion.ts:28-33` | `oldArray: any[], newArray: any[], keyFn: ..., removed: any[]` | `T[]` 泛型                    |
| `create-group-motion.ts:82`    | `keyFn: ((item: any, ...) => any)`                             | `(item: T, ...) => KeyType`   |
| `create-motion.ts:21`          | `newValue: any`                                                | `boolean`（动画信号是布尔值） |
| `create-motion.ts:25`          | `visible: (v: any) => void`                                    | `(v: boolean) => void`        |

---

## Phase 6: 路由和 Astro 集成

| 文件                 | 行                                      | 当前 `: any`                               | 替换为 |
| -------------------- | --------------------------------------- | ------------------------------------------ | ------ |
| `router/index.ts:10` | `RouteComponent = (props?: any) => any` | `(props?: Record<string, any>) => HResult` |
| `router/index.ts:33` | `[key: string]: any`                    | `[key: string]: unknown`                   |

---

## 实施状态

```
Phase 1 (Owner) ✅ → Phase 2 (Element) ✅ → Phase 3 (Signal) ✅
  → Phase 4 (Props) ✅ → Phase 5 (Motion) ⬜ → Phase 6 (Router) ⬜
```

每个 Phase 完成后执行：

1. `vp check --fix src/` 确认零错误
2. `vp test` 确认 171 测试全绿
3. 提交到跟踪文档

---

## 风险

- **`core/` 不能依赖 DOM 类型**：`Owner` 在 `types.ts` 中定义，不含 DOM 依赖，无风险
- **`Signal<T>` 内部状态**：`SignalState<T>` 类型已存在，直接使用
- **`RenderAdapter` 返回 `unknown`**：DOM 层用 `as Element` 转型，core 层保持 `unknown`
