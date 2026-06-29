# Cell / HResult 重构 — 实施任务跟踪

> 关联设计文档：[Cell 与 HResult 的分离，持久 Owner 树的纯化](./Cell%20与%20HResult%20的分离，持久%20Owner%20树的纯化.md)
> 状态：🟡 规划中
> 开始日期：待定

---

## 总体策略

**逐步替换，不一次切换。** 每个模块改完后独立验证（`vp check` + 该模块相关测试通过），再进入下一步。任何一步遇到不确定的地方，停下来讨论。

### 阶段划分

```
阶段 1: 类型定义 + 工具函数
阶段 2: Owner 系统纯化（去 isLightweight）
阶段 3: toHResult + adoptResult
阶段 4: h() 重写（DOM 元素分支）
阶段 5: handleComponent + handleDirectiveMode
阶段 6: 控制流组件适配
阶段 7: Portal 适配
阶段 8: createApp + adapter 接口
阶段 9: 清理（删除 nestBind、旧代码、旧测试）
```

---

## 阶段 1：类型定义 + 工具函数

**目标**：定义新类型，不改动任何逻辑代码。

- [ ] 修改 `HResult` 接口为 `{ owner, nodes, pending, cleanups }`
- [ ] 移除 `OWNER_SYMBOL`、`HRESULT_SYMBOL`、`CELL_SYMBOL` 等（保持已有 Symbol 或按需调整）
- [ ] 更新 `createHResult` 构造器签名为 `(owner, nodes, pending, cleanups)`
- [ ] 从 `Owner` 接口移除 `isLightweight`
- [ ] 新增 `isElement` 到 `RenderAdapter` 接口
- [ ] `vp check` 通过

**验证标准**：`vp check` 零错误。

---

## 阶段 2：Owner 系统纯化

**目标**：去掉 `isLightweight` 相关逻辑，所有 Owner 平等。

- [ ] `createOwner()` 去掉 `lightweight` 参数
- [ ] `disposeOwner` 移除 `isLightweight` 分支（所有 Owner 都清理 elements）
- [ ] `triggerMount` 移除轻量 Owner 透传逻辑
- [ ] 确认 `removeNode` 的幂等性保护保留或移除（按设计决定）
- [ ] `vp check` 通过
- [ ] 现有相关测试通过（`owner.test.ts`、`dispose-owner.test.ts`、`lifecycle.test.ts`）

**验证标准**：Owner 相关测试全部通过。

---

## 阶段 3：`toHResult` + `adoptResult`

**目标**：新增两个核心工具函数，暂不接入调用方。

- [ ] 实现 `toHResult(child: any): HResult`（按设计文档 4.5 节）：
  - [ ] `isHResult` 分支
  - [ ] `isUse` 分支（信号→文本绑定，stop 归入 cleanups）
  - [ ] `isFunction` 分支（调用后递归）
  - [ ] `isArray` 分支（`flat()` 后遍历合并）
  - [ ] `isNode` 分支（原生 DOM 节点透传）
  - [ ] `isNil` 过滤
  - [ ] catch-all 文本节点
- [ ] 实现 `adoptResult(owner, hr): HostNode[]`（按设计文档 4.4 节）：
  - [ ] 边界路径：`hr.owner` 非空 → 只挂接 Owner，不吸节点
  - [ ] 非边界路径：吸收 nodes、pending、cleanups
- [ ] 编写独立测试：`toHResult` 覆盖所有分支类型
- [ ] 编写独立测试：`adoptResult` 覆盖边界/非边界、pending 挂接、cleanups 合并
- [ ] `vp check` 通过

**验证标准**：工具函数独立测试通过。

---

## 阶段 4：`h()` 重写（DOM 元素分支）

**目标**：重写 `handleDomMode`，替换旧的 `nestBind` 内部逻辑。

- [ ] 重写 `handleDomMode` 按 4.1.1 节：
  - [ ] 创建 pending/cleanups/allNodes
  - [ ] setProps + cleanups 收集
  - [ ] 遍历 children → `toHResult` → 合并结果
  - [ ] `adapter.append` 插入子节点
  - [ ] 返回新结构 HResult
- [ ] 调整 `h()` 函数签名的组件/指令分支（4.1.2 节）：
  - [ ] 指令调用 `handleDirectiveMode`，组件调用 `handleComponent`
  - [ ] 直接返回 childHr 不做额外处理
- [ ] Fragment 路径确认（当前 `handleComponent` 处理，暂不修改）
- [ ] 旧 `processChildren` / `nestBindPrimitive` / `handleSignalChild` 保持暂时可用
- [ ] 确保 `h("div", null, "text")`、`h("span")`、`h("div", null, h(Comp))` 基本路径工作
- [ ] `vp check` 通过

**验证标准**：简单 h() 调用不崩溃，输出结构正确。

---

## 阶段 5：`handleComponent` + `handleDirectiveMode`

**目标**：组件和指令执行路径切换到新模型。

- [ ] 重写 `handleComponent` 按 4.2 节：
  - [ ] 创建 owner、context
  - [ ] 调用组件函数 → `toHResult` 返回值
  - [ ] `adoptResult(owner, childHr)` 吸收
  - [ ] 返回边界 HResult
  - [ ] 异步组件路径（4.6 节）：占位注释 → resolve 后 `adoptResult` + `adapter.replace`
- [ ] 重写 `handleDirectiveMode` 按 4.3 节：
  - [ ] 创建 owner、context
  - [ ] `toHResult` children → `adoptResult` → `isElement` 过滤
  - [ ] 调用指令函数
  - [ ] 返回边界 HResult
- [ ] 移除旧的 `nestBind`、`nestBindResult`、`nestBindPrimitive`、`processChildren`、`handleSignalChild`
- [ ] `vp check` 通过
- [ ] 现有组件/指令测试通过

**验证标准**：组件渲染、指令挂载、异步组件全部正常。

---

## 阶段 6：控制流组件适配

**目标**：Show / Case / Each 使用新 `adoptResult`，不再依赖轻量 Owner。

- [ ] `initAnchor` 更新：不再创建轻量 Owner，只返回锚点节点
- [ ] `adoptBranch` 更新：使用 `adoptResult` 替代手动的 owner 连接 + before 插入
- [ ] `subscribeSignal` 确认：不依赖 Owner 类型
- [ ] Show 组件适配
- [ ] Case 组件适配
- [ ] Each 组件适配
- [ ] 控制流测试全部通过
- [ ] `vp check` 通过

**验证标准**：`tests/core/control-flow.test.ts`、`control-flow-toggle.test.ts`、`nested-control-flow.test.ts` 通过。

---

## 阶段 7：Portal 适配

**目标**：Portal 改为持久 Owner 组件，节点所有权转移。

- [ ] Portal 内部使用持久 Owner
- [ ] `adoptResult(portalOwner, childHr)` 吸收子内容
- [ ] `childHr.nodes.splice(0)` 转移节点所有权
- [ ] 节点移动到目标容器
- [ ] 返回锚点 HResult
- [ ] Portal 测试通过
- [ ] `vp check` 通过

**验证标准**：`tests/core/portal-extreme.test.ts` 通过。

---

## 阶段 8：`createApp` + adapter 接口

**目标**：`createApp` 适配新 HResult，`adapter` 增加 `isElement`。

- [ ] `createApp` 使用 `adoptResult(rootOwner, hr)` 替代手动 owner 连接
- [ ] DOM adapter 新增 `isElement` 实现
- [ ] SSR adapter 新增 `isElement` 实现
- [ ] `create-app.test.ts` 通过
- [ ] `vp check` 通过

**验证标准**：createApp 挂载/卸载正常。

---

## 阶段 9：清理

**目标**：删除旧代码、更新类型导出、修复测试。

- [ ] 删除 `childResults` 相关引用
- [ ] 删除旧 `createHResult` 重载
- [ ] 删除 `nestBind`、`nestBindResult`、`nestBindPrimitive`、`processChildren`、`handleSignalChild`
- [ ] 删除 `isLightweight` 相关测试
- [ ] 更新测试文件中所有 `h()` 结果的断言方式（如有变化）
- [ ] 全局 `vp check --fix` 通过
- [ ] 全局测试通过
- [ ] 构建通过

**验证标准**：全量测试 404+ pass，`vp check` 零错误，构建通过。

---

## 风险与暂停点

| 步骤   | 风险                                                       | 暂停点                                      |
| ------ | ---------------------------------------------------------- | ------------------------------------------- |
| 阶段 3 | `toHResult` 的信号绑定 cleanup 路径是否正确                | 需要确认 `use(signal, fn)` 返回的 stop 行为 |
| 阶段 4 | `h()` 重写后 `adapter.append` 顺序是否与旧 `nestBind` 一致 | 需要运行现有 h.test.ts 验证                 |
| 阶段 5 | 异步组件的 `adoptResult` + `replace` 时序                  | 需要确认 resolve 后 `owner.disposed` 判断   |
| 阶段 6 | 控制流组件 `adoptBranch` 中的 `adapter.before` 行为        | 需要确认 anchor 插入逻辑                    |
| 阶段 7 | Portal `splice(0)` 后节点仍在之前路径中                    | 需要确认无双重清理                          |
| 阶段 9 | 删除旧代码后是否有遗漏引用                                 | 需要全局 `vp check` 兜底                    |
