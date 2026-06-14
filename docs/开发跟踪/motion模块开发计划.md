# Motion 模块开发计划

**目标**：实现 `createMotion(signal, context?)`（when 模式动画），独立为 `kiaao/motion` 打包入口

---

## 实施步骤

### 阶段 1：配置打包入口

- [x] `vite.config.ts` 添加 `"src/motion/index.ts"` 到 entry 列表
- [x] `vp pack` 验证生成 `dist/motion/index.js` ✅

### 阶段 2：实现 `MOTION_STATE` Symbol

- [x] 在 `src/motion/index.ts` 中定义 `MOTION_STATE` Symbol ✅
- [x] 定义元素状态类型 `'idle' | 'entering' | 'exiting' | 'exited'` ✅

### 阶段 3：实现 `createMotion` 核心逻辑

- [x] 导入 `animate` from `motion` ✅
- [x] 导入 `direct` from kiaao ✅
- [x] 实现 `createMotion(signal, context?)` 工厂函数 ✅
  - `context` 可选：有则用 `context.use(signal)`，无则用 `use(signal)`
  - 返回 `[play, Motion]`
- [x] 实现 `play(newValue)` 异步函数 ✅
  - 代际标记 `tick`
  - 遍历 `effectMap` 执行退出动画
  - 动画完成后 `setter(newValue)`
- [x] 实现 `Motion` 指令 ✅
  - 进入动画 `ctx.onMount`
  - 退出任务 `task`
  - 元素状态追踪

### 阶段 4：导出与验证

- [x] `src/motion/index.ts` 导出 `createMotion` ✅
- [x] `vp check` 确认无类型错误 ✅
- [x] `vp test` 确认无退化 ✅（644 通过）
- [x] `vp pack` 确认产物包含 `dist/motion/index.js` ✅

### 阶段 5：测试

- [x] 编写 `tests/motion/createMotion.test.ts` ✅（13 个测试）
  - 基础：创建、play 调用、信号更新
  - 退出动画：play(false) 触发动画并更新信号
  - 代际标记：快速连续调用只最后一次生效
  - context 可选：有无 context 两种模式
  - 边界：from 未提供、toggle off/on

---

## 文件清单

| 文件                                | 操作 | 说明                            |
| ----------------------------------- | ---- | ------------------------------- |
| `vite.config.ts`                    | 修改 | 添加 `src/motion/index.ts` 入口 |
| `src/motion/index.ts`               | 新建 | 模块主入口，导出 `createMotion` |
| `tests/motion/createMotion.test.ts` | 新建 | 单元测试                        |

---

## 注意事项

- `motion` 包在 `dependencies` 中，`skipNodeModulesBundle: true` 表示不打包，作为外部依赖
- `animate(el, keyframes, options).finished` 返回 Promise
- `createMotion` 是用户态代码，不修改框架核心
- `context` 可选：有则组件级信号，无则全局信号

**文档版本**：v1.0
**日期**：2026年6月14日
**状态**：待确认
