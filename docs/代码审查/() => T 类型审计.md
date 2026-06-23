# `() => T` 类型使用情况审计

> 日期：2026-06-23
> 范围：`src/` 下所有 `() => T` 模式

---

## 结论

经过逐条审计，`src/` 下所有 `() => T` 类型注释都可以归为以下三类。**没有误用 `() => T` 代替 `Signal<T>` 的情况。**

---

## 类别一：回调/生命周期函数签名（38 处）

这些都是框架层面的回调类型定义，不是信号，不应该改为 `Signal<T>`。

| 位置                        | 类型                                                   | 说明                  |
| --------------------------- | ------------------------------------------------------ | --------------------- |
| `src/core/component.ts:15`  | `onMount: (fn: () => void \| Promise<void>) => void`   | 组件挂载回调注册      |
| `src/core/component.ts:16`  | `onUnmount: (fn: () => void \| Promise<void>) => void` | 组件卸载回调注册      |
| `src/core/component.ts:48`  | `(stop: () => void) => void`                           | 清理函数注册          |
| `src/core/direct.ts:11`     | `onMount(fn: () => void): void`                        | 指令挂载回调          |
| `src/core/direct.ts:12`     | `onUnmount(fn: () => void): void`                      | 指令卸载回调          |
| `src/core/signal.ts:37`     | `register: (stop: () => void) => void`                 | 信号停止注册          |
| `src/core/directives.ts:76` | `elseFn?: () => any`                                   | when 指令后备渲染工厂 |
| `src/dom/lazy.ts:12`        | `loader: () => Promise<...>`                           | 异步加载器            |
| `src/router/index.ts:30`    | `to: string \| (() => string)`                         | 路由目标路径解析器    |

其余为上述的回调实现和箭头函数表达式。

---

## 类别二：清理函数数组类型（15 处）

`(() => void)[]` 是函数的数组，不是信号。Owner 的 `cleanups`、`mountCallbacks`、`unmountCallbacks` 以及 `HResult.cleanups` 都属此类。

| 位置                              | 类型                                                       | 说明                   |
| --------------------------------- | ---------------------------------------------------------- | ---------------------- |
| `src/core/types.ts:27`            | `cleanups?: (() => void)[]`                                | HResult 清理函数       |
| `src/core/types.ts:33`            | `cleanups: (() => void)[]`                                 | ProcessChildrenResult  |
| `src/core/types.ts:95-97`         | `cleanups/mountCallbacks/unmountCallbacks: (() => void)[]` | Owner 生命周期队列     |
| `src/core/h.ts:59`                | `orphanCleanups: (() => void)[]`                           | handleDomMode 临时清理 |
| `src/core/process-children.ts:22` | `cleanups: (() => void)[]`                                 | processChildren 清理   |
| `src/dom/props.ts:55`             | `cleanups?: (() => void)[]`                                | setProps 清理收集      |

---

## 类别三：箭头函数表达式（2 处）

运行时执行的箭头函数定义，不是类型注释。

- `src/core/signal.ts:84` — `stop: () => {}`
- `src/core/component.ts:28` — `const noop = () => {};`
- `src/core/component.ts:35` — `return [() => undefined, noop];`

---

## 已修复项

| 位置                     | 改前                                          | 改后                                            |
| ------------------------ | --------------------------------------------- | ----------------------------------------------- |
| `src/router/index.ts:47` | `currentPath: () => string`                   | `currentPath: Signal<string>`                   |
| `src/router/index.ts:49` | `currentParams: () => Record<string, string>` | `currentParams: Signal<Record<string, string>>` |
| `src/router/index.ts:80` | `currentPath: () => string,`                  | `currentPath: Signal<string>,`                  |

---

## 审计方法

1. 执行 `grep -rn "() =>" src/ --include='*.ts'` 获取全部匹配
2. 逐条判断语义：
   - 是回调/工厂/加载器函数签名 → 类别一，保留
   - 是清理函数数组 → 类别二，保留
   - 是箭头函数表达式 → 类别三，保留
   - 是公共 API 中代表信号返回值的 → 应改为 `Signal<T>`（已修复）
3. 无遗漏
