# Kiaao 异步状态设计完整文档

**版本**：1.0  
**更新日期**：2026-06-09  
**参与**：框架作者 (himavanta) 与 AI 助手  
**状态**：设计讨论结论，待实现

---

## 1. 背景与动机

Kiaao 是一个纯运行时、无编译器、无 Proxy 的前端 UI 框架，核心 API 包括 `define`（状态）、`effect`（副作用）、`derive`（派生值）和 `h`（渲染）。目前同步响应式系统已稳定。

在真实应用中，异步数据获取是普遍需求。当前用户可用 `define` + `effect` 手动实现，但存在以下痛点：

- **样板代码重复**：每个异步资源都要手动定义 `data`、`loading`、`error` 三个状态。
- **竞态条件**：并发请求时需要自行维护请求 ID 或 AbortController。
- **取消/中止缺失**：组件卸载或依赖变化时无法自动取消请求。
- **派生依赖复杂**：当异步资源依赖其他响应式状态（如 `userId`）时，需要手动监听变化并重新请求。

因此，我们探讨了“将异步状态提升为框架一等公民”的可能性。

---

## 2. 参考外部方案

| 框架/库                | 方式                                                  | 特点                                         |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------- |
| React + TanStack Query | Hook 式 (`useQuery`)                                  | 缓存、重试、窗口焦点刷新，不依赖 Suspense    |
| Vue 3 + VueUse         | `computedAsync` / `useAsyncState`                     | 与响应式系统自动集成，返回 Ref               |
| Svelte 5               | `{#await}` 块 + `async_derived`                       | 编译器内置语法，批处理与异步深度整合         |
| Solid 2.0              | `createAsync`、`createResource`、Suspense、Transition | 异步为一等公民，依赖微任务调度，支持流式 SSR |

**共同趋势**：

- 提供声明式 Suspense/ErrorBoundary 边界。
- 将加载/错误状态的管理与业务逻辑解耦。
- 更确定的调度模型（如 Solid 的微任务批处理）。

**Kiaao 不采纳**：Solid 的复杂调度、Svelte 的编译器魔法、React 的并发模式（均与 Kiaao “无编译器、纯运行时、极简” 哲学冲突）。

---

## 3. 核心问题剖析

### 3.1 Promise 与 Async Iterable

- **Promise**：单次异步结果，最常用。优先支持。
- **Async Iterable**：流式数据（WebSocket、分页），可作为后续扩展。

### 3.2 异步状态的生命周期

- 至少需要：`pending` (loading)、`fulfilled` (data)、`rejected` (error)。
- 还需考虑 **取消/中止**（abort）。注意：
  - 取消的 Promise 会进入 `catch` 分支，但业务上不应视为失败（UI 不显示错误）。
  - 框架应区分“取消错误”与真实错误，通常静默丢弃取消的请求结果。

### 3.3 视图对多状态的支持

- 视图必须处理 `loading`、`error`、`data` 三种情况。
- 可通过条件判断直接展示，或未来通过 Suspense 自动处理 loading。

### 3.4 `define` 与 `derive` 的职责

- `define`：可变同步状态，返回 `[getter, setter]`。
- `derive`：只读派生状态，基于同步计算，内部使用 `effect` 缓存。

**决策**：不扩展 `define` 处理异步，不尝试让 `derive` 智能识别异步（因为可能某次返回 Promise 另一次返回同步值，导致行为不可预测）。保持两者纯粹同步。

---

## 4. 方案演进历程

### 4.1 最初设想：扩展 `derive` 支持异步

让 `derive` 接受 `async (get) => ...`，自动管理 loading/error/refetch，并返回资源 getter + 辅助函数。

**被否决原因**：

- 异步派生与同步派生行为差异大（依赖收集、错误处理、取消）。
- 用户可能误用，导致混乱。
- 实现复杂，且会污染核心响应式系统。

### 4.2 过渡方案：独立模块 `kiaao/async` + 新 API

创建 `createAsyncResource`，要求显式依赖收集（传入 `get` 函数），返回资源对象或 getter。

**赞成点**：

- 零核心改动。
- 概念独立，用户按需导入。
- 可独立迭代，未来若成熟可考虑合并到核心。

**API 形态**：

```ts
const user = createAsyncResource(
  async (get, signal) => {
    const id = get(userId);
    const res = await fetch(`/api/users/${id}`, { signal });
    return res.json();
  },
  { initialValue: null },
);

user(); // data
user.loading(); // boolean
user.error(); // error
user.refetch(); // 重新请求
```

### 4.3 极简起步：先提供 `fromPromise`

鉴于异步复杂性，决定先实现一个最简单的辅助函数 `fromPromise`，解决样板代码问题，暂不处理竞态和取消。

```ts
function fromPromise<T>(promise: Promise<T>) {
  const [data, setData] = define<T | undefined>(undefined);
  const [loading, setLoading] = define(true);
  const [error, setError] = define<any>(null);
  promise
    .then((v) => {
      setData(v);
      setLoading(false);
    })
    .catch((e) => {
      setError(e);
      setLoading(false);
    });
  return { data, loading, error };
}
```

此函数可作为 `kiaao/utils` 的一部分发布，满足 80% 的简单场景。

**未来计划**：根据用户反馈和实际需求，再决定是否实现完整的 `createAsyncResource` 及更高级特性（Suspense、Transition、取消等）。

---

## 5. 最终设计决策

### 5.1 核心原则

- **不修改核心响应式系统**（`define`、`effect`、`derive` 保持现状）。
- **异步能力通过可选模块提供**（`kiaao/async` 或 `kiaao/utils`）。
- **以极简 API 起步**，逐步演进。

### 5.2 阶段性路线

| 阶段 | 功能                                                              | 预计发布时间             |
| ---- | ----------------------------------------------------------------- | ------------------------ |
| 1    | `fromPromise` 工具函数                                            | 立即（随 0.1 版本）      |
| 2    | 完整的 `createAsyncResource`（显式依赖、竞态处理、取消、refetch） | 根据需求反馈，1-2 个月内 |
| 3    | Suspense 与 ErrorBoundary 支持（可选）                            | 未来版本                 |
| 4    | Transition 与优先级调度                                           | 长期                     |

### 5.3 API 细节（阶段 2 草案）

```ts
// kiaao/async
export function createAsyncResource<T, Deps extends any[]>(
  fetcher: (get: Getter, signal: AbortSignal) => Promise<T>,
  options?: {
    initialValue?: T;
    onError?: (err: unknown) => void;
  },
): AsyncResource<T>;

export interface AsyncResource<T> {
  (): T | undefined;
  loading: () => boolean;
  error: () => unknown;
  refetch: () => void;
}

// 辅助函数（可选，便于解构重命名）
export const getData = (res: AsyncResource<any>) => res();
export const isLoading = (res: AsyncResource<any>) => res.loading();
export const getError = (res: AsyncResource<any>) => res.error();
export const refetch = (res: AsyncResource<any>) => res.refetch();
```

**依赖收集**：必须在 fetcher 的第一个同步阶段调用 `get()` 声明依赖。框架会在依赖变化时自动重新执行 fetcher。

**竞态处理**：内部使用 AbortController 或请求 token，每次新请求前取消旧请求，并忽略旧请求的结果。

**取消行为**：取消的 Promise 会触发 `catch`，但框架会检查是否是取消错误，若是则静默处理（不更新 error 状态，不触发 onError）。

---

## 6. 常见问题与解答

### Q1: 为什么不直接在 `derive` 中支持异步？

A: 为了保持核心简单且行为可预测。异步派生需要显式的依赖收集、额外的状态管理、取消机制，与同步 `derive` 语义差异大。独立模块更清晰。

### Q2: 如果用户误在 `derive` 中返回 Promise 会怎样？

A: 运行时可以检测并输出警告，但不改变 `derive` 行为（它会将 Promise 实例当作普通值缓存，不会解析）。用户应改用 `createAsyncResource`。

### Q3: 如何在服务端渲染（SSR）中使用异步资源？

A: 阶段 2 的 `createAsyncResource` 应提供 `preload` 方法或与 SSR 集成，允许在服务端等待所有资源 resolve 后再渲染。详细设计待后续讨论。

### Q4: 为何先不实现 Suspense？

A: Suspense 需要渲染器支持“暂停-恢复”机制，并涉及组件树的修改，实现复杂度较高。可以在未来根据实际需求添加，而不是作为初始实现。

---

## 7. 行动项与里程碑

- [x] 完成设计讨论与文档整理
- [ ] 实现 `fromPromise` 并发布 0.1 版
- [ ] 收集用户反馈，评估是否需要 `createAsyncResource`
- [ ] 若需要，实现 `createAsyncResource` (带依赖追踪、竞态、取消)
- [ ] 撰写异步最佳实践指南（包含手动处理竞态、取消等示例）
- [ ] （可选）探索 Suspense 与 ErrorBoundary 集成

---

## 8. 讨论中的衍生思考记录

- **关于中止 Promise 的处理**：中止会进入 catch，但框架应通过错误类型（`AbortError`）识别并忽略，不暴露给用户 error 状态。
- **关于依赖收集**：异步函数中自动依赖追踪困难，因此强制显式 `get()` 是最清晰的方式。
- **关于 API 返回值形态**：为了与 `define` 保持一致，资源返回 getter 函数 + 附加属性（`.loading` 等）是合理的，不引入歧义；但为明确区分，也可提供辅助函数。
- **关于与 Solid 2.0 的对比**：Solid 的异步深度整合了调度器，Kiaao 不需要复制其复杂度，只需解决用户最痛的点即可。

---

## 9. 总结

Kiaao 的异步状态支持将遵循 **“最小可行、逐步增强”** 的策略。首先提供 `fromPromise` 解决样板代码问题，再根据用户需求决定是否实现完整的 `createAsyncResource`。核心响应式系统保持纯净，异步能力作为可选模块存在。

这一决策符合 Kiaao 的哲学：**透明、可控、极简**，同时为未来演进保留了空间。

---

文档结束。后续若需要实现具体代码或进一步讨论，可基于此文档继续。
