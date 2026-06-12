# 组件 Context 与异步组件规范 v3.2

**状态**：定稿
**关联**：kiaao v4.0 组件模型
**前置依赖**：无

---

## 一、背景与动机

kiaao v4.0 的原始组件模型基于两个相互依赖的假设：**组件函数同步执行**，**生命周期通过全局组件实例栈管理**。`onMount(fn)` 和 `onUnmount(fn)` 作为从框架导出的全局函数，通过 `currentComponent()` 获取栈顶实例来注册回调。

随着异步组件的需求日益明确，这一模型的缺陷变得不可忽视：

- **异步陷阱**：如果组件函数内部有 `await`，执行流中断，全局栈可能在函数返回前被清空或污染，导致生命周期回调注册到错误的实例上。
- **灵活度不足**：工具函数、高阶组件、`onMount` 回调内部创建的资源，无法在任意调用深度下注册清理逻辑。
- **概念冗余**：`cleanup` 与 `onUnmount` 语义相近但定位模糊，增加了开发者的心智负担。

本次重构**同时解决上述所有问题**，确立以下核心变更：

1. **废弃全局组件实例栈**。组件实例上下文通过函数参数 `context` 显式传入。
2. **支持异步组件**。当组件函数返回 Promise 时，框架自动识别并提供透明容器，在 Promise resolve 后挂载真实 DOM 并递归触发生命周期。
3. **统一生命周期 API**。仅保留 `onMount` 和 `onUnmount`，两者均可随时调用、接受异步函数，框架通过统一的错误捕获保证行为一致。

---

## 二、设计原则

**显式归属**
组件实例不再通过全局栈推断。`h()` 在调用组件函数时，将上下文对象 `context` 作为第二个参数传入。组件函数内部的任何异步操作（`await`、`setTimeout`、Promise 回调）均不影响上下文归属——它是词法作用域中的参数引用。

**同步注册，异步执行**
生命周期回调的注册是同步的，但回调本身的执行可以是异步的（async 函数）。框架不等待异步回调完成。回调内部的错误由统一的 `safeCall` 工具函数捕获并打印，不会中断其他回调或导致页面崩溃。

**透明包裹，稳定引用**
异步组件在加载期间创建一个 `<div style="display: contents">` 作为占位容器（wrapper）。该容器从创建到卸载**始终是组件的根节点**，持有所有实例元数据（`DISPOSE_KEY`）。Promise resolve 后，真实 DOM 仅作为普通子节点插入，`triggerMount(realDOM)` 递归触发子树中所有同步子孙组件的挂载回调，然后手动触发当前异步组件自身的 `mountCallbacks`。wrapper 不设置 `INSTANCE_KEY`，因此 `triggerMount` 递归不会提前触发异步组件的挂载回调。

**无魔法，无特殊分支**
除异步组件需要延迟 `onMount` 触发外，同步与异步组件共享相同的清理路径、相同的生命周期 API。开发者只需知晓异步组件在 DOM 中会多一层透明包裹，其余心智模型完全一致。

**防御性兜底**
对于运行时的非法返回值（组件返回非 Node、Promise resolve 非 Node），框架自动降级为注释节点并发出警告，不抛出错误，不中断渲染流程。

**组件必须通过 `h()` 调用**
直接调用组件函数（如 `Comp(props)`）不会传入 `context`，生命周期无法注册。JSX 编译后天然走 `h()`，纯 `h()` 调用也是标准用法。这是框架的合理约束。

---

## 三、组件函数签名

组件函数签名从 `(props)` 变更为 `(props, context)`。

```ts
interface ComponentContext {
  onMount(fn: () => void | Promise<void>): void;
  onUnmount(fn: () => void | Promise<void>): void;
}

type ComponentFunction<P = any> = (
  props: P,
  context: ComponentContext,
) => HTMLElement | Promise<HTMLElement>;
```

### 3.1 `onMount(fn)`

注册组件挂载完成后的回调。

**调用时机不受限制**——可以在组件函数顶层、嵌套函数、`onMount` 回调内部等任何位置调用，只要组件实例尚未销毁。

**执行时机由组件状态决定**：

| 调用时组件状态 | 行为                                          |
| -------------- | --------------------------------------------- |
| 尚未挂载       | `fn` 被推入待执行队列，等待挂载完成后统一触发 |
| 已挂载         | `fn` 立即同步执行                             |

- 对于**同步组件**，“挂载完成”指 `mount(root, container)` 调用后，`triggerMount` 递归遍历到该组件根节点时。此时 DOM 已插入文档。
- 对于**异步组件**，“挂载完成”指 Promise resolve 且真实 DOM 已作为子节点插入 wrapper，`triggerMount(realDOM)` 递归触发子树后，由框架内部手动触发当前组件的 `mountCallbacks`。此时真实内容已就位，子树中所有已就位的同步子孙组件均已挂载完毕。详见 [第七节](#七异步组件与同步组件的-onmount-触发顺序)。
- `fn` 可以是同步函数或 async 函数。若是 async 函数，框架不等待其完成。内部错误由 `safeCall` 捕获并打印，不会影响其他回调或中断框架流程。
- 若在组件已挂载后调用 `onMount`，`fn` **立即执行**。这意味着在挂载回调内部再次调用 `onMount` 注册新回调时，新回调会同步执行，而非排队等待。开发者应注意避免在此路径上产生无限递归。
- 若在组件已销毁后调用 `onMount`，开发模式下发出警告并忽略，生产模式静默忽略。

### 3.2 `onUnmount(fn)`

注册组件销毁前的清理回调。

**调用时机不受限制**——可以在任何位置调用，只要组件实例尚未销毁。

**执行时机**：组件卸载时，`createDisposeFn` 使用 `safeCall` 执行所有已注册的 `onUnmount` 回调。此时组件的 DOM 仍存在于文档中，所有响应式绑定仍有效。

- `fn` 可以是同步函数或 async 函数。若是 async 函数，框架不等待其完成。内部错误由 `safeCall` 捕获并打印，不会导致未捕获的 Promise rejection。
- 若在组件已销毁后调用 `onUnmount`，开发模式下发出警告并忽略，生产模式静默忽略。

**注意**：没有 `cleanup` API。所有资源清理统一通过 `onUnmount` 完成。

---

## 四、内部工具函数

### 4.1 `safeCall(fn, label)`

模块级工具函数，用于统一执行生命周期回调，捕获同步错误和异步 rejection。

```ts
export function safeCall(fn: () => void | Promise<void>, label: string): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.catch((err) => console.error(`[kiaao] ${label}:`, err));
    }
  } catch (err) {
    console.error(`[kiaao] ${label}:`, err);
  }
}
```

使用场景：

- `h()` 中执行 `mountCallbacks` 时：`safeCall(fn, 'onMount')`
- `createDisposeFn` 中执行 `unmountCallbacks` 时：`safeCall(fn, 'onUnmount')`

---

## 五、`h()` 中的实现细节

### 5.1 组件模式完整流程

```ts
if (typeof tag === "function") {
  const instance = createComponentInstance();

  const context: ComponentContext = {
    onMount: (fn) => {
      if (instance[DISPOSED_KEY]) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[kiaao] onMount called after component disposed");
        }
        return;
      }
      if (instance[INITIALIZED_KEY]) {
        safeCall(fn, "onMount");
      } else {
        instance.mountCallbacks.push(fn);
      }
    },
    onUnmount: (fn) => {
      if (instance[DISPOSED_KEY]) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[kiaao] onUnmount called after component disposed");
        }
        return;
      }
      instance.unmountCallbacks.push(fn);
    },
  };

  const result = tag(props, context);

  if (result instanceof Promise) {
    // —— 异步组件 ——
    const wrapper = createElement("div");
    wrapper.style.display = "contents";
    wrapper[DISPOSE_KEY] = createDisposeFn(instance);

    let disposed = false;
    instance.unmountCallbacks.push(() => {
      disposed = true;
    });

    result
      .then((realDOM) => {
        if (disposed) return;

        // 防御性检查：realDOM 必须为 Node
        if (!(realDOM instanceof Node)) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[kiaao] async component resolved with non-Node value:", realDOM);
          }
          realDOM = createComment("async component resolved with invalid value");
        }

        wrapper.appendChild(realDOM);

        // 先递归触发子树中所有同步子组件的 onMount
        triggerMount(realDOM);

        // 再触发当前异步组件自身的 onMount（此时子组件已挂载完毕）
        if (!instance[INITIALIZED_KEY]) {
          instance[INITIALIZED_KEY] = true;
          instance.mountCallbacks.forEach((fn) => safeCall(fn, "onMount"));
        }
      })
      .catch((err) => {
        if (disposed) return;
        console.error("[kiaao] async component error:", err);
      });

    return wrapper;
  } else {
    // —— 同步组件 ——
    if (result instanceof Node) {
      result[INSTANCE_KEY] = instance;
      result[DISPOSE_KEY] = createDisposeFn(instance);
    } else {
      // 返回值无效，创建占位节点
      if (process.env.NODE_ENV !== "production") {
        console.warn("[kiaao] component returned non-Node value:", result);
      }
      const placeholder = createComment("component returned invalid value");
      placeholder[INSTANCE_KEY] = instance;
      placeholder[DISPOSE_KEY] = createDisposeFn(instance);
      return placeholder;
    }
    return result;
  }
}
```

### 5.2 关键设计决策

- **wrapper 不设置 `INSTANCE_KEY`**
  `triggerMount` 在挂载时递归遍历 DOM 树，仅对带有 `INSTANCE_KEY` 的节点触发 `onMount` 回调。wrapper 没有此标记，因此 `triggerMount(wrapper)` 会被跳过。异步组件的挂载回调在 Promise resolve 后**先递归子组件再手动触发自身**，避免空内容时执行回调，同时保证父组件的 `onMount` 在子树全部挂载完成后才执行。

- **wrapper 始终持有 `DISPOSE_KEY`**
  无论异步组件处于哪个阶段（加载中、已完成），卸载都通过 `disposeNode(wrapper)` 正确执行。Promise resolve 后，`DISPOSE_KEY` 仍留在 wrapper 上，不转移到 realDOM。realDOM 是普通子节点，其内部响应式绑定由 `disposeNode` 递归清理，不承担组件级生命周期。

- **disposed 标志位**
  通过 `instance.unmountCallbacks` 中的回调设置 `disposed = true`，防止组件卸载后，Promise resolve 仍尝试操作已脱离文档的 wrapper。

- **safeCall 统一错误处理**
  所有生命周期回调均通过模块级的 `safeCall` 执行。同步抛出的错误和异步 Promise rejection 均被捕获并打印，不会中断其他回调或破坏框架状态。

- **防御性类型检查**
  同步组件返回值和异步组件 resolve 值均检查是否为 Node。非 Node 时降级为注释节点并在开发模式发出警告。

- **createDisposeFn 使用 safeCall**
  `unmountCallbacks` 中的每个回调均通过 `safeCall` 执行，保证 async 回调的 rejection 被捕获，且一个回调的失败不会中断后续回调的执行。

---

## 六、生命周期触发与清理路径

### 6.1 挂载流程

- **同步组件**：`mount(root, container)` → `container.append(root)` → `triggerMount(root)` 递归遍历，对带 `INSTANCE_KEY` 的节点执行 `mountCallbacks` 并标记 `INITIALIZED_KEY`。遍历顺序为深度优先、父先于子——这是 DOM 树递归的自然结果。

- **异步组件**：`mount(wrapper, container)` → `container.append(wrapper)` → `triggerMount(wrapper)` 发现无 `INSTANCE_KEY`，跳过 → 等待 Promise → resolve 后 `wrapper.appendChild(realDOM)` → `triggerMount(realDOM)` 递归触发子组件 → 手动执行当前组件的 `mountCallbacks` 并标记 `INITIALIZED_KEY`。

### 6.2 卸载流程

`disposeNode(node)` 递归清理：

1. 对每个子节点递归调用 `disposeNode`。
2. 清理当前节点的 `LOCAL_EFFECTS`（响应式绑定）。
3. 若节点有 `DISPOSE_KEY`，调用它（内部使用 `safeCall` 执行所有 `unmountCallbacks`，停止所有 effect，标记 `DISPOSED_KEY`）。

卸载入口：`unmount(root)` 调用 `disposeNode(root)` 后 `root.remove()`。

对于 `when` / `each` 分支切换，框架持有的是 `h()` 的返回值。异步组件的返回值是 wrapper，因此 `disposeNode(wrapper)` 被正确调用，wrapper 及其内部的 realDOM 均被清理，不会残留。

### 6.3 三种典型场景

| 场景                          | 处理流程                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **异步组件 resolve 前被卸载** | `disposeNode(wrapper)` → `DISPOSE_KEY` 执行 → `unmountCallbacks` 中设置 `disposed = true` → 清理 instance → wrapper 移除。Promise resolve 时 `disposed` 为 true，跳过操作。 |
| **异步组件 resolve 后被卸载** | `disposeNode(wrapper)` → 递归清理 realDOM 子树（`LOCAL_EFFECTS`）→ `DISPOSE_KEY` 执行 → 清理 instance → wrapper 移除。                                                      |
| **父组件卸载**                | 父组件 `disposeNode` 递归遍历到 wrapper，后续同上。                                                                                                                         |

---

## 七、异步组件与同步组件的 `onMount` 触发顺序

### 7.1 顺序差异

同步组件和异步组件的 `onMount` 触发顺序不同：

- **同步组件**：`triggerMount` 是深度优先的前序遍历，**父组件先于子组件**触发 `onMount`。这是 DOM 树递归遍历的自然结果，并非刻意的设计决策。

- **异步组件**：resolve 后的顺序是**先递归子树（`triggerMount(realDOM)`），后触发自身（`mountCallbacks`）**。这意味着子组件的 `onMount` 先于父异步组件触发。这是有意为之的设计。

### 7.2 差异的根源

同步组件的挂载流程：

```
mount(root, container)
  → container.append(root)       // 整个组件树一次性插入 DOM
  → triggerMount(root)           // 前序遍历：先父后子
```

父组件在创建时，子组件还不存在。挂载时，整个树一次性插入，然后从根节点开始递归触发 `onMount`。父先于子是遍历算法的自然结果。

异步组件的挂载流程：

```
mount(wrapper, container)
  → container.append(wrapper)    // wrapper 插入 DOM（内容为空）
  → triggerMount(wrapper)        // 无 INSTANCE_KEY，跳过
  → ... 等待 Promise ...
  → wrapper.appendChild(realDOM) // 真实内容插入 DOM
  → triggerMount(realDOM)        // 递归触发子树中所有同步子组件
  → instance.mountCallbacks      // 触发当前异步组件自身
```

异步组件的内容是"后来才到的"。内容到之前，它自己不算挂载完成。内容到了之后，内容内部的子组件先就位（它们是同步的，或者已经 resolve 的），然后包装它们的这个异步组件才算完成。这个顺序是语义推导的结果——子组件是父组件返回内容的一部分，内容就位意味着子组件先就位，父组件后确认。

### 7.3 最终效果的一致性

无论哪种顺序，框架保证一个不变量：

> 父组件的 `onMount` 回调执行时，所有**已就位的子组件**（同步子组件和已 resolve 的异步子组件）的 `onMount` 都已经触发完毕。

同步组件通过前序遍历保证了这一点。异步组件通过"先 `triggerMount(realDOM)` 递归子树，再触发自身"也保证了这一点。开发者不需要关心 `onMount` 触发顺序的差异，只需要知道：当父组件的 `onMount` 执行时，其子树中已就位的组件都已挂载完成。

### 7.4 嵌套异步子组件的边界情况

如果异步父组件内部包含尚未 resolve 的异步子组件：

```
AsyncParent (async)
  └── SyncChild (sync)
  └── AsyncChild (async)        ← 尚未 resolve
        └── SyncGrandChild (sync)
```

执行顺序为：

1. `AsyncParent` resolve → `realDOM` 就位 → `wrapper.appendChild(realDOM)`
2. `triggerMount(realDOM)` 递归：
   - 遇到 `SyncChild`（有 `INSTANCE_KEY`）→ 触发 `SyncChild.onMount`
   - 遇到 `AsyncChild` 的 wrapper（无 `INSTANCE_KEY`）→ 跳过
3. `AsyncParent.mountCallbacks` 触发 → `AsyncParent.onMount` 执行

此时 `AsyncChild` 还没有 resolve，它的 `onMount` 尚未触发。在 `AsyncParent.onMount` 回调中访问 `AsyncChild` 内部时，其内容可能仍为空。

**这并非 bug，而是异步并发模型的自然结果。** `AsyncChild` 的 Promise 与 `AsyncParent` 的 Promise 之间没有依赖关系，它们各自独立 resolve。`AsyncParent` 比 `AsyncChild` 先完成是完全合理的。

如果开发者需要确保异步子组件也完成后再执行某些逻辑，可以通过信号来协调——这是 kiaao 已有的能力，不需要框架层面的额外同步机制。

---

## 八、异步组件的 DOM 影响

异步组件在 DOM 树中多了一层 `<div style="display: contents">` 包裹。开发者需知晓以下影响：

- **布局**：`display: contents` 使容器自身不生成盒子，子节点在布局上如同直接挂在父元素下。无视觉差异。
- **CSS 选择器**：`:nth-child`、`:first-child`、直接子代选择器 `>` 等会将 wrapper 计为一个子节点。这可能影响依赖特定选择器结构的样式。
- **DOM 遍历**：`parentNode.children`、`previousElementSibling` 等会包含 wrapper 节点。

这些影响是**确定性的、可预测的**。

---

## 九、SSR 中的处理

`renderToString` 是同步函数，不支持等待 Promise。SSR 模式下，若组件函数返回 Promise，框架**直接抛出错误**：

```
[kiaao] Async components are not supported in SSR.
```

同步组件路径完全不受影响。需要异步数据的 SSR 场景，应在组件外部获取数据，通过 props 传入同步组件。

---

## 十、迁移注意事项

### 10.1 生命周期 API 变化

旧版（全局栈）：

```js
import { onMount, onUnmount } from 'kiaao'
function Comp() {
  onMount(() => { ... })
  onUnmount(() => { ... })
  return <div />
}
```

新版（context 参数）：

```js
function Comp(props, { onMount, onUnmount }) {
  onMount(() => { ... })
  onUnmount(() => { ... })
  return <div />
}
```

### 10.2 异步组件支持

不再需要外部包装异步逻辑。任何返回 Promise 的组件函数均为异步组件，框架自动处理。

```js
async function DataLoader(props, { onMount }) {
  const data = await fetch("/api");
  onMount(() => console.log("ready"));
  return <div>{data}</div>;
}
```

### 10.3 内置组件迁移

`Teleport` 等内置组件若使用了全局 `onUnmount`，需改为从 `context` 参数解构：

```ts
// 旧
import { onUnmount } from "kiaao";
export function Teleport(props) {
  onUnmount(() => {
    /* ... */
  });
}

// 新
export function Teleport(props, { onUnmount }) {
  onUnmount(() => {
    /* ... */
  });
}
```

### 10.4 与旧版的完整差异对照

| 维度                   | 旧版（v4.0 早期）                            | 新版（context + 异步组件）                              |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------- |
| 生命周期注册           | `import { onMount, onUnmount } from 'kiaao'` | 通过 `context` 参数解构                                 |
| 组件函数签名           | `(props)`                                    | `(props, context)`                                      |
| 异步组件               | 不支持，组件函数必须同步                     | 返回 Promise 即为异步组件                               |
| 异步组件 DOM           | 无                                           | 多一层 `<div style="display: contents">`                |
| onMount 触发           | `mount()` 递归                               | 同步组件相同；异步组件 resolve 后先递归子组件再触发自身 |
| onMount 已挂载后调用   | 不支持                                       | 立即执行                                                |
| onUnmount 已销毁后调用 | 不支持                                       | 开发警告，生产忽略                                      |
| cleanup                | 预留中                                       | 彻底移除                                                |
| 回调错误处理           | 无保护                                       | 模块级 `safeCall` 统一捕获                              |
| 非法返回值处理         | 无                                           | 降级为注释节点 + 开发警告                               |

---

## 十一、内部标记

| Symbol            | 挂载位置                          | 用途                                        |
| ----------------- | --------------------------------- | ------------------------------------------- |
| `INSTANCE_KEY`    | 同步组件根 DOM 节点               | 供 `triggerMount` 递归查找                  |
| `DISPOSE_KEY`     | 组件根 DOM 节点（同步或 wrapper） | 组件销毁入口                                |
| `LOCAL_EFFECTS`   | 任意 DOM 节点                     | 节点级响应式绑定停止集合                    |
| `INITIALIZED_KEY` | 组件实例                          | 标记挂载已完成，协调 `onMount` 立即执行逻辑 |
| `DISPOSED_KEY`    | 组件实例                          | 标记已销毁，防止重复销毁和注册              |

---

**文档版本**：v3.2
**撰写日期**：2026年6月12日
**状态**：定稿
