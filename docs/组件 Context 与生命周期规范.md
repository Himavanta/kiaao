# 组件 Context 与生命周期规范 v1.0

**状态**：草案  
**关联**：kiaao v4.0 组件模型

---

## 一、背景与动机

当前生命周期系统依赖全局组件实例栈（`pushComponent` / `popComponent`）。`onMount(fn)` 和 `onUnmount(fn)` 作为从框架中导入的全局函数，通过 `currentComponent()` 获取栈顶实例来注册回调。

这一设计建立在**组件函数完全同步执行**的假设之上。一旦组件函数内部出现 `await`，执行流断裂，栈可能在函数尚未执行完毕时被清空或替换，导致回调注册丢失或归属错误。

随着异步组件的规划提上日程（`lazy` 仅是其中一种形态），这一结构缺陷必须被修正。

**核心改变**：废弃全局栈，将组件实例上下文作为显式参数 `context` 传入组件函数。

---

## 二、设计原则

**显式归属**：每个组件实例的 `onMount` / `onUnmount` / `cleanup` 是该实例专属的方法，通过函数参数传入，不依赖任何全局状态。

**词法作用域绑定**：`context` 在 `h()` 调用时创建并与组件函数绑定。组件函数内部的任何异步操作（`await`、`setTimeout`、Promise 回调）均不影响 `context` 的归属——它是参数传入的词法作用域变量。

**同步注册，异步执行**：回调的注册是同步的。回调本身的执行可以是异步的。框架不等待异步回调完成。

**组件必须通过 `h()` 调用**：直接调用组件函数不会获得 `context`。这是合理的约束——JSX 编译后天然走 `h()`，纯 `h()` 调用也是标准用法。

---

## 三、组件函数签名

```
组件函数签名从 (props) 变更为 (props, context)
```

```ts
interface ComponentContext {
  onMount(fn: () => void | Promise<void>): void;
  onUnmount(fn: () => void): void;
  cleanup(fn: () => void): void;
}

type ComponentFunction<P = any> = (props: P, context: ComponentContext) => HTMLElement;
```

### 3.1 `onMount(fn)`

注册组件挂载后的回调。

- `fn` 可以是同步函数或 `async` 函数。
- 框架在组件挂载到 DOM 后调用所有已注册的 `onMount` 回调。
- 对于 `async` 回调，框架**不等待**其完成。
- 回调内部的错误不会影响其他回调，也不影响组件的挂载状态。错误处理由开发者自行负责（try/catch 或未来的错误边界）。

```js
function Comp(props, { onMount }) {
  onMount(() => {
    console.log("mounted");
  });

  onMount(async () => {
    const data = await fetchData();
    // 处理 data
  });

  return <div>...</div>;
}
```

### 3.2 `onUnmount(fn)`

注册组件销毁前的回调。

- `fn` 必须是同步函数（不接收 async）。
- 框架在组件从 DOM 移除前调用所有已注册的 `onUnmount` 回调。
- 此时组件的 DOM 仍然存在于文档中，信号和派生仍然有效。

```js
function Comp(props, { onMount, onUnmount }) {
  onMount(() => {
    const timer = setInterval(() => {
      /* ... */
    }, 1000);
    onUnmount(() => clearInterval(timer));
  });

  return <div>...</div>;
}
```

### 3.3 `cleanup(fn)`

注册一个通用清理函数，在组件卸载时执行。与 `onUnmount` 的区别在于语义定位：

- `onUnmount`：组件生命周期的卸载阶段，DOM 仍存在。
- `cleanup`：通用的资源释放入口。内部实现上与 `onUnmount` 共享同一个回调队列，但语义上更轻量，适用于派生停止、订阅取消等场景。

```js
function Comp(props, { cleanup }) {
  const [count] = use(0);

  use(count, () => {
    const ws = new WebSocket("...");
    cleanup(() => ws.close());
  });

  return <div>{count}</div>;
}
```

---

## 四、`h()` 中的实现

### 4.1 组件模式

```ts
// h.ts — 组件模式
if (typeof tag === "function") {
  const instance = createComponentInstance();
  const context: ComponentContext = {
    onMount: (fn) => instance.mountCallbacks.push(fn),
    onUnmount: (fn) => instance.unmountCallbacks.push(fn),
    cleanup: (fn) => instance.unmountCallbacks.push(fn),
  };

  const result = tag(props, context);

  result[INSTANCE_KEY] = instance;
  result[DISPOSE_KEY] = createDisposeFn(instance);

  return result;
}
```

### 4.2 废弃部分

以下全局状态和 API 将被移除：

- `pushComponent` / `popComponent`
- `currentComponent`
- 从 `kiaao` 中全局导出的 `onMount` / `onUnmount`（不再作为独立函数存在）

### 4.3 不受影响的部分

- 原生元素（字符串 tag）的 `h()` 调用不涉及 context。
- `when` / `each` 指令内部创建的 effect 仍通过 `LOCAL_EFFECTS` 管理，与组件 context 无关。
- `triggerMount` / `disposeNode` 的逻辑不变——仍通过 `INSTANCE_KEY` 和 `DISPOSE_KEY` 递归触发。

---

## 五、与旧版的对比

| 维度             | 旧版（全局栈）                    | 新版（context 参数）         |
| ---------------- | --------------------------------- | ---------------------------- |
| 注册方式         | `import { onMount } from 'kiaao'` | `(props, { onMount }) => {}` |
| 实例归属         | 通过全局栈推断                    | 参数传入，词法绑定           |
| 异步组件         | 存在陷阱                          | 安全                         |
| 组件调用方式     | 通过 `h()` 调用                   | 必须通过 `h()` 调用          |
| 对第三方库的兼容 | 需要全局上下文                    | 完全独立                     |

---

## 六、迁移指南

旧写法：

```js
import { onMount, onUnmount } from "kiaao";

function Comp() {
  onMount(() => {
    /* ... */
  });
  onUnmount(() => {
    /* ... */
  });
  return <div />;
}
```

新写法：

```js
function Comp(props, { onMount, onUnmount }) {
  onMount(() => {
    /* ... */
  });
  onUnmount(() => {
    /* ... */
  });
  return <div />;
}
```

---

## 七、内部标记（不变）

| Symbol            | 挂载位置        | 用途                               |
| ----------------- | --------------- | ---------------------------------- |
| `INSTANCE_KEY`    | 组件根 DOM 节点 | 关联组件实例，供 triggerMount 查找 |
| `DISPOSE_KEY`     | 组件根 DOM 节点 | 组件销毁函数，供 disposeNode 调用  |
| `LOCAL_EFFECTS`   | 任意 DOM 节点   | 该节点上的响应式绑定 stop 集合     |
| `INITIALIZED_KEY` | 组件实例        | 防止 mountCallbacks 重复执行       |
| `DISPOSED_KEY`    | 组件实例        | 防止 dispose 重复执行              |

---

**文档版本**：v1.0-draft  
**撰写日期**：2026年6月11日  
**状态**：待审阅
