# Guide 文档审查

> 任务：审查 `guide/` 下全部文档的内容正确性和示例代码准确性。
> 文档需匹配 kiaao v4 当前代码实现（context 参数、use API、异步组件等）。

---

## 审查范围

| 文件                    | 状态 |
| ----------------------- | ---- |
| `guide/quick-start.md`  | ⏳   |
| `guide/reactivity.md`   | ⏳   |
| `guide/components.md`   | ⏳   |
| `guide/control-flow.md` | ⏳   |
| `guide/lifecycle.md`    | ⏳   |
| `guide/ssr.md`          | ⏳   |
| `guide/router.md`       | ⏳   |
| `guide/jsx-setup.md`    | ⏳   |

---

## 发现问题

| #   | 文件            | 问题                                                                                                                                                                                                                 |   严重度    |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------: |
| 1   | `router.md`     | `currentParams` 被描述为信号 getter，源码中是普通函数（非响应式）                                                                                                                                                    |   **高**    |
| 2   | `router.md`     | `currentParams` 返回值类型标注为 `Getter<Record<string, string>>`，实际为 `Record<string, string>`                                                                                                                   |   **中**    |
| 3   | `router.md`     | `Link` 示例中 `const [to] = use(item, ...)` 使用解构语法，但实际 `use()` 被解构后第一个元素是 getter，传递给 Link 的 `to` 属性。需要确认 Link 是否接受信号 getter。源码中 `resolveTo = () => toVal(to)` 确实接受信号 | 确认无误 ✅ |
| 4   | `components.md` | `lazy` 内部等价的代码示例使用 `h(Comp, props)`，但未传递 `context`。当前实现中 `h(Comp, _props)` 未传 context——`h()` 会为 Comp 创建新实例，此行为符合预期                                                            | 设计如此 ✅ |

---

## 进度

| 日期  | 事项     |
| ----- | -------- |
| 06-12 | 开始审查 |
