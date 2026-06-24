# `any` 类型替换专项任务

> 创建日期：2026-06-23
> 目标：将 `src/` 中所有函数参数/返回值的 `any` 替换为精确类型
> 范围：全库 19 个源文件

---

## 替换优先级

### P0：Owner 类型替换（影响最大，使用最广）

| 文件            | 位置                                                                                | 当前    | 应替换为              |
| --------------- | ----------------------------------------------------------------------------------- | ------- | --------------------- |
| `component.ts`  | `createContext(owner: any)`                                                         | `any`   | `Owner`               |
| `component.ts`  | `createContextUse(owner: any)`                                                      | `any`   | `Owner`               |
| `component.ts`  | `mergeResults(items: any[], owner: any)`                                            | `any[]` | `(HResult \| Node)[]` |
| `component.ts`  | `handleAsyncComponent(promise, owner: any)`                                         | `any`   | `Owner`               |
| `direct.ts`     | `createDirectiveContext(owner: any)`                                                | `any`   | `Owner`               |
| `directives.ts` | `appendResult(el, result, owner: any)`                                              | `any`   | `Owner`               |
| `owner.ts`      | `safeCall(fn, label)`                                                               | —       | ✅ 已有类型           |
| `directives.ts` | `renderMappingMode/RenderLazyMode/renderEachMode/renderStaticMode(..., owner: any)` | `any`   | `Owner`               |
| `directives.ts` | `createItemDOMNodes(..., itemOwner: any)`                                           | `any`   | `Owner`               |
| `directives.ts` | `getOrCreateOwner(..., identity, containerOwner: any)`                              | `any`   | `Owner`               |
| `directives.ts` | `subscribeWhenFn(..., containerOwner: any)`                                         | `any`   | `Owner`               |

### P1：信号/REACTIVE 类型替换

| 文件            | 位置                                     | 当前            | 应替换为                      |
| --------------- | ---------------------------------------- | --------------- | ----------------------------- |
| `signal.ts`     | `definitionMode/derivationMode: state =` | `any`           | `SignalState<T>`              |
| `directives.ts` | `getOrCreateSignal`                      | `Map<any, any>` | `Map<any, Signal<any>>`       |
| `h.ts`          | `handleDomMode props: any`               | `any`           | `Record<string, any> \| null` |

### P2：非关键类型

| 文件            | 位置                                     | 当前   | 应替换为           |
| --------------- | ---------------------------------------- | ------ | ------------------ |
| `component.ts`  | `handleComponent tag: ComponentFunction` | 正确   | ✅                 |
| `h.ts`          | `createHResult(null, [el])`              | `null` | `Owner \| null` ✅ |
| `directives.ts` | 所有 `<any, any>` Map                    | `any`  | 具体泛型参数       |

---

## 工作方法

1. 从 `Owner` 类型开始（最核心）
2. 每次修改一个函数签名及其所有调用方
3. `vp check --fix` 验证无新类型错误
4. 完成后 `vp test` 验证测试通过

## 进度

- [ ] Owner 类型替换开始
- [ ] Owner 类型替换完成
- [ ] SignalState 类型替换开始
- [ ] SignalState 类型替换完成
- [ ] Map 类型泛型化
- [ ] 最终验证

## 注意事项

- `core/` 不能依赖 `dom/`，所以 Owner 等 core 类型不能引用 DOM 类型
- `Owner` 定义在 `src/core/types.ts`，不含 DOM 依赖
- `Signal<T>` 也定义在 `src/core/types.ts`
- `RenderAdapter` 返回值是 `unknown` 而非 `Node`——设计如此，不要改
