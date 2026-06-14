# `createMotion` 动画 Bug 分析

**状态**：未解决，待分析
**关联**：`src/motion/index.ts`
**日期**：2026年6月14日

---

## 问题描述

`createMotion`（when 模式）的退出动画只在第一次触发时可见。之后的 toggle 循环中，进入动画正常，退出动画不可见。

```
第一次：进入 ✅ → 退出 ✅
第二次：进入 ✅ → 退出 ❌
第三次：进入 ✅ → 退出 ❌
...
```

---

## 用户代码

```tsx
const [visible] = use(true);
const [play, Motion] = createMotion(visible, context);

return (
  <div when={visible}>
    <Motion
      from={{ opacity: 0, transform: "translateY(20px)" }}
      to={{ opacity: 1, transform: "translateY(0)" }}
      duration={0.3}
    >
      <div class="card">内容</div>
    </Motion>
  </div>
);
```

## 源码逻辑

```ts
// 指令创建时（directive function body）
if (from) Object.assign(el.style, from);

// 进入动画（onMount）
animate(el, to, { duration }).finished.then(() => {
  Object.assign(el.style, to);
});

// 退出任务（play 调用）
await animate(el, from, { duration }).finished;
```

---

## 尝试过的修复

### 尝试 1：删除 `Object.assign(el.style, from)`

```ts
// 删除了
// if (from) Object.assign(el.style, from);
```

**结果**：第一次退出可以，后续都不行。和现在一样。

### 尝试 2：删除 `Object.assign(from)`，改为 `animate(el, [from, to], ...)`

```ts
void animate(el, [from, to], { duration }).finished.then(...)
```

**结果**：motion 内部 `CSSStyleDeclaration` indexed setter 报错。

### 尝试 3：保留 `Object.assign(from)` + 动画完成后 `Object.assign(to)`

```ts
if (from) Object.assign(el.style, from); // 创建时
void animate(el, to, { duration }).finished.then(() => {
  Object.assign(el.style, to); // 完成后
});
await animate(el, from, { duration }).finished; // 退出
```

**结果**：第一次退出可以，后续不行。**当前代码就是此版本。**

---

## 时序分析

一个完整的 toggle 周期：

```
触发 play(false)
  → task 执行：animate(el, from, { duration })
  → 等待动画完成（~0.3s）
  → setMotionState("exited")
  → setter(false)
  → when 检测到变化：clearChildren → disposeNode
    → ctx.onUnmount → effectMap.delete(el) (旧 el)

触发 play(true)
  → effectMap 为空，无任务
  → setter(true)
  → when 渲染新内容
    → 新 Motion 指令处理新 el
    → Object.assign(newEl.style, from)   ← 新 el 设为 from 样式
    → 新 task 注册到 effectMap
    → onMount 触发
    → animate(newEl, to, { duration })
    → 等待完成（~0.3s）
    → Object.assign(newEl.style, to)     ← 新 el 显式设为 to
    → setMotionState("idle")

触发 play(false) 第二次
  → effectMap 有 task（新 el 注册的）
  → task 执行：animate(newEl, from, { duration })
  → ???
```

**问题点**：第二次 `play(false)` 时，`newEl` 的当前样式已经通过 `Object.assign(newEl.style, to)` 设置到了 `to` 状态。`animate(newEl, from, { duration })` 应该从 `to` 动画到 `from`——如果 motion 的 `animate` 行为正确，这应该产生一个可见动画。

---

## 推测的可能原因

### 推测 A：motion 的 `animate` 与 `Object.assign` 不兼容

`Object.assign(el.style, from)` 以**驼峰形式**设置 CSS 属性（`transform`），而 motion 内部可能使用不同的属性格式（如 `--motion-transform` 自定义属性）。如果 motion 的退出动画读取的起始值不是 `Object.assign` 设置的值，而是 computed style（或自定义属性），则动画起始值可能不符合预期。

### 推测 B：`animate` 的 `.finished` Promise 在特定条件下 reject

如果 motion 发现"起始值等于目标值"（猜测的优化行为），可能会立即 reject `.finished` Promise，动画不会实际播放。`try...finally` 中的 `finally` 会执行，状态变为 `exited`，退出流程正常完成但动画不可见。

### 推测 C：motion 内部缓存了旧元素的动画状态

元素被 `disposeNode` 清理后，motion 可能仍持有该元素相关的内部状态。新元素被创建时，motion 可能错误地将旧状态关联到新元素上，导致行为异常。

---

## 验证方向

以下是用 debug 方式确认根因的方向：

1. 在 `task` 中的 `animate(el, from, { duration })` 之前打印 `el.style.opacity` 和 `el.style.transform`，确认元素处于哪个状态
2. 在 `animate` 调用后监听 `.finished` 的 rejection，确认是否被 reject
3. 使用 motion 的 `animate` 的 `onUpdate` 回调（如果支持）观察动画帧是否实际执行

---

**文档版本**：v1.0
**日期**：2026年6月14日
**状态**：未解决
