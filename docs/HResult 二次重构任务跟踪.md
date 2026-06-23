# HResult 二次重构 — 任务跟踪

> 关联方案：[`{ owner, nodes }` 返回值方案二次重构实施方案](./Kiaao%20%60%7B%20owner%2C%20nodes%20%7D%60%20返回值方案二次重构实施方案.md)
> 状态：🟡 规划中
> 开始日期：待定

---

## 总体目标

在第一次重构（Owner 树 + `h()` 数组化 + `createApp`）基础上，将 `h()` 返回值从 `Node | Node[]` 改为 `HResult { owner, nodes, cleanups }`，彻底消除 `currentOwner` 全局变量。

### 核心变更

| 从                                                   | 到                                                      |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `h()` 返回 `Node \| Node[]`                          | `h()` 返回 `HResult`                                    |
| `processChildren` 返回 `Node[]`                      | `processChildren` 返回 `{ nodes, cleanups }`            |
| `setProps(el, props)`                                | `setProps(el, props, cleanups?)`                        |
| `handleComponent` 通过 `currentOwner` 建立父子关系   | `handleComponent` 从 `HResult` 中提取 `.owner` 显式挂载 |
| 清理函数通过 `currentOwner.cleanups.push(stop)` 注册 | 清理函数通过 `HResult.cleanups` 暂存，上层统一处理      |
| `currentOwner` 模块级全局变量                        | **完全移除**                                            |

---

## 阶段划分

每条横线分隔一个阶段。每个阶段的输出是可独立验证的——即其测试能通过。每个阶段完成后需要确认才能开始下一阶段。

---

### 阶段一：HResult 类型 + processChildren 改造

**依赖**：无

**范围**：定义 `HResult` 类型和工具函数，修改 `processChildren` 返回格式。不涉及 `h()` 返回值改动，新旧代码可以共存。

#### 文件清单

| 文件                           | 动作 | 内容                                                                                         |
| ------------------------------ | ---- | -------------------------------------------------------------------------------------------- |
| `src/core/types.ts`            | 更新 | 新增 `HResult` 接口、`HRESULT_SYMBOL`、`createHResult`、`isHResult`、`ProcessChildrenResult` |
| `src/core/process-children.ts` | 重写 | 返回 `{ nodes, cleanups }` 而非 `Node[]`                                                     |

#### 关键实现细节

**`HResult` 类型**：

```ts
const HRESULT_SYMBOL = Symbol("kiaao.hresult");

interface HResult {
  [HRESULT_SYMBOL]: true;
  owner: Owner | null;
  nodes: Node[];
  cleanups?: (() => void)[];
}

function createHResult(owner: Owner | null, nodes: Node[], cleanups?: (() => void)[]): HResult {
  const result: HResult = {
    [HRESULT_SYMBOL]: true as const,
    owner,
    nodes,
  };
  if (cleanups && cleanups.length > 0) result.cleanups = cleanups;
  return result;
}

function isHResult(value: unknown): value is HResult {
  return isObject(value) && HRESULT_SYMBOL in value;
}
```

**`ProcessChildrenResult`**：

```ts
interface ProcessChildrenResult {
  nodes: Node[];
  cleanups: (() => void)[];
}
```

**`processChildren`**：

```ts
function processChildren(children: any[]): ProcessChildrenResult {
  const nodes: Node[] = [];
  const cleanups: (() => void)[] = [];

  for (const child of children.flat(Infinity)) {
    if (child == null || child === true || child === false) continue;
    if (Array.isArray(child)) {
      const sub = processChildren(child);
      nodes.push(...sub.nodes);
      cleanups.push(...sub.cleanups);
      continue;
    }
    if (isNode(child)) {
      nodes.push(child);
      continue;
    }
    if (isHResult(child)) {
      nodes.push(...child.nodes);
      if (child.cleanups) cleanups.push(...child.cleanups);
      continue;
    }
    if (isUse(child)) {
      const adapter = getAdapter();
      const textNode = adapter.createTextNode("") as Text;
      const [derived] = use(child, () => {
        textNode.textContent = String(child());
      });
      const stop = (derived as any)[REACTIVE]?.stop;
      if (stop) cleanups.push(stop);
      nodes.push(textNode);
      continue;
    }
    // 普通静态值 → 文本节点
    const adapter = getAdapter();
    nodes.push(adapter.createTextNode(String(child)) as Text);
  }

  return { nodes, cleanups };
}
```

#### 测试覆盖

| 测试                                      | 说明                                                    |
| ----------------------------------------- | ------------------------------------------------------- |
| `createHResult` 创建含 owner/nodes 的对象 | owner、nodes、HRESULT_SYMBOL 均有值                     |
| `createHResult` 创建含 cleanups 的对象    | 传入 cleanups 数组时结果对象包含 cleanups               |
| `createHResult` 不含 cleanups             | 不传入 cleanups 时结果对象无 cleanups 字段              |
| `isHResult` 返回 true                     | 对 `createHResult` 返回的对象返回 true                  |
| `isHResult` 返回 false                    | 对普通对象、null、undefined 返回 false                  |
| `processChildren` 空数组                  | 返回 `{ nodes: [], cleanups: [] }`                      |
| `processChildren` 纯文本                  | `["hello"]` → 返回 1 个文本节点，cleanups 为空          |
| `processChildren` 信号绑定                | `[countSignal]` → 返回 1 个文本节点 + 1 个 cleanup      |
| `processChildren` 混合输入                | `["a", countSignal, h("span")[0]]` → 合并正确           |
| `processChildren` HResult 输入            | `[someHResult]` → 提取 nodes 和 cleanups                |
| `processChildren` 嵌套数组                | `[[countSignal], "text"]` → `flat(Infinity)` 展平后处理 |
| `processChildren` null/boolean 跳过       | `[null, false, true, "text"]` → 只保留 "text"           |

---

### 阶段二：`setProps` 清理函数收集

**依赖**：阶段一（`ProcessChildrenResult` 模式已确立）

**范围**：修改 `setProps` 支持第三参数 `cleanups` 收集信号绑定的 stop 函数。

#### 文件清单

| 文件               | 动作 | 内容                                        |
| ------------------ | ---- | ------------------------------------------- |
| `src/dom/props.ts` | 更新 | `setProps` 第三参数、`setProp` 清理函数收集 |

#### 关键细节

```ts
export function setProps(
  el: any,
  props: Record<string, any> | null | undefined,
  cleanups?: (() => void)[],
): void {
  if (!isRecord(props)) return;
  for (const key of Object.keys(props)) {
    if (key === "children") continue;
    const value = props[key];
    if (EVENT_RE.test(key)) {
      setProp(el, key, value);
    } else if (isUse(value)) {
      const [derived] = use(value, () => setProp(el, key, value()));
      const stop = (derived as any)[REACTIVE]?.stop;
      if (stop && cleanups) cleanups.push(stop);
    } else {
      setProp(el, key, value);
    }
  }
}
```

#### 测试覆盖

| 测试                                    | 说明                               |
| --------------------------------------- | ---------------------------------- |
| `setProps` 无 cleanups 参数             | 向后兼容，不传 cleanups 时不收集   |
| `setProps` 有 cleanups 参数（信号属性） | 信号绑定的 stop 进入 cleanups 数组 |
| `setProps` 有 cleanups 参数（无信号）   | 静态属性不产生 cleanups            |
| `setProps` 同时处理多个信号属性         | 每个信号各自产生一个 cleanup       |

---

### 阶段三：`h()` 返回 `HResult`（核心改造）

**依赖**：阶段一、阶段二

**范围**：`h()` 的组件模式、DOM 模式、指令模式全部改为返回 `HResult`。`handleComponent` 从 `HResult` 提取 owner 和 cleanups。

#### 文件清单

| 文件                    | 动作     | 内容                                                                                         |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `src/core/h.ts`         | **重写** | 三种模式全部返回 `HResult`                                                                   |
| `src/core/component.ts` | **重写** | `handleComponent` 从 `HResult` 建立父子关系 + 收集 cleanups；`handleAsyncComponent` 同样处理 |
| `src/core/types.ts`     | 更新     | `Children` 类型改为 `HResult`，或保留为内部名                                                |

#### `handleComponent` 核心逻辑

```ts
function handleComponent(tag, props, children): HResult {
  const owner = createOwner();
  const context = createContext(owner);
  const result = tag(props, context);

  if (result instanceof Promise) {
    return handleAsyncComponent(result, owner, context);
  }

  const results = Array.isArray(result) ? result : [result];
  const allNodes: Node[] = [];

  for (const item of results) {
    if (isHResult(item)) {
      if (item.owner) {
        owner.children.push(item.owner);
        item.owner.parent = owner;
      }
      if (item.cleanups) owner.cleanups.push(...item.cleanups);
      allNodes.push(...item.nodes);
    } else if (item instanceof Node) {
      allNodes.push(item);
    }
  }

  allNodes.forEach((n) => owner.elements.add(n));
  return createHResult(owner, allNodes);
}
```

#### `handleDomMode` 核心逻辑

```ts
function handleDomMode(tag, props, children): HResult {
  const adapter = getAdapter();
  const el = adapter.createElement(tag);
  const extraCleanups: (() => void)[] = [];
  setProps(el, props, extraCleanups);
  const { nodes: childNodes, cleanups: orphanCleanups } = processChildren(children);
  childNodes.forEach((n) => adapter.append(el, n));
  return createHResult(null, [el], [...orphanCleanups, ...extraCleanups]);
}
```

#### 测试覆盖

| 测试                             | 说明                                                                 |
| -------------------------------- | -------------------------------------------------------------------- |
| `h("div")` 返回 HResult          | 返回 `{ owner: null, nodes: [div], cleanups?: [] }`                  |
| `h(Comp)` 组件模式返回 HResult   | 组件 owner + nodes，owner.parent 为 null                             |
| 组件嵌套返回 HResult             | 父子 Owner 关系通过 HResult 传递正确建立                             |
| 组件返回多根（Fragment）         | 数组展开为多个 HResult，分别提取 owner 和 nodes                      |
| 信号作为子节点                   | 清理函数通过 HResult.cleanups 向上传递                               |
| 响应式属性                       | 清理函数通过 `setProps(..., cleanups)` → `HResult.cleanups` 向上传递 |
| 异步组件 resolve 后 HResult 处理 | Promise 结果中的 HResult.owner 正确挂载                              |
| 事件绑定                         | 通过 adapter.addEventListener，与 HResult 无关                       |
| `handleComponent` 异常路径       | 组件 throw → 创建注释占位 HResult                                    |
| 合并多个 HResult 的 cleanups     | 多个子节点各自携带 cleanups，合并到父级                              |
| `isHResult` 类型守卫             | 对 `h()` 返回值断言正确                                              |

---

### 阶段四：消除 `currentOwner`

**依赖**：阶段三（`h()` 已完全基于 HResult，不读 `currentOwner`）

**范围**：移除 `owner.ts` 中的 `currentOwner` 全部代码，清理所有未使用的导入。

#### 文件清单

| 文件                    | 动作 | 内容                                                        |
| ----------------------- | ---- | ----------------------------------------------------------- |
| `src/core/owner.ts`     | 更新 | 删除 `createCurrentOwner`、`currentOwner` 变量、`get`/`set` |
| `src/core/component.ts` | 更新 | 删除残留的 `currentOwner` 引用                              |
| `src/dom/props.ts`      | 更新 | 确认不再引用 `currentOwner`                                 |
| `all`                   | 检查 | 全局搜索 `currentOwner` 确保无残留                          |

#### 测试覆盖

| 测试                              | 说明                                   |
| --------------------------------- | -------------------------------------- |
| `currentOwner` 在 `src/` 中无引用 | `grep -rn "currentOwner" src/` 返回空  |
| Owner 树建立不受影响              | 组件嵌套 → Owner 关系通过 HResult 建立 |
| 信号绑定清理不受影响              | 清理函数通过 HResult.cleanups 传递     |

---

### 阶段五：`when`/`each` 适配 HResult

**依赖**：阶段三（`h()` 返回 HResult）

**范围**：`when` 分支渲染和 `each` 条目渲染时调用 `h()` 拿到 `HResult`，提取 `.owner`、`.nodes`、`.cleanups`。

#### 文件清单

| 文件                     | 动作 | 内容                                         |
| ------------------------ | ---- | -------------------------------------------- |
| `src/core/directives.ts` | 更新 | `when` 分支渲染、`each` 条目渲染解构 HResult |

#### 测试覆盖

| 测试                  | 说明                                                     |
| --------------------- | -------------------------------------------------------- |
| when 分支渲染 HResult | 分支 Owner 正确绑定为子 Owner，cleanups 注册到分支 Owner |
| when 分支切换清理     | 旧分支 Owner dispose、cleanups 执行                      |
| each 条目渲染 HResult | 每个条目独立 Owner，通过 HResult 挂载                    |
| when + 信号子节点     | 信号清理函数通过 HResult.cleanups 传递                   |

---

### 阶段六：`createApp` + JSX 运行时适配

**依赖**：阶段三（`h()` 返回 HResult）

**范围**：`createApp` 解构 HResult，JSX 运行时类型更新。

#### 文件清单

| 文件                       | 动作 | 内容                                                            |
| -------------------------- | ---- | --------------------------------------------------------------- |
| `src/core/create-app.ts`   | 更新 | `const { owner, nodes } = h(App)`，挂载父子关系                 |
| `src/jsx-runtime/index.ts` | 更新 | `createJsxElement` 返回 `HResult`，`JSX.Element` 改为 `HResult` |

#### 测试覆盖

| 测试                                       | 说明                                            |
| ------------------------------------------ | ----------------------------------------------- |
| `createApp` 从 HResult 提取 owner          | `h(App)` 返回 HResult，owner 被挂载到 rootOwner |
| `createApp.mount` 插入正确节点             | mount 后 DOM 中存在组件内容                     |
| `createApp.unmount` 清理正确               | unmount 后 Owner 被 dispose                     |
| JSX 运行时 `createJsxElement` 返回 HResult | 返回对象包含 `{ owner, nodes }`                 |
| `JSX.Element` 类型兼容                     | TS 类型检查通过                                 |

---

### 阶段七：极端测试与边界验证

**依赖**：阶段一至六全部完成

**范围**：构建极端场景测试套件，验证 HResult 清理函数传递在压力下正确。

#### 测试覆盖

| 测试                       | 说明                                                    |
| -------------------------- | ------------------------------------------------------- |
| 深层嵌套中的 cleanups 传递 | 5 层组件嵌套，每层有信号绑定，cleanups 逐层合并到根     |
| 混合 Fragment 的 cleanups  | `<><span/>{signal}<span/></>` → cleanups 正确           |
| when/each + 响应式属性     | 列表项内有信号绑定到属性，切换分支不泄漏                |
| 异步组件中的 cleanups      | async 组件 resolve 后内部信号的 stop 被注册到正确 Owner |
| 快速切换不泄漏             | 1000 次 when/each 切换，Owner 数和 cleanups 数匹配      |
| 10000 条 each + 信号       | 大列表渲染 + 信号绑定，清理无泄漏                       |
| HResult 创建开销 benchmark | 10000 次 `h("div")` → 10000 个 HResult 对象，GC 压力    |
| currentOwner 零引用        | `grep -r "currentOwner" src/` 返回空                    |

---

## 阶段依赖图

```
阶段一（HResult 类型 + processChildren）
  │
  ▼
阶段二（setProps 清理收集）
  │
  ▼
阶段三（h() 返回 HResult）← 核心改造，改动最大
  │
  ├─────────────────────┐
  ▼                     ▼
阶段四（消除            阶段五（when/each
 currentOwner）          适配 HResult）
  │                     │
  └─────────┬───────────┘
            ▼
      阶段六（createApp + JSX 运行时）
            │
            ▼
      阶段七（极端测试）
```

阶段四和阶段五可以并行推进（一个向内清理，一个向外适配），都依赖阶段三。

---

## 进度跟踪

| 阶段                                   | 状态      | 开始 | 结束 | 确认      |
| -------------------------------------- | --------- | ---- | ---- | --------- |
| 阶段一：HResult 类型 + processChildren | ✅ 完成   | —    | —    | ⏳ 待确认 |
| 阶段二：setProps 清理收集              | ✅ 完成   | —    | —    | ⏳ 待确认 |
| 阶段三：`h()` 返回 HResult             | ✅ 完成   | —    | —    | ⏳ 待确认 |
| 阶段四：消除 currentOwner              | ✅ 完成   | —    | —    | ⏳ 待确认 |
| 阶段五：when/each 适配 HResult         | ✅ 完成   | —    | —    | ⏳ 待确认 |
| 阶段六：createApp + JSX 运行时         | ✅ 完成   | —    | —    | ⏳ 待确认 |
| 阶段七：极端测试                       | 🔴 待开始 | —    | —    | ⏳        |

---

## 注意事项

1. **第一阶段是唯一能独立推进的**——HResult 类型定义和 processChildren 改造不影响现有任何消费方。新旧 `processChildren` 返回值格式共存期间，所有调用方仍用旧格式工作。
2. **第三阶段改动最大**，影响 `h.ts`、`component.ts`、`process-children.ts`、`props.ts` 四个核心文件，建议一次性完成不拆分。
3. **每个文件只改一次**：不要在阶段一先改 processChildren 类型，阶段三又改一次——stage 直接把 processChildren 改成最终形态，阶段三只改 `h()` 的消费逻辑。
4. **currentOwner 在阶段四才删除**：阶段三的 `h()` 可以既返回 HResult，又同时保留 `currentOwner` 让旧代码继续工作。阶段四确认所有路径已切换到 HResult 后，再一次性删除。
5. **测试先于实现**：建议每个模块先写测试再改实现（TDD 风格）。
