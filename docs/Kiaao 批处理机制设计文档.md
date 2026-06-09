# Kiaao 批处理机制设计文档

**版本**：1.0  
**更新日期**：2026-06-09  
**状态**：设计讨论完成，暂不实施，作为未来参考

---

## 1. 背景与动机

Kiaao 的响应式系统在状态变更时会立即触发依赖的 `effect` 和派生计算。这在多个连续的状态更新时（如循环、批量赋值）会导致：

- 多次重复执行副作用（如 DOM 更新、网络请求）。
- 中间状态被渲染或执行，可能引起界面闪烁或性能下降。
- 用户必须手动使用 `batch` 来合并更新，增加心智负担。

为了改善开发体验和性能，可引入 **自动微任务批处理**：将同一同步任务内的多次状态更新合并为一次副作用执行。同时保留 **显式 `batch` API** 以满足需要同步执行的场景。

---

## 2. 核心概念

### 2.1 自动微任务批处理

- 当状态变化需要执行 `effect` 时，不立即执行，而是将 `effect` 函数加入一个待执行队列。
- 在当前同步代码执行完毕后，通过 `queueMicrotask` 调度一个微任务，批量执行队列中的所有 `effect`（去重）。
- 用户无感知，默认获得性能优化。

### 2.2 显式 `batch` API

- 提供一个 `batch(fn)` 函数，在 `fn` 执行期间，所有的 `effect` 将**同步立即执行**（绕过微任务队列）。
- 用于需要立即观察变化结果的场景（如测试、同步依赖、与第三方库集成）。

两者可以共存，通过一个全局标志控制调度行为。

---

## 3. 实现方案

### 3.1 数据结构与全局状态

```ts
// scheduler.ts
let pendingEffects = new Set<() => void>(); // 待执行的 effect 集合（去重）
let isFlushing = false; // 是否正在执行微任务批次
let isBatching = false; // 是否在显式 batch 内部
```

### 3.2 调度函数 `scheduleEffect`

当需要触发一个 effect 时，不再直接调用 `effect()`，而是调用此函数：

```ts
function scheduleEffect(effect: () => void) {
  if (isBatching) {
    // 显式 batch 内：同步执行
    effect();
    return;
  }
  pendingEffects.add(effect);
  if (!isFlushing) {
    isFlushing = true;
    queueMicrotask(() => {
      const effects = Array.from(pendingEffects);
      pendingEffects.clear();
      isFlushing = false;
      for (const e of effects) {
        e();
      }
    });
  }
}
```

### 3.3 修改 `notifySignal`

原来同步调用 `entry.run()` 的地方，改为调用 `scheduleEffect(entry.run)`。

```diff
- entry.run();
+ scheduleEffect(entry.run);
```

### 3.4 实现显式 `batch` API

```ts
export function batch<T>(fn: () => T): T {
  const prevBatching = isBatching;
  isBatching = true;
  try {
    return fn();
  } finally {
    isBatching = prevBatching;
    // 注意：batch 结束后不需要额外触发微任务，因为 batch 内的 effect 已同步执行
  }
}
```

### 3.5 与现有 `derive` 的集成

`derive` 内部使用了 `effect` 来监听依赖变化并更新版本号。该 effect 的触发也会经过 `scheduleEffect`，因此派生值的更新同样被批处理。无需额外修改。

---

## 4. 辅助API（可选）

为了满足特殊需求，可提供以下工具：

### 4.1 `flushSync` – 强制立即执行所有待处理的 effect

```ts
export function flushSync() {
  if (pendingEffects.size === 0) return;
  const effects = Array.from(pendingEffects);
  pendingEffects.clear();
  for (const e of effects) {
    e();
  }
}
```

### 4.2 `isBatching` 查询（开发调试）

```ts
export function isBatchActive() {
  return isBatching;
}
```

### 4.3 测试辅助：`nextTick`

等待当前微任务队列清空（常用于测试断言）：

```ts
export function nextTick() {
  return new Promise((resolve) => queueMicrotask(resolve));
}
```

---

## 5. 与主流框架的对比

| 框架     | 默认批处理方式           | 显式同步API                   |
| -------- | ------------------------ | ----------------------------- |
| Vue 3    | 自动微任务批处理         | `nextTick` (异步)             |
| React 18 | 自动批处理（基于调用栈） | `flushSync`                   |
| Solid    | 部分自动批处理 + `batch` | `batch`                       |
| MobX     | 自动批处理（事务）       | `transaction` (旧) / `action` |

Kiaao 的方案更接近 **Solid**：提供 `batch` 显式同步，同时默认自动微任务批处理。

---

## 6. 优缺点分析

### 6.1 优点

- **性能提升**：自动合并同一事件循环内的多次更新，减少冗余副作用和 DOM 操作。
- **开发体验友好**：用户无需学习 `batch` 即可获得优化，减少错误。
- **灵活性保留**：仍可通过 `batch` 或 `flushSync` 实现同步更新。
- **实现简洁**：仅需约 50 行核心代码，不改变依赖追踪逻辑。

### 6.2 缺点与应对

| 缺点                           | 应对方案                                   |
| ------------------------------ | ------------------------------------------ |
| 微任务延迟导致测试中需要等待   | 提供 `nextTick` 或测试环境下的 `flushSync` |
| 某些场景希望立即执行（如日志） | 用户可用 `batch` 包裹明确同步              |
| 递归 effect 可能产生无限循环   | 框架可限制最大调度次数（开发模式警告）     |
| 调试时 effect 执行时机不直观   | DevTools 可显示调度队列                    |

---

## 7. 与显式 `batch` 的共存策略

- **默认**：自动微任务批处理。
- **用户使用 `batch(fn)`**：`fn` 内部所有 effect 同步执行，外部恢复自动批处理。
- **嵌套 `batch`**：通过计数器或标志管理，最内层执行完恢复外层状态。

示例：

```ts
batch(() => {
  // effect 同步执行
  batch(() => {
    // 依然同步
  });
  // 同步
});
// 退出最外层 batch 后，恢复自动微任务批处理
```

---

## 8. 性能考量

- `Set` 去重：同一 effect 多次调度只执行一次。
- 微任务优先级：高于渲染，低于 DOM 事件，通常延迟在 1ms 以内，用户无感知。
- 内存：每次微任务执行后清空 `pendingEffects`，无积累。

---

## 9. 潜在风险与边界情况

### 9.1 递归更新

如果 effect 内修改状态，导致该 effect 再次被调度，会进入同一个微任务批次（因为尚未执行）。批次执行时，该 effect 可能修改状态，触发新的调度，形成循环。解决方案：

- 在开发模式下，检测同一 effect 在单次批次中执行超过阈值（如 100 次）时抛出警告。
- 或通过图算法检测循环依赖，但复杂，可暂不实现。

### 9.2 异步更新中的批处理

在 `setTimeout`、`Promise.then` 等异步回调中修改状态，由于这些回调属于新的宏任务/微任务，自动批处理会按独立批次进行。这是期望行为，因为用户通常希望异步步骤单独渲染。

### 9.3 与 SSR 的兼容

在 SSR 阶段，应禁用自动批处理（或直接禁用 effect），避免微任务延迟。可通过 `setRenderMode('ssr')` 时，将 `scheduleEffect` 改为同步执行。

---

## 10. 测试策略

- 单元测试：验证多个连续 `set` 只触发一次 effect。
- 集成测试：验证 `batch` 内 effect 同步执行。
- 边界测试：嵌套 batch、effect 递归。
- SSR 测试：确认批处理被禁用。

测试示例：

```ts
test("auto batching", async () => {
  let count = 0;
  const [a, setA] = define(1);
  effect(() => {
    count = a();
  });
  setA(2);
  setA(3);
  expect(count).toBe(1); // 尚未执行微任务
  await nextTick();
  expect(count).toBe(3);
});
```

---

## 11. 实施建议

**当前状态**：设计完成，暂不实施。  
**触发条件**：当收到较多性能相关的用户反馈，或在复杂应用中观察到明显的无效重复渲染时，可考虑引入。

**渐进式引入步骤**：

1. 在 `core/scheduler.ts` 中实现上述调度器。
2. 修改 `notifySignal` 使用 `scheduleEffect`。
3. 保留 `batch` API 并使其与调度器协作。
4. 添加开发模式的警告工具（如检测高频同步更新）。
5. 更新文档，说明自动批处理行为，以及何时需要使用 `batch`/`flushSync`。

---

## 12. 总结

自动微任务批处理是响应式框架中成熟的性能优化手段，与 Kiaao 现有架构兼容性良好。引入后可以提升默认性能，同时保留显式 `batch` 提供精确控制。本设计可作为未来实施的详细蓝图。

---

文档结束。若将来决定实施，可参照此文档进行开发。
