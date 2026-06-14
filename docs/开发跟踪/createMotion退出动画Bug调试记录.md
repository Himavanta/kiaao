# `createMotion` 退出动画 Bug 调试记录

**问题**：`createMotion`（when 模式）的退出动画只在第一次触发时可见，后续 toggle 循环中退出动画不可见。

```
第一次 toggle: 进入 ✅ → 退出 ✅
第二次 toggle: 进入 ✅ → 退出 ❌
第三次 toggle: 进入 ✅ → 退出 ❌
...
```

**状态**：✅ 已解决
**文档日期**：2026年6月14日

---

## 环境

- `motion` 版本: 12.40.0（hybrid engine）
- 使用方式：`import { animate } from "motion"`
- kiaao 版本：0.4.3

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

---

## 尝试过的方案

### 方案 A（原始版）：单关键帧 + Object.assign

```ts
// 创建时
if (from) Object.assign(el.style, from);

// 进入
ctx.onMount(() => {
  animate(el, to, { duration }).finished.then(() => {
    Object.assign(el.style, to); // 动画完成后保持 to
  });
});

// 退出
task = async (newValue) => {
  await animate(el, from, { duration }).finished;
};
```

**结果**：第一次退出 ✅，后续退出 ❌
**推测原因**：`Object.assign(el.style, from)` 污染了元素样式，motion 的 `animate` 读取 `getComputedStyle` 时拿到被污染的起始值

---

### 方案 B：删除 Object.assign(from)

删除了 `if (from) Object.assign(el.style, from)`

**结果**：不变。第一次退出 ✅，后续 ❌

---

### 方案 C：keyframes 数组 `[from, to]`

```ts
animate(el, [from, to], { duration });
```

**结果**：运行时错误——motion hybrid 引擎 `CSSStyleDeclaration` indexed setter 不支持
**原因**：`[from, to]` 数组格式触发 motion 内部 `HTMLVisualElement.renderHTML` 的异常路径

---

### 方案 D：按属性 keyframes `{ prop: [from, to] }`

```ts
for (const key of Object.keys(from)) {
  keyframes[key] = [from[key], to[key]];
}
animate(el, keyframes, { duration });
```

**结果**：进入正常，第一次退出 ✅，后续退出 ❌
**变化**：之前 Object.assign(from) 导致的样式污染问题通过手动保持 to 状态修复

---

### 方案 E：Object.assign(to) 改为 anim.stop()

```ts
const anim = animate(el, keyframes, { duration });
void anim.finished.then(() => {
  anim.stop(); // 让 motion 把最终值提交到 style
  setMotionState(el, "idle");
});
```

**依据**：motion 文档——`stop()` 会将 WAAPI 动画的当前值 commit 到 `element.style`
**结果**：不变

---

### 方案 F：回到单关键帧，无 Object.assign

```ts
// 没有 Object.assign，没有任何手动样式干预
ctx.onMount(() => {
  animate(el, to, { duration });
});
// 退出
await animate(el, from, { duration });
```

**结果**：和最开始一样，第一次 ✅ 后续 ❌

---

### 方案 G：使用 `await animate(...)` 替代 `.finished`

```ts
// 之前
await animate(el, from, { duration }).finished;
// 之后
await animate(el, from, { duration });
```

**依据**：motion 文档——animation controls 是 thenable，`then()` / `await` 在动画完成时 resolve
**结果**：不变

---

### 方案 H：工厂函数模式，play 时创建新动画

移除预存的 task function，改为在 `play` 中遍历当前元素集合，每次创建新的 `animate()` 调用：

```ts
const elements = new Set<Element>()

const play = async (newValue) => {
  for (const el of elements) {
    const p = propsMap.get(el)
    anims.push(animate(el, p.from, { duration: p.duration }).finished.then(...))
  }
  await Promise.allSettled(anims)
  setter(newValue)
}

const Motion = direct((el, props, ctx) => {
  elements.add(el)
  ctx.onUnmount(() => elements.delete(el))
})
```

**结果**：不变。第一次退出 ✅ 后续 ❌

---

## 现象总结

所有方案的共同行为模式：

| 方案                 | 首次进入 | 首次退出 | 再次进入 | 再次退出 |
| -------------------- | -------- | -------- | -------- | -------- |
| A (Object.assign)    | ✅       | ✅       | ✅       | ❌       |
| B (无 Object.assign) | ✅       | ✅       | ✅       | ❌       |
| C (keyframes 数组)   | ❌ 崩溃  | —        | —        | —        |
| D (按属性 keyframes) | ✅       | ✅       | ✅       | ❌       |
| E (anim.stop())      | ✅       | ✅       | ✅       | ❌       |
| F (纯单关键帧)       | ✅       | ✅       | ✅       | ❌       |
| G (await anim)       | ✅       | ✅       | ✅       | ❌       |
| H (工厂函数)         | ✅       | ✅       | ✅       | ❌       |

---

## 时序分析

```
第一次 toggle:
  1. 元素 A 创建 → onMount → animate(A, to) → 0.3s → setState("idle")
  2. play(false) → animate(A, from) → 0.3s → setState("exited") → setter(false)
  3. when 移除元素 A → onUnmount → 清理

第二次 toggle:
  4. 元素 B 创建 → onMount → animate(B, to) → 0.3s → setState("idle")
  5. play(false) → animate(B, from) → ??? → setState("exited") → setter(false)
```

步骤 5 中的 `animate(B, from)` 调用后，动画没有产生视觉效果。
元素 B 和元素 A 是完全不同的 DOM 节点，Motion 指令也是新建的。

---

## 未验证的推测

### 推测 1：motion 的 `.finished` Promise 在非首次调用时提前 resolve

如果 `animate(el, from, { duration }).finished` 在第二次及以后的调用中立即 resolve（不等待实际时长），动画就不会有视觉播放。原因可能是 motion 内部缓存了元素的动画状态，检测到"起始值等于目标值"时直接完成。

### 推测 2：motion 的 hybrid engine 维护了元素的内部状态

motion 的 hybrid 引擎（区别于 mini 引擎）会追踪独立 transform（`x`、`y`、`rotate` 等）。当元素被移除再重新创建时，motion 可能跨元素实例缓存了某些状态。

### 推测 3：WAAPI `fill: "none"` 导致动画完成后样式回退

`animate(el, to, { duration })` 默认使用 WAAPI 的 `fill: "none"`，动画完成后效果被移除，元素回退到动画前的 computed style。此时退出动画的起始值不是预期值。

### 需要验证的方向

1. `animate(el, from, { duration }).finished` 的 resolve 时机——是否立刻 resolve？
2. motion 是否在新元素上跨实例共享了内部状态？
3. 用 `animate(el, ` 并监听 `onUpdate` 确认动画帧是否实际执行

---

## 相关文档

- [motion.dev animate API](https://motion.dev/docs/animate)
- [motion.dev quick-start](https://motion.dev/docs/quick-start)

---

## 最终根因与修复

### 根因

两个问题叠加导致：

**问题 1：`when` 重渲染复用同一元素引用**

`when` 指令的 `renderBranch` 复用初始渲染时创建的 `children` 数组。其中保存的元素引用是同一个 DOM 节点。toggle 时这个节点被 `disposeNode` 清理，但引用不变。当 `when` 重新渲染时，`h(Motion, ...)` 不会被重新调用——指令函数体只执行一次。因此 `elements.add(el)` 只在首次执行，后续 toggle 元素不在 `elements` 中。

**问题 2：`propsMap.delete(el)` 在 `onUnmount` 中清除了 prop 数据**

即使 `onMount` 中重新注册了元素（通过 `elements.add`），`propsMap` 的条目已在 `onUnmount` 中被删除。`play` 时 `propsMap.get(el)` 返回 `undefined`，动画条件不满足而跳过。

### 修复

```ts
// 指令函数体（执行一次）
propsMap.set(el, { from, to, duration });

// onMount（每次插入 DOM 时触发）
ctx.onMount(() => {
  elements.add(el); // 重新注册元素
  // ... 进入动画 ...
});

// onUnmount（每次移除 DOM 时触发）
ctx.onUnmount(() => {
  elements.delete(el); // 注销元素
  // 不移除 propsMap——props 不变化，可跨挂载周期持久化
});
```

| 操作                  | 位置                | 执行时机           |
| --------------------- | ------------------- | ------------------ |
| `propsMap.set`        | 指令函数体          | 一次（首次 `h()`） |
| `elements.add`        | `ctx.onMount`       | **每次**插入 DOM   |
| `elements.delete`     | `ctx.onUnmount`     | 每次移除 DOM       |
| ~~`propsMap.delete`~~ | ~~`ctx.onUnmount`~~ | 已移除             |

### 验证

所有方案的共同失败模式一致——首次退出 ✅ 后续退出 ❌。修复后多次 toggle 均正常：

```
第一次 toggle: 进入 ✅ → 退出 ✅
第二次 toggle: 进入 ✅ → 退出 ✅
第三次 toggle: 进入 ✅ → 退出 ✅
```

- `src/motion/index.ts` — 当前源码
- `docs/开发跟踪/createMotion动画bug分析.md` — 初始分析文档
