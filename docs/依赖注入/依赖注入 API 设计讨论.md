# 依赖注入 API（context）设计讨论

**状态：** 已收敛（最终结论：不引入任何新机制，见 5.9、第六节）
**最后更新：** 2026-09-25
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

> **后续更新（2026-09-21）**：本节的 Crank 方向在第五节的讨论中被修正——结论倾向**不引入 provide/consume**，改由组件工厂承载同一需求。上文四项待决问题保留为决策轨迹。

---

## 五、后续讨论（2026-09-21）：方向修正为组件工厂

### 5.1 重新诊断：缺的不是"依赖注入"，而是"跨定义位置的闭包共享"

|                | React                                    | kiaao                                                  |
| :------------- | :--------------------------------------- | :----------------------------------------------------- |
| 闭包寿命       | 每次渲染新建 → 闭包过期，不能承载共享    | 组件只运行一次 → **闭包永久稳定，天然是共享容器**      |
| 因此共享只能靠 | context / 状态提升（闭包过期，别无选择） | 闭包本可承担，但闭包绑定**定义位置**，不是**挂载位置** |

在 React 中"不要在渲染中创建组件"是铁律（闭包会过期、组件身份会变、导致卸载重挂）；kiaao 中这条铁律**不存在**——这是"组件只运行一次"赋予的特别能力。

由此产生特别问题：数据在 A 处创建、组件定义在 B 处，而 kiaao 没有"运行时按树位置查询"的通道。注意这**不是**"缺少依赖注入"——缺的是**跨定义位置的闭包共享**。

三种对齐"数据"与"组件定义"的手段：

| 手段               | 做法                    | 代价                                 |
| :----------------- | :---------------------- | :----------------------------------- |
| 把组件搬到数据处   | **组件工厂**            | 牺牲组件独立性；未消除透传（见 5.9） |
| 把数据搬到组件处   | props 显式传递 / 模块级 | 逐层透传                             |
| 都不搬，运行时解析 | provide / consume       | 第二套作用域模型 + 渲染期通道        |

推论：**provide/consume 的唯一纯粹价值增量是"定义位置无关"**——它不解决其他任何问题。于是整个决策可压缩为一句话：

> **"定义位置无关性"值不值得引入第二套作用域模型？**

### 5.2 隐式注入无法"轻量"实现

若走 provide/consume，有一项不可绕过的技术前提：

- **时序**：子组件函数在父组件运行期内同步执行（`h(Child)` 即执行），而 `owner.parent` 在父组件运行结束后才由 `adoptResult` 绑定 → **组件运行期读不到父链**（`docs/game/Kiaao ECS 框架设计文档.md` 8.12 节的结论）
- **历史决策约束**：2026-06-23"`currentOwner` vs `[Owner, Node[]]` 方案对比"中选择了显式返回值方案（彻底消除全局状态）。而 provide/consume 需要**向下**传递环境，与返回值的**向上**通道方向相反
- **JSX 约束**：JSX 编译为模块级 `jsx()` 调用，无法携带调用方的 ctx → "纯显式参数下传 scope"不可行
- **急求值约束**：kiaao 的 children 是已渲染的 HResult（非 React 的惰性元素描述），故 `<Provide>` 组件形态**单独不成立**——children 回调内部使用的仍是模块级 `h`，仍需要通道

结论：provide/consume 的必要条件是**渲染期向下通道**（受控全局状态，如 `handleComponent` 内 push/pop 的作用域栈）。这不是"实现难度"问题（实现约几十行），而是**概念成本**：kiaao 将同时拥有词法作用域（闭包）与动态作用域（树查询）两套模型——这才是真正的不完备。

可行性备注（"若做"的备选，非当前方向）：作用域栈方案在控制流组件下天然工作——Show/Each/Case 均经 `handleComponent`，item 组件运行时的栈为 `[父Owner, ShowOwner, itemOwner]`，沿栈向上查询语义正确，无需特判。

### 5.3 结论倾向：走组件工厂

> **注（复盘）**：本节及 5.4–5.6 的工厂方向已在 **5.9** 中修订——最终结论为不引入任何新机制；以下保留为决策轨迹。

**依赖作为工厂参数显式注入，而非按树位置隐式查找。**

- 与 spec 1.3（显式依赖）、1.5（闭包即作用域）严格同构
- spec 1.5 末句已预见此答案："多个组件实例共享状态时，使用工厂函数创建独立闭包"
- 用**代码组织纪律**替代**框架机制**：纪律无运行时风险、无 SSR 问题、可静态阅读；机制则有通道、有边界、有概念债
- 收益：多实例天然、SSR 并发安全、零透传、类型完整、全程显式

### 5.4 工厂形态：`createXxx(deps)` 返回组件包

> **注（复盘）**：本形态已在 5.9 中被否定——它牺牲"组件作为模块导出符号"，且未消除透传。

修正早期判断（曾认为"组件必须定义在提供者函数体内，跨文件拆分不可行"）：跨文件仍然可行——工厂定义在独立文件，调用在使用处：

```tsx
// views.tsx —— 组件定义保留在独立文件
export function createBreakoutUI(instance: BreakoutInstance) {
  const { state, useEntity, movement, boundary, collision } = instance;

  function Ball({ data }: { data: BallData }) {
    /* 闭包捕获 instance */
  }
  function Hud() {
    /* 订阅 instance 的全局状态信号 */
  }

  return { Ball, Hud };
}

// game.tsx —— 实例级调用一次（非列表项级）
const instance = createBreakoutInstance(ctx); // 信号/资源挂 ctx.owner
const ui = createBreakoutUI(instance);

return (
  <div>
    <ui.Hud />
    <Each value={instance.state.balls} keyed={(v) => v.id}>
      {({ item }) => <ui.Ball data={item()} />}
    </Each>
  </div>
);
```

样板成本：把 `import` 换成一次工厂调用。附带一项 kiaao 特有性质：**工厂返回的组件每次调用都是新函数身份，而 kiaao 不做类型 diff（无 vdom）→ 零陷阱**；同一写法在 React 中是灾难（组件身份变化导致卸载重挂）。

### 5.5 渐进四档（5.9 修正版）

| 档  | 手段                               | 组件独立性 | 透传对象           | 代价                              | 定位                     |
| :-- | :--------------------------------- | :--------- | :----------------- | :-------------------------------- | :----------------------- |
| 1   | 模块级共享                         | 保留       | 无                 | 应用级共享（多实例 / SSR 串数据） | 真全局；合法默认         |
| 2   | 组件内 `context.use` + props       | 保留       | 依赖（通常 1 个）  | 逐层透传                          | 需要实例隔离时的既有做法 |
| 3   | 工厂返回组件包                     | **牺牲**   | 组件包（可能多个） | 未消除透传                        | **5.9 已否定，不作推荐** |
| 4   | provide / consume                  | 保留       | 无                 | 第二套作用域模型                  | 不引入                   |
| 5   | 用户态 provide / consume（第六节） | 保留       | 无                 | 渲染期无值 + 异步组件/SSR 无解    | **6.4 否证**             |

最终收敛（5.9 + 6.5）：不引入新机制；档 1 与档 2 均为既有原语，选哪个由开发者依场景决定，文档不做架构规范。

### 5.6 三条纪律（随工厂方向一并废弃，保留作轨迹）

1. 实例类依赖一律走工厂参数；模块级只放真全局与纯函数/常量
2. 组件包按"实例"创建一次，不在列表 item 级调用工厂（否则每项一份闭包）
3. 需要谁的数据，就把它作为工厂参数——**工厂签名即依赖清单**（显式依赖的延续）

### 5.7 盲区与 kiaao 风格替代

| 盲区                | 说明                                                                              | 替代                                                   |
| :------------------ | :-------------------------------------------------------------------------------- | :----------------------------------------------------- |
| 嵌套覆写            | `<Theme value="dark">` 内所有后代自动变暗——工厂做不到，除非把整个子树定义进工厂   | CSS 变量 / 类切换（多数场景不需要 JS 通道）            |
| compound components | Select/Option、Menu/MenuItem 等库组件，库作者不能假设使用者把组件定义在其函数体内 | **显式作用域**：容器组件用函数 children 交出作用域对象 |

```tsx
// kiaao 风格的 compound components：显式参数，非隐式查询
<Select>{(scope) => <Option scope={scope} />}</Select>
```

不需要栈、不需要第二套模型、类型安全、多实例天然；代价是写法略啰嗦，但符合 1.3 显式依赖。

### 5.8 本次讨论后的待决问题

> 原 4.3 的四项待决问题（命名 / 可见性 / consume 未命中行为 / 与游戏实例的关系）仅在方向反转回 provide/consume 时才需回答，保留不删。

1. **需求验证**："免除中间层透传"的痛点强度——若树通常 2–3 层，档 2 足够，工厂只是更整齐；若常见 5 层以上，工厂为刚需。游戏示例当前的主要动机是解除模块级单例（多实例 / SSR），而非透传深度
2. **嵌套覆写是否真实存在**：若不存在，provide/consume 的最后一个理由不成立，本文档可按"不引入"收尾
3. ~~**工厂模式是否升为官方推荐**~~ → **已否定（2026-09-21 复盘）**：工厂包不作推荐，落点见 5.9
4. **关联文档同步**：**已完成（2026-09-21）**，并经复盘修正——`docs/spec.md` 1.5 补充段精简为"不引入 provide/consume"；ECS 8.12 更新注记改指 `context.use` + props；`agent/anti-patterns.md` 改写为"语义事实 + 最朴素的隔离做法"；`guide/components.md` 工厂示例已回退
5. **示例重构**（可选，验证手段）：若后续需要演示实例隔离，改为"组件内 `context.use` 创建 + 实例经 props 传递"；否则保持模块级（合法默认）
6. ~~**形态细节**（若工厂落实）：`createXxxUI` 的返回类型工具、组件包与 Each / props 的配合约定~~ → 随工厂方案否定而关闭

### 5.9 第二轮复盘（2026-09-21）：工厂包被否，结论收敛

5.4 / 5.5 把"工厂返回组件包"作为推荐方案，存在两处判断错误：

1. **概念混淆**：把"工厂包"与"多实例"绑定。多实例实际只需既有原语组合——`context.use` 在组件内创建（生命周期归组件）+ 实例对象经 props 传递；与工厂包无关
2. **低估组织代价，且算错了收益**：工厂包牺牲"组件作为模块导出符号"（不能 `import { Board }`、测试需构造工厂调用、模块接口由多个组件粗化为一个工厂）；且它并未消除透传——只是把透传对象从"依赖"（通常一个对象）换成"组件包"（可能多个），**净收益可能为负**

**最终结论（收敛版）**：

- 框架职责 = 提供原语（模块级 `use`、`context.use`、props）+ 说明各自语义；**不规定**用哪个原语解决哪类问题
- 模块级单例是**合法默认**，不需要被"纠正"，只需要被准确描述（应用级共享 / 不随卸载清理 / SSR 跨请求共享）
- 需要每实例独立状态时，既有原语已足够：`context.use` + props
- **不引入任何新机制**：provide/consume 不做，工厂包不作推荐

**修正落点**：`guide/components.md` 工厂示例已回退；`docs/spec.md` 1.5 补充段精简为"不引入 provide/consume"；ECS 8.12 更新注记改指 `context.use` + props；`agent/anti-patterns.md` 该节改写为"语义事实 + 最朴素的隔离做法"。

---

## 六、第三轮讨论（2026-09-25）：用户态实现路线与最终否证

第五节的结论是"框架不引入"。本轮追问一个更弱的问题：**把 provide/consume 降级为用户态工具（不进核心、零框架改动），是否可行？** 结论是：用户态形态确实成立，但它的存在**恰恰暴露了隐式注入的通病**——渲染期无值——并且"等绑定后再解析"的补救方式仍然死在两个它想解决的场景上。最终连同用户态路线一并否证。

### 6.1 用户态路线的成立部分

只使用公开 API（`ctx.owner`、`ctx.onMount`、`ctx.use`），即可实现一套按 Owner 树就近查询的 context：

```ts
// 应用层工具（示意，非最终代码）
const contextPoolKey = Symbol();

function createContext(defaultValue: unknown) {
  const key = Symbol(); // 闭包捕获——使用者不需要自备 token
  return {
    provide(ctx: Context, value: unknown = defaultValue) {
      // owner[contextPoolKey] ??= new Map(); owner[contextPoolKey].set(key, value)
    },
    consume(ctx: Context) {
      // 沿 ctx.owner.parent 上行，就近命中；未命中返回 defaultValue
    },
  };
}
```

- 数据挂在 Owner 的 `WeakMap`/`Map` 元数据上：多实例天然隔离、随 Owner 回收，注册表不需要框架参与创建或清理
- 就近覆盖（嵌套 Provide）自然生效
- 零核心改动、零新 API、无渲染期向下通道

### 6.2 结构性代价：渲染期无值

两条既有事实叠加：

1. **children 急求值**（见 5.2）：子组件函数体先于父组件函数体执行
2. **父链在 adopt 阶段才写**：`owner.parent` 由 `adoptResult` 在组件返回后绑定，整棵树要等根组件返回才完整

推论：**渲染期按树位置查询没有可依赖的时钟**——不是实现难度问题，而是没有时刻能让消费者既在其自身函数体内、又拥有已绑定的祖先链。因此 consume 在 body 内只能拿到 defaultValue（或 undefined），真实值最早出现在 `onMount`（此时整棵树的链已接好；且 `triggerMount` 自顶向下，祖先先于后代执行，provider 在 body 同步注册即可保证消费者一定能命中）。

### 6.3 立即可用的补救：consume 返回信号

若只牺牲"同步渲染即可读"，用既有通道可以缝合：

```ts
// 应用层工具（示意，非最终代码）
function consume(ctx: Context, key: symbol, defaultValue: unknown) {
  const ready = ctx.use(false);
  const value = ctx.use(ready, () =>
    ready() ? (lookup(ctx.owner, key) ?? defaultValue) : defaultValue,
  );
  ctx.onMount(() => ready(true));
  return value; // Signal<T>——挂载后自动切换为真实值
}
```

挂载是同步的（`append` 与 `triggerMount` 在同一次任务内），首帧为 defaultValue、paint 之前已换成真实值，纯客户端场景不闪烁；Show/Each 后续新造的分支，`adoptBranch` 也在同一次同步调用内 `triggerMount`，同样成立。

**边界与代价**：

- **SSR 失效**：`renderToString` 不触发 mount，输出只有 defaultValue / 占位（hydration 同样 mismatch）
- **一次性语义**：异步写入不补发，消费者已解析就永远看不到
- **每个消费站点**多一个派生信号（外加 onMount 回调）；错误暴露时机从 `createApp()` 移到 `triggerMount` 期间
- **指令无法消费**：`DirectiveContext` 只有 `{ onMount, onUnmount, use }`，没有 owner

### 6.4 为何仍然否证：两个致命场景

6.3 的"信号缝合"只缝合了同步路径。剩下两个场景，用户态方案和框架态方案一起失效：

1. **渲染期创建、且需要立即求值的消费者**——`Each` 的 item 组件（`docs/game` 的 `Ball` 是最真实的使用者：`useEntity` 需要在 item 注册阶段就拿到游戏实例）、`Show` 分支、列表项内的 Tabs/Panel。这些消费者对状态的需求是**注册期立即求值**，不是"挂载后响应"——信号缝合对它们无效。渲染期无值无法在用户态解决：这正是它需要通道的原因，也正是文档 §5.2 分析的那条根本约束。
2. **异步组件**（`lazy` / 组件返回 Promise）——三个症结：
   - **解析时刻不确定**：resolve 时渲染 pass 已结束，消费者若在首帧已按 defaultValue 落地，**先渲染、后到达**的 provider 无法纠正（一次性语义）
   - **同步栈不可用**：框架态方案依赖 `h(component)` 期间 push/pop 的作用域栈，而 resolve 发生在栈已退出之后，栈无法重建（用户态沿链查询可读，但如上一症结所述，读到的时机不确定）
   - **SSR 下缺失**：`lazy` 直接返回占位注释（`lazy-ssr`），该分支的 context 完全缺失

§5.8 的**痛点标定**（透传 2–3 层时既有原语已足够；5 层以上才构成刚需）与本轮否证结合后，最终结论收束为：

> **隐式注入（无论框架态还是用户态）的代价结构是「渲染期无值 + 异步注册/异步组件无解 + SSR 不可用」；它想解决的定义位置无关性，收益不足以覆盖这些代价。**

### 6.5 尘埃落定

- **最终结论**：不引入 provide/consume（框架态与用户态均不做）；如需类似能力，回到既有原语——模块级共享（应用级）、`context.use` + props（实例级）、显式函数 children（库组件局部 scope，见 5.7）
- **不成立的前提**（供后来者避免重复推导）：任何“等绑定后再解析”的变体，本质上都要求消费者接受「首帧无值」——而这恰恰否定了它想解决的渲染期使用场景
- **验证方法**（供后续复用）：判断一个隐式注入提案是否可行，只需三问——**渲染期能否读到？异步注册/异步组件能否读到？SSR 是否可用？** 三问中出现两个"否"即可否证，无需再推导形态

---

_讨论记录于 2026-08-21；2026-09-21 追加第五节，同日经第二轮复盘收敛为最终结论：不引入任何新机制（见 5.9）；2026-09-25 追加第六节，用户态实现路线（不进核心）同样否证，最终结论以第六节为准。_
