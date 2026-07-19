# Kiaao Lynx 元素 destroy+create 闪退问题

**最后更新**：2026-07-19

---

## 问题描述

在 Lynx 主线程模式下，Show 组件切换分支（dispose 旧分支 + 创建新分支）时，LynxExplorer 进程闪退。

该问题**不是 image 特有的**，纯 text 元素同样会触发（连点 3-4 次后闪退）。image 只是让症状更明显（因为 data URL 大 + 解码复杂）。

**已确认 SDK 范围**：1.4.0、3.9.0（最新）均存在此 bug。

### 安全的操作

| 操作                                      | 结果    |
| ----------------------------------------- | ------- |
| 单元素属性更新（`__SetAttribute` 改 src） | ✅ 正常 |
| `display:none` 切换（两个元素同时在树中） | ✅ 正常 |

### 闪退的操作（任何 destroy+create 组合）

| API 组合                                                         | 结果    |
| ---------------------------------------------------------------- | ------- |
| `__RemoveElement` + `__InsertElementBefore`                      | ❌ 闪退 |
| `__AppendElement` + `__RemoveElement`                            | ❌ 闪退 |
| `__ReplaceElement(new, old)`                                     | ❌ 闪退 |
| 以上任意 + 单次 `__FlushElementTree()`（无中间 flush）           | ❌ 闪退 |
| 以上任意 + `__CreateImage` 替代 `__CreateElement` + `__SetCSSId` | ❌ 闪退 |
| 延时 1000ms 后再 insert                                          | ❌ 闪退 |

**结论**：不是时序问题，不是 flush 次数问题，不是 API 选择问题。Lynx native 层在同父节点下的 destroy+create 存在根本性缺陷。

---

## 根因分析

### 为什么 vue-lynx 不闪退

vue-lynx 使用**双线程架构**：

```
后台线程（PrimJS）
  ├─ Vue 响应式系统 + vdom diff
  ├─ ShadowElement 影子树
  ├─ 所有 DOM 变更序列化为 op buffer（JSON）
  └─ callLepusMethod('vuePatchUpdate', { data: JSON.stringify(ops) })
       ↓ 跨线程通信
主线程（Lepus）
  └─ applyOps() → 顺序处理 CREATE/INSERT/REMOVE/SET_STYLE → __FlushElementTree()
```

关键：原生层在**一个 callLepusMethod 调用**内处理全部 ops。对 Lynx native 层来说，所有变更是一次性到达的，不存在"先看到旧树被破坏、再看到新树被构建"的中间状态。

### 为什么 kiaao 会闪退

kiaao 使用**单线程主线程模式**：

```
主线程（Lepus）
  ├─ kiaao 响应式系统（信号变化 → 同步传播）
  ├─ Show.renderBranch()
  │   ├─ disposeOwner() → adapter.remove() → __RemoveElement → __FlushElementTree
  │   └─ adoptBranch()  → adapter.before() → __InsertElementBefore → __FlushElementTree
  └─ 每个操作直接调用 native API，立即生效
```

即使把所有 adapter 操作延迟、只在最后调用一次 `__FlushElementTree()`，native 层仍能看到 `__RemoveElement` 和 `__InsertElementBefore` 的中间状态——因为这些 native API 调用本身就在修改底层树结构，`__FlushElementTree` 只是触发渲染刷新。

**核心矛盾**：kiaao 的同步响应式模型要求立即执行 DOM 操作，但 Lynx native 层无法正确处理同一父节点下"先删后插"的元素变更。

---

## 已验证的测试矩阵

| 方案              | 创建 API          | 插入 API                | 删除 API                    | CSS 初始化   | flush 次数 | 结果 |
| ----------------- | ----------------- | ----------------------- | --------------------------- | ------------ | ---------- | ---- |
| src 切换          | 复用              | —                       | —                           | —            | 0          | ✅   |
| display:none      | 预创建两个        | —                       | —                           | —            | 1          | ✅   |
| insert+remove     | `__CreateElement` | `__InsertElementBefore` | `__RemoveElement`           | 无           | 2          | ❌   |
| replace           | `__CreateElement` | —                       | `__ReplaceElement`(old,new) | 无           | 2          | ❌   |
| replace(正确参数) | `__CreateElement` | —                       | `__ReplaceElement`(new,old) | 无           | 1          | ❌   |
| append+remove     | `__CreateElement` | `__AppendElement`       | `__RemoveElement`           | 无           | 1          | ❌   |
| vue-lynx 模拟     | `__CreateImage`   | `__AppendElement`       | `__RemoveElement`           | `__SetCSSId` | 1          | ❌   |

---

## 确认可用的 API

以下 API 在 LynxExplorer SDK 1.4.0 和 3.9.0 上均已确认存在且可用：

| API                      | 可用                                   |
| ------------------------ | -------------------------------------- |
| `__CreatePage`           | ✅                                     |
| `__CreateElement`        | ✅                                     |
| `__CreateImage`          | ✅                                     |
| `__CreateView`           | ✅                                     |
| `__CreateText`           | ✅                                     |
| `__CreateRawText`        | ✅                                     |
| `__AppendElement`        | ✅                                     |
| `__InsertElementBefore`  | ✅                                     |
| `__RemoveElement`        | ✅                                     |
| `__ReplaceElement`       | ✅（参数顺序: newElement, oldElement） |
| `__FlushElementTree`     | ✅                                     |
| `__SetCSSId`             | ✅                                     |
| `__SetAttribute`         | ✅                                     |
| `__SetClasses`           | ✅                                     |
| `__SetInlineStyles`      | ✅                                     |
| `__AddEvent`             | ✅                                     |
| `__GetParent`            | ✅                                     |
| `__FirstElement`         | ✅                                     |
| `__NextElement`          | ✅                                     |
| `__GetTag`               | ✅                                     |
| `__GetElementUniqueID`   | ✅                                     |
| `__CreateWrapperElement` | ❌ 1.4.0 不可用 / 3.9.0 待验证         |

---

## 唯一可行的绕过方案

### display:none 切换

保持两个分支元素**始终在 Lynx 元素树中**，通过切换 `display:none` 控制可见性：

```tsx
// 两个 image 同时存在，通过 display:none 切换
<view>
  <image src="urlA" style="width:100px;height:100px" />
  <image src="urlB" style="width:100px;height:100px;display:none" />
</view>
```

点击时交替切换两个元素的 `display:none`，**不删除任何元素**。

**优点**：不闪退，切换即时。
**缺点**：元素不被真正销毁，内存常驻；需要模拟 onMount/onUnmount 生命周期。

---

## 待探索方向

### 1. 后台线程模式

vue-lynx 的双线程架构是唯一已知的能在 Lynx 上安全进行 destroy+create 的方式。如果 kiaao 也采用后台线程模式：

- 后台线程：kiaao 响应式系统 + 影子树 + op buffer
- 主线程：接收 op 列表并应用（类似 vue-lynx 的 ops-apply.ts）

这条路需要实现入口分层（`main__main-thread` + `main`）+ `RuntimeWrapperWebpackPlugin` + `LynxTemplatePlugin.chunks`，之前因 `lynxCoreInject` 问题未能走通。

### 2. `__FlushElementTree` pipeline options

新 SDK 中 `__FlushElementTree` 支持 `FlushOptions` 参数，其中的 `pipelineOptions` 可能支持操作分组/批处理：

```ts
declare interface FlushOptions {
  triggerLayout?: boolean;
  operationID?: any;
  pipelineOptions?: PipelineOptions;
  // ...
}
```

待验证：pipeline 机制是否能实现类似 vue-lynx 的原子批处理。

### 3. Lynx Issue 上报

向 Lynx 官方提 issue，报告主线程模式下 destroy+create 闪退的 bug。

---

## 相关文档

- `docs/lynx/问题与经验总结.md`：构建配置、API 使用、错误一览
- `docs/lynx/适配器开发记录.md`：适配器完整实现过程
- `docs/架构/Lynx 渲染适配器设计.md`：架构设计决策
- `src/lynx/adapter.ts`：Lynx RenderAdapter 实现
- `src/core/show.ts`：Show 组件源码
- `src/core/flow-shared.ts`：`adoptBranch` 实现

## 参考代码

- vue-lynx 主线程 ops 处理：`/Users/seven/Desktop/mine/lynx/vue-lynx-main/packages/vue-lynx/main-thread/src/ops-apply.ts`
- vue-lynx ops 定义：`/Users/seven/Desktop/mine/lynx/vue-lynx-main/packages/vue-lynx/internal/src/ops.ts`
- vue-lynx 节点操作：`/Users/seven/Desktop/mine/lynx/vue-lynx-main/packages/vue-lynx/runtime/src/node-ops.ts`
- SolidJS Lynx 适配器：`/Users/seven/Desktop/mine/lynx/lynx-examples-main/examples/with-solidjs/packages/solid/src/index.ts`
- Lynx 原生 API 类型：`/Users/seven/Desktop/mine/lynx/lynx-stack-main/packages/react/runtime/types/types.d.ts`
