# `any` 类型替换任务

> 创建日期：2026-06-23 | 最后更新：2026-06-24
> 目标：将 `src/` 中所有 `: any` 替换为精确类型
> 原则：不惧怕类型定义数量，类型系统清晰健壮优先

---

## 当前状态

```
Phase 1 (Owner)     ✅ → Phase 2 (Element)     ✅ → Phase 3 (Signal)    ✅
Phase 4 (Props)     ✅ → Phase 5 (Motion)      ✅ → Phase 6 (Router)   🟡
                                                       剩余零散  ⬜
```

**进度：** 98 处 → 64 处 (`src/` 零报错，171 测试全绿)

---

## 已完成

### Phase 1: `owner: any` → `Owner` ✅

| 位置            | 内容                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `component.ts`  | `createContext`, `createContextUse`, `mergeResults`, `handleAsyncComponent`, `handleComponent` 的 `owner: any` → `Owner` |
| `direct.ts`     | `createDirectiveContext(owner: any)` → `Owner`                                                                           |
| `directives.ts` | `appendResult`, mode 函数, `branchOwner`, `itemOwner` → `Owner`                                                          |

### Phase 2: Element 类型 ✅

| 位置             | 内容                                                |
| ---------------- | --------------------------------------------------- |
| `dom/props.ts`   | `setProp(el: any)`, `setProps(el: any)` → `Element` |
| `dom/adapter.ts` | 保持 `el: any`（需要 index 访问 `el[key] = value`） |

### Phase 3: 信号状态类型 ✅

| 位置        | 内容                                                 |
| ----------- | ---------------------------------------------------- |
| `signal.ts` | `createSignal(state: any)` → `SignalState<T>`        |
| `types.ts`  | `DerivationState.computeFn(v?: any)` → `(v?: T)`     |
| 全库        | `(x as any)[REACTIVE]` → `getSignalState(x)`（7 处） |

### Phase 4: Props 类型 ✅

| 位置            | 内容                                                                                 |
| --------------- | ------------------------------------------------------------------------------------ |
| `types.ts`      | 新增 `Props`, `NullableProps`, `ComponentResult`, `MergeableResult`, `CleanupFn`     |
| `h.ts`          | `h()` 重载 `props?: NullableProps`, `handleDirectiveMode(props: NullableProps = {})` |
| `component.ts`  | `handleComponent(props: NullableProps = {})`, `mergeResults(items: MergeableResult)` |
| `props.ts`      | `setProps(props: NullableProps = {})`                                                |
| `directives.ts` | `createWhenElement/EachElement` options 改为 `Props`                                 |
| `direct.ts`     | `DirectiveFunction` props 改为 `Props & { children?: any }`                          |
| motion          | 指令回调 `props: Record<string, any>` → `Props`                                      |
| jsx-runtime     | 全部 `Record<string, any>` → `Props` / `NullableProps`                               |
| 全库            | `() => void` → `CleanupFn`（6 个核心文件）                                           |

### Phase 5: Motion 泛型化 ✅

| 位置                     | 内容                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `create-motion.ts`       | `Signal<any>` → `Signal<boolean>`, `newValue: any` → `boolean`                                                                    |
| `create-group-motion.ts` | `any[]` → `<T, K>` 泛型全链路（`findRemovedKeys`, `collectRemovedKeyAnimations`, `handleGroupSignalChange`, `createGroupMotion`） |

---

## 剩余 64 处 `: any` 分类

### 保留的（48 处，不改）

| 类别                                           | 数量 | 理由                                                             |
| ---------------------------------------------- | ---- | ---------------------------------------------------------------- |
| `type-guards.ts` 参数                          | 11   | type-guard 函数必须接受 `any`                                    |
| `children: any[]`                              | 12   | 可包含 `HResult\|Node\|Signal\|string\|嵌套数组`，`any[]` 最诚实 |
| `handleDomMode props: any`                     | 1    | 要解构 `when/each/key/else` 等指令属性                           |
| `Fragment(): any`                              | 1    | 返回值可以是任何 JSX 类型                                        |
| Astro 集成                                     | 7    | Astro 泛型参数，需定义 Astro 接口（独立任务）                    |
| `signal.ts` 内部                               | 5    | 信号值泛型、`(v?: any) => T`、`deps.filter((d: any))`            |
| `jsx-runtime` `type: any` / `key?: any`        | 2    | JSX 编译器的类型不固定                                           |
| `adapter.setProp(el: any)`                     | 1    | 需要 `el[key] = value` index 访问                                |
| `router children?: any` / `[key: string]: any` | 2    | 路由参数不固定                                                   |
| `server/index.ts` prevAdapter                  | 1    | 跨平台 adapter 保存                                              |
| `props: { children?: any }`（各种）            | 5    | children 内容不固定                                              |

### 可改进的（16 处）

| 优先级 | 位置                               | 当前                 | 建议                                                | 工作量 |
| ------ | ---------------------------------- | -------------------- | --------------------------------------------------- | ------ |
| **P0** | `directives.ts` Maps               | `Map<any, any>`      | `Map<unknown, Owner>` / `Map<unknown, Signal<any>>` | 小     |
| **P0** | `appendResult(result: any)`        | `any`                | `MergeableResult`                                   | 小     |
| **P0** | `motion` `removed: any[]`          | `any[]`              | `K[]`                                               | 极小   |
| **P1** | `directives.ts:172` `prevKey: any` | `any`                | `unknown`                                           | 极小   |
| **P1** | `detectWhenMode(eachFn: any)`      | `any`                | `unknown`                                           | 极小   |
| **P2** | `router/index.ts:33`               | `[key: string]: any` | `[key: string]: unknown`                            | 极小   |

---

## 工作方法

1. 每次修改一个函数签名及其所有调用方
2. `vp check --fix src/` 确认零错误
3. `vp test` 确认 171 测试全绿
4. 更新本文档进度

## 注意事项

- `core/` 不能依赖 `dom/`，`Owner` 等 core 类型不含 DOM 依赖
- `RenderAdapter` 返回值是 `unknown`——设计如此，不改
- `type-guards.ts` 的参数必须是 `any`——type-guard 函数本质需要接受任意输入
