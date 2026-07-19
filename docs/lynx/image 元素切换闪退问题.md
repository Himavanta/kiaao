# Kiaao Lynx `<image>` 元素 remove+insert 闪退问题

> ⚠️ **本文档已过时**。问题已确认不是 image 特有的，且 SDK 3.9.0 仍然存在。
> 完整、正确的调查结论见：**[`元素 destroy-create 闪退问题.md`](./元素%20destroy-create%20闪退问题.md)**

## 问题描述

在 Lynx 主线程模式下，使用 `<Show>` 组件切换 `<image>` 元素时，LynxExplorer 进程会闪退。

### 触发条件

```tsx
<Show value={alterLogo}>
  {() => <image src="url1" className="..." />}
  {() => <image src="url2" className="..." />}
</Show>
```

点击触发 `alterLogo(!alterLogo())`，Show 切换分支，**LynxExplorer 立即闪退**。

### 不闪退的场景

**单 image 元素 + src 切换**：

```tsx
<image src={use(alterLogo, () => (alterLogo() ? "url1" : "url2"))} />
```

这种写法始终只有一个 `<image>` 元素，src 变化时 Lynx 内部处理更新，**不闪退**。

### 差异分析

| 方案                                   | 元素生命周期         | Lynx 原生操作                               | 结果    |
| -------------------------------------- | -------------------- | ------------------------------------------- | ------- |
| 内联三元 + `use(alterLogo, () => ...)` | 单元素复用           | `__SetAttribute(src, ...)`                  | ✅ 正常 |
| Show 双分支                            | 双元素 remove+insert | `__RemoveElement` + `__InsertElementBefore` | ❌ 闪退 |

## 已尝试的方案

### 方案 A：Show 内部延后 insert

**思路**：把 `renderBranch` 中的 DOM 插入延后到微任务/宏任务执行。

```ts
subscribeSignal(context.owner, props.value, () => {
  const next = createBranch(); // dispose + h + adoptResult
  if (!next) return;
  queueMicrotask(() => insertBranch(next)); // 延后 DOM 插入
});
```

**结果**：12 个 Core 测试失败（DOM/SSR 平台期望同步行为），且 Lynx 上仍然闪退。

**结论**：❌ 不可行。Core 控制流组件必须保持同步语义以兼容 DOM/SSR。

---

### 方案 B：adapter batch flush（Lynx adapter 全局批量 flush）

**思路**：把 Lynx adapter 的所有 `__FlushElementTree` 调用延后到微任务批量执行。

```ts
const dirtyParents = new Set<FiberElement>();
let flushScheduled = false;

function markDirty(parent: FiberElement): void {
  dirtyParents.add(parent);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flushDirty);
  }
}
```

所有 adapter 方法（`remove` / `before` / `append` / `clear` / `replace` / `setText` / `setProp`）改用 `markDirty`。

**结果**：`ReferenceError: queueMicrotask is not defined`（Lynx runtime 没有此 API）。即使加了 `Promise.resolve().then` polyfill，Lynx 上仍然闪退。

**结论**：❌ 不可行。即使 batch flush，native 层仍然在处理 remove+insert 时崩溃。

---

### 方案 C：`adapter.batch(fn)` 扩展点架构

**思路**：在 `RenderAdapter` 加可选方法 `batch?(fn)`。Core 控制流组件在 DOM 插入时调用 `adapter.batch?.(insert) ?? insert()`。DOM/SSR 不实现 `batch`（同步），Lynx 实现为延后。

**实现**：

```ts
// src/core/types.ts
interface RenderAdapter {
  batch?(fn: () => void): void;
}

// src/core/flow-shared.ts（adoptBranch）
const insert = () => {
  for (const node of r.nodes) adapter.before(anchor, node);
  if (r.owner) triggerMount(r.owner);
};
if (adapter.batch) adapter.batch(insert);
else insert();

// src/lynx/adapter.ts
batch(fn: () => void): void {
  queueMicrotask(fn);
}

// src/lynx/index.ts
if (typeof globalThis.queueMicrotask !== "function") {
  globalThis.queueMicrotask = (fn) => void Promise.resolve().then(fn);
  // 或者 setTimeout(fn, 0)
}
```

**测试结果**：

- Core 测试：438 通过，7 历史失败（无新增）
- Lynx 设备：**仍然闪退**

**尝试过的延迟时长**：

| 延迟                                                  | 结果 |
| ----------------------------------------------------- | ---- |
| 微任务（`queueMicrotask` / `Promise.resolve().then`） | 闪退 |
| 宏任务（`setTimeout(fn, 0)`）                         | 闪退 |
| 50ms                                                  | 闪退 |
| 1000ms                                                | 闪退 |

**结论**：❌ **不是时序问题**。即使给 native 层 1 秒的清理时间，remove+insert 仍然闪退。

---

### 方案 D：直接修改 Show 内部逻辑（绕过 dispose+insert）

**未实施**。需要 Show 内部使用 `__ReplaceElement` 原子替换，或保留两个 image 元素用 CSS display 切换。这会改变 Show 的语义，超出 `adapter.batch` 扩展点的能力。

## 根因推断

| 现象                               | 推断                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------- |
| 单 image + src 切换不闪退          | Lynx 内部处理 src 变化时，**复用现有 native image 对象**，不涉及销毁/创建 |
| Show 双 image + remove+insert 闪退 | Lynx **销毁 image native 对象** + **创建新的 image native 对象**时崩溃    |

**推测**：Lynx native 层（1.4.0 SDK）在销毁 `<image>` native 对象后立即创建新对象，存在 native 内部状态竞态或资源未释放问题。这是 Lynx 自身的 bug。

**间接证据**：

- 延时到 1000ms 仍闪退 → 不是异步资源未释放的时序问题
- 单 image src 切换正常 → Lynx 能正确处理 image 生命周期，只是不能处理 destroy+create
- `__ReplaceElement` 是 atomic 操作，可能避开 destroy+create 路径

## 绕过方案

### 方案 1：避免使用 Show 切换 image

用 `use(signal, () => ...)` + 内联三元，**单 image 元素 + src 切换**：

```tsx
<image src={use(alterLogo, () => (alterLogo() ? "url1" : "url2"))} className="Logo" />
```

这是当前唯一确认可用的方案。

### 方案 2：CSS display 切换（理论可行，未验证）

```tsx
const showA = use(alterLogo);
return (
  <>
    <image src="url1" style={showA() ? {} : { display: "none" }} />
    <image src="url2" style={!showA() ? {} : { display: "none" }} />
  </>
);
```

两个 image 同时存在，根据信号切 display。不会触发 remove+insert，但会占用更多内存。

### 方案 2a：Lynx `visibility` 属性（已验证不可行）

Lynx 不支持 web CSS 的 `display: none`。Lynx 官方使用 `visibility: "hidden"` / `visibility: "visible"`：

```tsx
<image src="url" style={{ visibility: alterLogo() ? "visible" : "hidden" }} />
```

**实测结果**：❌ 也不生效。Lynx 1.4.0 SDK 上 `visibility` 属性被静默忽略，元素仍然显示/不渲染表现异常。

### 方案 2b：Lynx adapter style 对象支持已修复

调研中发现 kiaao Lynx adapter 的 `setProp` 只接受 style 字符串，对象 style 被静默忽略。已修复：

```ts
// src/lynx/adapter.ts
if (k === "style") {
  if (typeof value === "string") {
    __SetInlineStyles(node, value);
  } else if (value && typeof value === "object") {
    __SetInlineStyles(node, styleObjectToString(value));
  }
}
```

新增辅助函数 `styleObjectToString` + `camelToKebab`，处理对象 → CSS 字符串序列化。

但**即使能传 CSS 字符串到 native，Lynx 也不识别 web CSS 关键字**（`display:none` / `visibility:hidden`）。这是 Lynx 的 CSS 模型根本性限制。

### 方案 3：使用 `<list>` 元素（未验证）

Lynx 的 `<list>` 元素有特殊的复用机制，可能对 image 有不同的处理。

### 方案 4：手动 condition 渲染（临时方案）

不使用 Show，直接在父组件里根据条件手动控制 image 渲染。但 Show 的语义本来就是这个，所以这只是绕道，没解决根本问题。

### 方案 5：纯 text Show 也闪退（更严重的发现）

**2026-07-02 补充发现**：去掉 image，纯 text Show 快速点击也会闪退：

```tsx
<Show value={alterLogo}>
  {() => (
    <view>
      <text>text-a</text>
    </view>
  )}
  {() => (
    <view>
      <text>text-b</text>
    </view>
  )}
</Show>
```

连点 3-4 次后 LynxExplorer 进程闪退。

**关键推断**：**问题不是 image 特有的**，是 Show 的 `dispose + insert` 模式在 Lynx 上整体有问题。Image 只是把症状放大了（因为 data URL 重 + 解码复杂）。

任何用 Show 切换**重型组件**（含 image / 复杂 layout / 频繁重渲染）都有闪退风险。

## 待验证的方向

| 方向                    | 命令/方法                                | 说明                      |
| ----------------------- | ---------------------------------------- | ------------------------- |
| 尝试 `__ReplaceElement` | 修改 Show 用 replace 替代 dispose+insert | atomic 操作，可能避开 bug |
| 尝试 `<list>` 元素      | 用 `<list>` 包裹 image                   | 复用机制                  |
| 尝试不同 SDK 版本       | 升级到 Lynx SDK 2.x                      | 可能已修复                |
| 提 issue 给 Lynx        | GitHub issues                            | 让官方修                  |

## 复现脚本

```tsx
// App.tsx
export function App() {
  const alterLogo = use(false);

  return (
    <view bindtap={() => alterLogo(!alterLogo())}>
      {/* 这个会闪退 */}
      <Show value={alterLogo}>
        {() => <image src="https://example.com/a.jpg" />}
        {() => <image src="https://example.com/b.jpg" />}
      </Show>
    </view>
  );
}
```

## 相关文档

- `docs/lynx/问题与经验总结.md` 章节 2.5：`runWorklet` 全局钩子
- `docs/lynx/适配器开发记录.md`：Lynx adapter 完整实现
- `src/core/show.ts`：Show 组件源码
- `src/core/flow-shared.ts`：`adoptBranch` 实现
- `src/lynx/adapter.ts`：Lynx RenderAdapter

## 版本信息

- Lynx SDK: 1.4.0
- LynxExplorer: arm64
- 设备：iOS（具体型号未记录）
- 时间：2026-07-02 调查
