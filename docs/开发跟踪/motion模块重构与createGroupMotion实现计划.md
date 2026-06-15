# Motion 模块重构与 `createGroupMotion` 实现计划

**目标**：

1. 将 `src/motion/index.ts` 拆分为 `shared.ts` + `create-motion.ts` + `create-group-motion.ts` + `index.ts`
2. `createMotion` 更新为 `onMount` 注册模式（与文档 v4.0 对齐）
3. 新增 `createGroupMotion(signal, keyFn?, context?)` — each 模式退出动画

**日期**：2026年6月15日
**状态**：进行中

---

## 文件结构

```
src/motion/
├── index.ts               # 入口，重新导出两个 API
├── shared.ts              # MOTION_STATE、类型定义、公共辅助函数
├── create-motion.ts       # createMotion（when 模式）
└── create-group-motion.ts # createGroupMotion（each 模式）
```

---

## 实施步骤

### 阶段 1：创建 `shared.ts`

- [x] 提取 `MOTION_STATE` Symbol、`MotionState` 类型、get/set 函数
- [x] 提取 `MotionProps`、`ElementMotionConfig`、`Generation` 接口
- [x] 提取 `collectExitAnimations(elements, propsMap)` — 遍历元素启动退出动画
- [x] 提取 `playEnterAnimation(el, config, elements)` — 元素挂载时进入动画
- [x] 提取 `parseMotionProps(props)` — 从 props 提取动画配置
- [x] 验证：`vp check` + `vp test` 无退化 ✅

### 阶段 2：重写 `create-motion.ts`

- [x] 导入 `shared.ts` 中的类型和辅助函数
- [x] `propsMap.set` 和 `elements.add` 移到 `ctx.onMount`（与文档 v4.0 对齐）
- [x] `onUnmount` 清理 `elements`、`propsMap`（安全，onMount 会重设）
- [x] 内部派生处理退出动画（不采用 `ctx.use(signal)` 双路径，保持简单）
- [x] 验证：`vp check` + `vp test`（motion 测试通过） ✅

### 阶段 3：实现 `create-group-motion.ts`

- [ ] 实现 `createGroupMotion(signal, keyFn?, context?)`
- [ ] 与 `createMotion` 共享 `shared.ts` 中的辅助函数
- [ ] 有 keyFn：diff 定位移除元素 → 启动退出动画 → `await` → `setVisibleItems`
- [ ] 无 keyFn：全量退出（遍历 `elements`）
- [ ] `keyToElMap`：`Map<any, Element>` 管理 key→元素映射
- [ ] `propsMap.set` + `elements.add` + `keyToElMap.set` 在 `ctx.onMount`
- [ ] `onUnmount` 清理三者
- [ ] 验证：`vp check` 无类型错误

### 阶段 4：更新 `index.ts`

- [ ] 重新导出 `createMotion`、`createGroupMotion`
- [ ] 验证：`vp pack` 确认产物包含 `dist/motion/`

### 阶段 5：测试 `createGroupMotion`

- [ ] 编写 `tests/motion/create-group-motion.test.ts`
- [ ] 基础测试：签名、初始值同步
- [ ] 有 keyFn：删除单条、删除多条、新增
- [ ] 无 keyFn：全量退出
- [ ] 边界：快速连续删除、中途反转、无 from prop、无 to prop
- [ ] 验证：`vp test` motion 全部通过

### 阶段 6：全量验证

- [ ] `vp check` 通过（仅示例 router 既有错误）
- [ ] `vp test` 全量 646+ 通过
- [ ] 示例运行验证

---

## 文件清单

| 文件                                       | 操作 | 说明                           |
| ------------------------------------------ | ---- | ------------------------------ |
| `src/motion/index.ts`                      | 改写 | 重新导出入口                   |
| `src/motion/shared.ts`                     | 新建 | 共享类型和辅助函数             |
| `src/motion/create-motion.ts`              | 新建 | createMotion（when 模式）      |
| `src/motion/create-group-motion.ts`        | 新建 | createGroupMotion（each 模式） |
| `tests/motion/createMotion.test.ts`        | 修改 | 适配重构后的导入路径           |
| `tests/motion/create-group-motion.test.ts` | 新建 | createGroupMotion 测试         |

---

## 设计决策

1. **退出动画路径**：仅内部派生处理，不使用 `ctx.use(signal)` 双路径（避免冗余派生）
2. **`propsMap.set` 位置**：统一在 `ctx.onMount`（每次挂载重设），两个模式一致
3. **`onUnmount` 清理**：统一清理 `elements` + `propsMap`（+ `keyToElMap` for group），安全
4. **无 key 路径**：遍历 `elements` 而非 `propsMap`，更防御性
5. **代际标记**：`Generation` 对象（`{ tick: number }`）包裹 tick，按引用传递
