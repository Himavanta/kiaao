# Kiaao Lynx Rspeedy 插件开发推进跟踪

**状态**：已关闭
**原因**：最终采用原生 Rspack（单入口主线程模式），Rspeedy 插件路线废弃。
**关闭日期**：2026-07-02
**最后更新**：2026-07-02

---

## 总体目标

开发一个 Rspeedy 插件（`pluginKiaaoLynx`），正确处理 Lynx 双线程架构，使 kiaao 应用能在 Lynx 上正常运行。

---

## 推进规划

### 阶段 1：最小 Rspeedy 插件骨架

**目标**：编写一个空的 Rspeedy 插件，加载到 lynx.config.ts 中，构建通过。

**输出**：

- `src/lynx/plugin/index.ts` — 插件入口
- `lynx.config.ts` — 从手动 `tools.rspack.plugins` 改为加载插件

**验证**：`vp pack` + `pnpm build` 通过。

**状态**：⬜ 待开始 | **授权**：⬜

---

### 阶段 2：入口分层

**目标**：将单入口拆分为主线程入口 + 后台入口。

**具体工作**：

- 主线程入口注入全局钩子（`renderPage`、`processData` 等）
- 后台入口注入 kiaao 运行时
- 使用 Rspeedy 的 `api.modifyBundlerChain()` 和 `LAYERS` 实现分层

**参考**：Vue-Lynx 的 `applyEntry()` 函数

**输出**：

- 构建产物中同时出现 `main.js`（后台）和 `main__main-thread.js`（主线程）

**状态**：⬜ 待开始 | **授权**：⬜

---

### 阶段 3：LynxTemplatePlugin 配置

**目标**：正确配置 `LynxTemplatePlugin`，包括 `chunks` 参数指定主/后台入口。

**具体工作**：

- 设置 `chunks: [mainThreadEntry, bgEntry]`
- 设置 `dsl`、`intermediate`、`filename` 等选项
- 移除 `tools.rspack.plugins` 中的手动 `LynxTemplatePlugin` 和 `LynxEncodePlugin`

**参考**：Vue-Lynx 的 `LynxTemplatePlugin` 配置

**输出**：

- 生成正确的 `.lynx.bundle`，主/后台代码正确分离

**状态**：⬜ 待开始 | **授权**：⬜

---

### 阶段 4：RuntimeWrapperWebpackPlugin

**目标**：后台 JS 添加 `RuntimeWrapperWebpackPlugin` 包装。

**具体工作**：

- 在 bundler chain 中添加 `RuntimeWrapperWebpackPlugin`
- 排除主线程入口（主线程不需要包装）

**参考**：Vue-Lynx 的 `RuntimeWrapperWebpackPlugin` 配置

**状态**：⬜ 待开始 | **授权**：⬜

---

### 阶段 5：主线程标记 + 启动代码

**目标**：类似 `VueMarkMainThreadPlugin`，确保主线程入口的工厂函数被执行。

**具体工作**：

- `additionalTreeRuntimeRequirements` 强制生成 `__webpack_require__(entryModuleId)`
- 标记主线程 asset 为 `lynx:main-thread: true`

**参考**：Vue-Lynx 的 `VueMarkMainThreadPlugin`

**输出**：

- 不再出现 `processData is not a function` / `renderPage is not a function`

**状态**：⬜ 待开始 | **授权**：⬜

---

### 阶段 6：LynxEncodePlugin + 完整构建验证

**目标**：所有插件就位后，完整构建 + 真机验证。

**具体工作**：

- 添加 `LynxEncodePlugin`
- `vp pack` + `pnpm build` + 真机测试
- 确认 `hello world` 渲染

**状态**：⬜ 待开始 | **授权**：⬜

---

### 阶段 7：清理 + 文档更新

**目标**：清理过渡代码，更新文档。

**具体工作**：

- 删除不再使用的文件
- 更新 `docs/lynx/适配器开发记录.md`
- 更新 `docs/lynx/Rspeedy 插件开发记录.md`（本文档）为完成状态

**状态**：⬜ 待开始 | **授权**：⬜

---

## 当前决策记录

| 日期       | 决策                                                            |
| ---------- | --------------------------------------------------------------- |
| 2026-07-02 | 走 Rspeedy 插件路线（Vue-Lynx 模式），不采用 SolidJS 单入口模式 |
| 2026-07-02 | 每完成一步需用户授权，不确定时讨论后再继续                      |
| 2026-07-02 | `comment()` 保留 `__CreateWrapperElement`                       |
