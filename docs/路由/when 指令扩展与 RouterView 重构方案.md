> ⚠️ **已废弃 / Deprecated**
> 本文档中关于 RouterView 重构的部分已被新路由 API 取代,请参考 [路由 API 方案](./路由API方案.md)。
> `when` 指令扩展部分仍可作为设计参考。保留用于历史追溯。

# when 指令扩展与 RouterView 重构方案 v2.0

**状态**：终版  
**日期**：2026-06-10

## 一、背景与目标

当前 kiaao 的控制流指令为：

- **`when`**：条件渲染，支持惰性求值函数
- **`each`**：列表渲染，支持多种数据源和基于 key 的增量更新

在日常开发中，多分支条件渲染（Switch/Case 模式）是常见需求。目前若用多个 `when` 手动模拟，需要自行保证条件互斥，每个分支还要额外包裹宿主元素，代码冗余且不直观。

与此同时，`RouterView` 为了实现嵌套路由的布局稳定性，内部手动维护了 `prevSegment` 和 `SKIP_UPDATE` 机制，导致实现较复杂。

经过讨论，我们决定：

1. **扩展 `when` 指令**，使其原生支持多分支映射表模式，同时新增 `else` 属性作为默认分支。不引入新的指令，保持 API 极简。
2. **重构 `RouterView`**，利用扩展后的 `when` 映射表模式，消除手动状态管理，使代码更加声明式。
3. **对 `createWhenElement` 内部实现进行轻量重构**，优化参数传递，解决签名膨胀问题，提升代码可维护性。

## 二、方案探索历程

### 2.1 早期思路

- **独立 `case` 属性指令**：`<div case={...}>{{...}}`  
  问题：JSX 中 `{{}}` 的编译歧义使映射表难以直接作为属性值，且新增指令会增加 API 表面积。
- **`Switch`/`Match` 组件**：通过组合组件实现多分支，但需要额外导入组件，宿主元素和惰性函数组合不如属性指令直接。
- **让 `when` 同时接收对象条件映射**：`<div when={{ loading: ..., error: ... }}>`  
  问题：这会让 `when` 承担两种完全不同的职责（布尔判断 vs 值选择），且对象字面量作为参数在 JSX 中很难处理。

### 2.2 关键洞察

- **`when` 的本质**是“根据条件决定渲染哪个子内容”。
- 如果将 **children 变为映射表对象**（`{ key: () => VNode }`），而 `when` 返回当前要激活的 key，就能自然覆盖 Switch/Case 场景。
- 布尔模式（现有行为）则作为特例保留，实现渐进增强。

### 2.3 最终方案

**扩展 `when` 指令：支持布尔模式（向后兼容）和映射表模式，并新增 `else` 属性作为默认分支。**  
`createWhenElement` 内部重构为参数对象形式，便于扩展和维护。

框架内部根据 children 的类型自动选择模式：

- 若 children 中第一个子节点是**普通对象**（通过 `isPlainObject` 判定），进入映射表模式。
- 否则走布尔模式。

## 三、`when` 指令扩展设计

### 3.1 属性定义

| 属性       | 类型                              | 说明                                                               |
| ---------- | --------------------------------- | ------------------------------------------------------------------ |
| `when`     | `(() => any) \| ReactiveFunction` | 布尔模式下返回条件值，映射表模式下返回分支 key                     |
| `else`     | `() => any` (可选)                | 默认分支的惰性函数，在条件不满足或 key 未命中时调用                |
| `children` | 任意                              | 布尔模式：内容节点或惰性函数；映射表模式：`{ [key]: () => VNode }` |

### 3.2 内部实现要点

#### 3.2.1 通用优化

为解决 `createWhenElement` 参数膨胀，将其签名重构为对象参数：

```ts
function createWhenElement(options: {
  tag: string;
  props: any;
  children: any[];
  whenFn: any;
  eachFn?: any;
  keyFn?: any;
}): HTMLElement;
```

内部通过解构取值，增加可读性，且未来新增属性无需再改签名。

#### 3.2.2 映射表模式判定

引入工具函数 `isPlainObject`，用于精确判定 children 是否为映射表对象。该函数必须排除 `null`、数组、DOM `Node` 实例、SSR 安全对象（`SSRSafe`）等。

```ts
function isPlainObject(v: any): boolean {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !(v instanceof Node) &&
    !isSSRSafe(v)
  );
}
```

映射表模式的触发条件：`children.length === 1 && isPlainObject(children[0])`。

该函数与 SSR 相关工具存在依赖关系，考虑到依赖方向，将其放置在 `ssr-helpers.ts` 中，与 `isSSRSafe` 等共存，避免循环依赖。

#### 3.2.3 布尔模式

保留现有逻辑，并基于对依赖追踪机制的分析，**无需引入额外的 `prevWhenValue` 守卫**。

**惰性布尔模式**：  
惰性函数内部绑定的信号变化时，由该信号直接驱动细粒度 DOM 更新，`createWhenElement` 内部的 `effect` 不会参与。该 `effect` 仅追踪 `whenFn()` 内部的依赖。因此，当 `whenFn()` 返回值不变时，`effect` 根本不会触发。当返回值改变时，正常执行清空旧节点、调用惰性函数重建内容的流程。惰性函数内部可通过返回 `SKIP_UPDATE` 来跳过清空和重建。

**非惰性布尔模式**：  
静态 children 在首次渲染时创建。由于 `effect` 仅追踪 `whenFn()` 的依赖，条件值不变时 `effect` 不会触发，无需任何守卫。

**`else` 的处理**：  
在条件变为 falsy 时，若存在 `else` 函数，则调用并渲染其返回值；若不存在，则清空子节点。

#### 3.2.4 映射表模式

- 维护 `prevKey`（上一次激活的 key）。
- `effect` 触发时，调用 `whenFn()` 获取当前 key。
- 若 `key === prevKey` → 返回 `SKIP_UPDATE`，保持 DOM 不变。
- 否则更新 `prevKey`，在映射表中查找：
  - 找到 → 调用对应惰性函数，返回新节点（`when` 内部会替换旧内容）。
  - 未找到 → 调用 `else` 函数（如有），否则清空。
- 所有惰性函数仅在对应 key 首次匹配或 key 变更后重新匹配时调用，保证惰性求值。

Key 的比较采用 `===` 严格相等。为避免不必要的重建，建议用户使用字符串或数字等基本类型作为 key。

#### 3.2.5 `else` 关键字

`else` 是 JavaScript 保留字，但在对象属性位置是合法的标识符。解构时需使用别名（`const { else: elseFn } = props`）。考虑到其语义与主流框架（如 Vue 的 `v-else`）一致且直观，保留 `else` 作为属性名。可能的 ESLint 警告可通过配置或注释忽略，不影响实际运行。

#### 3.2.6 与 `each` 共存

- 若为映射表模式，忽略 `each` 属性，并在开发环境下输出警告。
- 布尔模式下，`when` + `each` 共存行为保持不变（`when` 为守卫，`each` 管理列表）。

#### 3.2.7 SSR 支持

`hSSR` 中增加映射表模式分支：

1. 解析 `when` 属性获取 key。
2. 若 children 为映射表对象，查找对应 key 的分支函数并调用，返回其序列化结果。
3. 支持 `else` 回退。
4. 布尔模式保持原有逻辑。

### 3.3 示例

**简单条件**

```jsx
<div when={() => visible()}>
  <span>可见内容</span>
</div>
```

**带 else**

```jsx
<div when={isLoggedIn} else={() => <LoginButton />}>
  <UserMenu />
</div>
```

**多分支映射表**

```jsx
<div when={() => status()} else={() => <div>未知状态</div>}>
  {{
    loading: () => <Spinner />,
    error: () => <ErrorMessage />,
    success: () => <Content />,
  }}
</div>
```

当 `status()` 变化时，框架自动比较前后 key，只有 key 变化时才切换分支。

## 四、RouterView 重构方案

### 4.1 当前痛点

当前 `RouterView` 手动维护 `prevSegment` 并显式返回 `SKIP_UPDATE`，代码较复杂且与路由匹配逻辑混杂。

### 4.2 重构思路

利用 `when` 映射表模式，将路由表转换为对象映射，让 `when` 直接处理 key 比较与分支选择。RouterView 只负责提取段和生成映射表。

### 4.3 新实现（伪代码）

```tsx
function RouterView(props: RouterViewProps) {
  const myRoutes = props.routes;
  const myBase = props.base;
  const myFallback = props.fallback ?? defaultFallback;

  // 将路由表转为映射表（初始化时执行一次）
  const routeMap = Object.fromEntries(myRoutes.map((r) => [r.path, () => h(r.component, null)]));

  return h(
    "div",
    {
      when: () => extractSegment(currentPath(), myBase),
      else: () => myFallback(),
      style: { display: "contents" },
    },
    routeMap,
  );
}
```

### 4.4 逻辑流程

1. 路径变化时 `effect` 触发，`when` 回调返回当前段。
2. `when` 内部比较当前段与上次段：
   - 相同 → 返回 `SKIP_UPDATE`，布局不更新。
   - 不同 → 从 `routeMap` 中查找对应的组件渲染。
3. 段为 `null` 或未命中 → 渲染 `else` 指定的 fallback。

### 4.5 优势

- **消除手动状态**：不再需要 `prevSegment`、`SKIP_UPDATE`，由 `when` 统一管理。
- **代码更简洁**：RouterView 只负责提取段和生成映射表，路由匹配与更新逻辑完全由 `when` 承载。
- **概念统一**：路由的“按段选组件”与 `when` 的“按 key 选分支”完全一致，降低学习成本。

### 4.6 注意事项

- **路由表转换**：只在初始化时执行一次，性能开销极低。当前不支持动态路由，若未来需要，可扩展为响应式映射表。
- **嵌套 RouterView**：`base` 机制不变，内部 RouterView 仍是独立 `when`，各自管理 key 比较。
- **无动态段**：kiaao 已取消 `:param` 支持，映射表的 key 均为静态字符串，无解析开销。

## 五、审读问题修正汇总

| 编号 | 问题               | 处理方式                                                                          |
| :--: | ------------------ | --------------------------------------------------------------------------------- |
|  1   | 映射表判别条件     | 引入 `isPlainObject`，排除 Node、数组、SSRSafe 等                                 |
|  2   | key 比较语义       | 文档明确：`===` 引用比较，建议使用基本类型                                        |
|  3   | 布尔模式值未变跳过 | 经分析，`effect` 依赖追踪已自然避免无谓重跑，无需额外守卫                         |
|  4   | `else` 保留字      | 保留，提供 ESLint 配置建议                                                        |
|  5   | `SKIP_UPDATE` 归宿 | 改为内部符号，不对外导出。重构后 RouterView 不再使用，仅 `directives.ts` 内部使用 |
|  6   | each + 映射表共存  | 开发环境警告                                                                      |
|  7   | SSR 映射表模式     | 实现分支查找与序列化                                                              |
|  8   | routeMap 动态性    | 当前不支持动态路由，未来扩展                                                      |
|  9   | 惰性求值           | 确认只在 key 激活时调用                                                           |
|  10  | 签名膨胀           | 本次重构为对象参数                                                                |
|  11  | 纯 h 调用兼容      | 多 map 不分配合并，走布尔模式                                                     |

## 六、实施建议

1. 实现 `isPlainObject` 工具函数（放置于 `ssr-helpers.ts`）。
2. 重构 `createWhenElement` 为对象参数，并调整内部模式判定优先级。
3. 实现映射表模式（key 比较、分支选择、else 回退）。
4. 新增 SSR 映射表处理。
5. 重构 `RouterView` 为映射表模式。
6. 将 `SKIP_UPDATE` 改为内部符号，删除 `router/index.ts` 中的引用。
7. 更新类型定义和测试用例。

## 七、总结

通过扩展 `when` 指令和重构 `RouterView`，kiaao 在保持核心 API 极简的前提下，显著增强了条件渲染的表达能力。多分支映射表模式填补了 Switch/Case 的空白，且与现有的布尔模式完全兼容。`RouterView` 的实现得以大幅简化，布局稳定性由 `when` 的 key 比较机制自然保证。整个方案没有引入新的指令或概念，是框架控制流系统的一次优雅进化。
