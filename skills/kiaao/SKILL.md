---
name: kiaao
description: Build reactive UIs with the kiaao framework — a pure-runtime, zero-virtual-DOM alternative to Solid, React, and Vue. Use when writing kiaao components, using `use()` to create `Signal<T>` state, using `<Show>`/`<Each>`/`<Case>` control flow, configuring JSX/TSX, working with kiaao lifecycle, router, SSR, motion, or any task mentioning kiaao.
license: MIT
---

# kiaao

kiaao 是一个纯运行时、零虚拟 DOM 的响应式 UI 框架。

## 何时应用此 skill

出现以下任一信号时加载：

- 导入路径含 `kiaao`，或代码使用 `use(`
- 出现 `<Show>` / `<Each>` / `<Case>` 控制流组件
- 涉及 kiaao 内置模块：router / motion / ssr / astro / lynx
- 用户提到 kiaao、Signal、显式响应式

## 文档查找（核心功能）

kiaao 文档随 kiaao npm 包一起发布，**不是随 skill 安装**。SKILL.md 只做引导，所有具体内容在 `node_modules/kiaao/` 下。

### 标准路径（cwd 是项目根）

- **README**（Quick Start、对比）：`./node_modules/kiaao/README.md`
- **用户文档**（按主题）：`./node_modules/kiaao/guide/`
- **agent 提示**（反模式、版本检查）：`./node_modules/kiaao/agent/`

### 找不到 kiaao 安装位置时

按顺序尝试：

1. 直接尝试 `./node_modules/kiaao/`（npm/pnpm 平铺安装）
2. `find . -path '*/kiaao/package.json'` 搜索（monorepo / pnpm 严格模式）
3. `pnpm why kiaao` 或 `npm ls kiaao`（包管理器自带）

### 如果 npm 包不存在

询问用户项目结构和包管理器。

## 必读（首次写 kiaao 代码时按顺序读）

1. `./node_modules/kiaao/README.md` — 最小可运行应用、import、mount
2. `./node_modules/kiaao/guide/jsx-setup.md` — jsxImportSource、tsconfig、构建工具
3. `./node_modules/kiaao/guide/components.md` — 组件函数、props、children、Owner
4. `./node_modules/kiaao/guide/control-flow.md` — Show、Each、Case
5. `./node_modules/kiaao/guide/reactivity.md` — Signal、use()、派生、isUse、toValue、逻辑只读

**写代码前必读**：`./node_modules/kiaao/agent/anti-patterns.md`（Solid/React/Vue 反模式对照 + 关键术语）

## 具体 API（按主题）

- 生命周期：`./node_modules/kiaao/guide/lifecycle.md`
- 路由：`./node_modules/kiaao/guide/router.md`
- SSR：`./node_modules/kiaao/guide/ssr.md`
- 动效：`./node_modules/kiaao/guide/motion.md`
- 指令：`./node_modules/kiaao/guide/directives.md`
- 属性处理：`./node_modules/kiaao/guide/attributes.md`
