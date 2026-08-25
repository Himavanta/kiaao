# 依赖注入 API（context）设计讨论

**状态：** 讨论中（设计未定稿）
**最后更新：** 2026-08-21
**相关仓库：** [Himavanta/kiaao](https://github.com/Himavanta/kiaao)

---

## 一、背景与动机

组件树中共享数据/逻辑，目前只能逐层传 props——嵌套深时样板膨胀。典型案例（游戏示例）：

```
Game（组装层）
├─ systems + useEntity → Brick / Ball（注册实体用）
├─ stateEntity → Hud / ReadyBall / Overlay
├─ paddle → PaddleView / ReadyBall
└─ onRestart → Overlay
```

**需求**：组件可以在自己的作用域内"提供"数据，任意后代"获取"——不需要知道中间层级，不需要逐层传递。

**参考场景**（非游戏）：`select`/`option` 类组件通信、drag-and-drop、主题/语言切换。

---

## 二、kiaao 现状

kiaao 的 `Context` = 组件运行时上下文（组件函数第二个参数）：

```ts
interface Context {
  onMount: (fn: () => void | Promise<void>) => void;
  onUnmount: (fn: () => void | Promise<void>) => void;
  use: UseFunction; // 信号创建/订阅
  owner: Owner;
}
```

**没有** React 式 createContext（数据提供/消费机制）——`createContext` 这个名字已被"创建组件上下文"占用（内部函数）。

组件模型：函数组件一次性执行，无重渲染概念；UI 更新通道 = 信号（use/Each/Show）。

---

## 三、三个参考设计

### 3.1 React：createContext + Provider 组件 + useContext

```tsx
const GameCtx = createContext(defaultValue);
<GameCtx.Provider value={handle}>...</GameCtx.Provider>;
const handle = useContext(GameCtx);
```

- Provider 是 JSX 组件——**可见性**好（数据从哪提供一眼可见）
- **响应式**：value 变化 → 订阅的消费者重渲染
- 依赖 React 的"组件重渲染"模型

### 3.2 Vue：provide / inject

```ts
// setup 内：
provide("greeting", greeting);
const greeting = inject("greeting");
```

- 方法调用形态，无 Provider 组件
- **惰性查询**：inject 不建立响应式订阅（默认非响应，传 ref/reactive 才响应）——这是 Vue 已知的"坑"（用户以为响应、实际不响应）

### 3.3 Crank：Context 方法 provide / consume

```ts
this.provide("greeting", greeting);
const greeting = this.consume("greeting");
```

- 挂在 Context 上的两个方法（与 kiaao 的 ctx 形态同构：`this` ≈ `ctx`）
- **惰性查询**：consume 读取最近祖先提供值——**明确不自动刷新消费者**：

> "Crank does not link providers and consumers in any way, and doesn't automatically refresh consumer components when provide is called. It's up to you to ensure consumers update when providers update."

- **任何值可作 key**（推荐 Symbol——私有、防冲突）
- 无 Provider 组件概念

---

## 四、分析

### 4.1 核心规律：信号框架的 context 全部是惰性查询

| 框架  | context 响应性            | 模型        |
| :---- | :------------------------ | :---------- |
| React | 响应式（订阅）            | 重渲染模型  |
| Vue   | 惰性（默认）              | 信号（ref） |
| Crank | 惰性（明确告诫）          | 无重渲染    |
| Solid | 惰性（useContext 不追踪） | 信号        |

**响应式 context 是"组件重渲染"模型的产物**：value 变化要驱动消费者重跑组件，所以必须建订阅。信号框架里组件不重跑——UI 更新通道是信号本身——context 再做一遍反应式传播 = **两套反应机制并存**（context 订阅 + 信号订阅），机制冲突。

**结论：kiaao 的 context 只负责"引用传递"，不负责"更新传播"**——响应性留给信号（provide 传信号，consumer 用 `use` 订阅）。这是架构收敛：一个反应通道（信号）胜过两个。

### 4.2 三参考对比

|               | React（Provider 组件+响应式）        | Vue（provide/inject）                     | Crank（ctx 方法+惰性）                                                                                 |
| :------------ | :----------------------------------- | :---------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| 形态          | JSX 包裹，显式                       | setup 内方法调用                          | ctx 方法调用                                                                                           |
| 响应性        | 有（重渲染驱动）                     | 无（默认惰性，Vue 的坑）                  | 无（明确告诫）                                                                                         |
| 与 kiaao 契合 | Provider 组件 = "空壳组件"，概念负担 | 形态可行，但"inject 非响应"是用户常踩的坑 | ctx 已存在——加两个方法零新概念                                                                         |
| 免疫性        | 订阅模型有一堆边界情况               | 一般                                      | 惰性查询免疫 Provider 形态的坑（条件分支 provide、卸载后 consume、同名覆盖——查询当下链，无订阅无状态） |
| 多实例隔离    | ✓（Provider 值随树）                 | ✓                                         | ✓（owner 链）                                                                                          |

### 4.3 推荐方向

**以 Crank 为主参考**：

- `ctx.provide(key, value)` / `ctx.consume(key)`——方法形态，零新概念（ctx 已是组件参数）
- 惰性查询——免疫订阅模型的边界情况
- 任何值可作 key（Symbol 与 kiaao 实体 id 哲学一致；字符串可读性更好——可全支持，零成本）
- **响应性由信号承担**——provide 传信号，消费者 `use(signal)` 订阅——文档明确此契约

**待决问题**：

1. **命名**：`provide/inject`（Vue 直觉）vs `provide/consume`（Crank，避免与"依赖注入"概念混淆，"消费"更贴近读取语义）——倾向 consume
2. **可见性**：Provider 组件形态的隐性价值是 JSX 可见性（一眼看出谁提供数据）；ctx 方法形态下 JSX 看不出——函数式框架靠阅读函数体，是否接受此取舍？是否用命名约定/文档弥补？
3. **consume 的边界行为**：未找到 provide 时返回 undefined？抛错？（开发模式警告？）——与 kiaao 现有"disposed 后调用警告"风格一致
4. **与游戏实例的关系**：`Game` 组件 provide 游戏句柄（systems/useEntity/stateEntity/paddle 收敛为一个对象），子组件 consume——多实例天然隔离（每个 Game 实例的 owner 链不同）——此为验证场景，不是设计前提

---

_讨论记录于 2026-08-21，待用户确认方向后进入具体 API 设计。_
