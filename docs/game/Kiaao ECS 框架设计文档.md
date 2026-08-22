# Kiaao ECS 框架设计文档

**状态：** 设计讨论中（v3 迭代）
**最后更新：** 2026-08-21
**相关仓库：** [Himavanta/kiaao](https://github.com/Himavanta/kiaao)

---

## 一、背景与目标

### 1.1 讨论起点

本讨论始于对 Kiaao 框架 **"hydration 机制"** 的探讨，随后自然延伸到了 **ECS（Entity-Component-System）架构** 在 Web 前端场景下的应用可能性。

核心认识：Web 和游戏在架构上有本质差异——

- **Web**：树状结构（DOM），事件驱动
- **游戏**：扁平数据集，帧驱动

### 1.2 目标定位

Kiaao 的游戏扩展定位为 **"学习研究型游戏框架"**：

- 优先考虑开发体验和心智模型
- 性能优化是次要目标（但架构上保持可扩展）
- 适合：回合制 RPG、模拟经营、卡牌游戏、文字冒险
- 不适合：3A 级 3D 大作、极致粒子优化

### 1.3 设计哲学

> **尽量少的 API，更简单透明的引擎模型，让使用者在完全符合直觉的情况下用 JS 处理游戏逻辑。**

引擎内核只有三样东西：

```
实体池（Map<EntityId, EntitySignal>）  —— 数据在哪
帧循环（系统流水线）                  —— 逻辑什么时候跑
帧管理器（frame(id) / frame(id, fn)） —— 数据怎么读写
useEntity（组件注册实体）             —— 实体怎么诞生
```

其余全是"系统库"（movement/boundary/collision）和"游戏层"（规则/音效）——**没有事件机制、没有订阅表、没有 Proxy、没有魔法**：事件就是"系统闭包队列 + emit 方法调用"（纯 JS），实体就是"id + 信号"（纯数据），系统就是"工厂返回的对象"（纯函数式）。

### 1.4 迭代历程

- **v1**：硬 ECS 基础（实体池、帧管理器、系统工厂、双池、形状碰撞）
- **v2**：事件机制探索（引擎级事件队列 → 系统级闭包队列的演进）
- **v3**：API 定型（useEntity / enter / emit / update 系统对象形态）

---

## 二、核心设计决策

| 决策点             | 结论                                                                              |
| :----------------- | :-------------------------------------------------------------------------------- |
| **数据存储方式**   | 硬 ECS——数据全局扁平存储（Map<EntityId, EntitySignal<T>>），系统通过 `frame` 读写 |
| **实体标识**       | `Symbol`（天然唯一，全链路统一使用），挂在实体信号上（`entity.id`）               |
| **数据快照策略**   | 延迟快照——只在写时创建副本，读直接返回信号值                                      |
| **系统 pool 管理** | 系统闭包内私有管理（`Set<EntityId>`），框架不介入                                 |
| **系统执行顺序**   | `createGame` 的参数顺序即执行顺序                                                 |
| **系统形态**       | 工厂返回对象 `{ enter?, emit?, update }`——能力声明式                              |
| **事件机制**       | 系统自持闭包队列（每事件类型一个），`emit` 方法绑定队列，`update` 中处理          |
| **系统间连接**     | 组装层路由：工厂参数注入（routes / deps），生产者持消费者的 emit 引用             |
| **实体生命周期**   | 声明式：数组信号 + Each keyed 挂载/卸载                                           |
| **实体注册**       | `useEntity(ctx, ...enter)`——组件注册，返回 `EntitySignal<T>`（信号 + id）         |

---

## 三、系统形态（v3 定稿）

### 3.1 统一形态：工厂返回对象

所有系统是"更新系统的超集"——工厂返回纯 JS 对象，成员按需：

```ts
// 基础系统（单注册能力：enter 即函数）
movement = { enter, update }
boundary = { enter, update }
collision = { enter, update }

// 规则系统（多注册能力：enter 分组；事件系统：emit 分组）
rules = {
  enter: { state, paddle, brick },   // 实体进入接口
  emit:  { break, out, launch, click, restart },  // 事件进入接口
  update,                            // 帧逻辑
}

// 纯事件系统
audio = { emit: { break, bounce, win, lose }, update }
```

**系统对象的成员 = 该系统对外能力的声明**——看一个系统对象就知道它能干什么（注册什么实体、接收什么事件、跑什么帧逻辑）。

### 3.2 分组判据

- **单成员 → 函数简写**（`movement.enter({x,y})`——单成员聚合是过度设计）
- **多成员 → 对象分组**（`rules.enter.state(...)`——与 `rules.emit.break(...)` 对称）
- `enter`（实体进入）与 `emit`（事件进入）是系统的两个"入口接口"，对称设计

### 3.3 系统工厂签名

```ts
// 基础系统
function createMovementSystem<T>() {
  const pool = new Set<EntityId>();
  const enter = (props) => (id, ctx) => {
    /* 池管理 + 数据切片 */
  };
  const update = (frame, delta) => {
    /* 帧逻辑 */
  };
  return { enter, update };
}
```

事件系统（规则系统）完整形态——多队列 + 多 emit + 实体池：

```ts
// payload 类型：各 emit 方法签名的参数（队列身份即类型）
type BreakPayload = { id: EntityId; by: EntityId; points: number };
type OutPayload = { id: EntityId };
type LaunchPayload = Record<string, never>;

function createRuleSystem<T>(deps: { win: (p: WinPayload) => void }) {
  // 每事件类型一个闭包队列（像 pool 一样私有）
  const breakQueue: BreakPayload[] = [];
  const launchQueue: LaunchPayload[] = [];

  // 实体池（注册即持有 id）
  const statePool = new Set<EntityId>();

  // enter：实体进入接口（多成员分组）
  const enter = {
    state: (props) => (id, ctx) => {
      const { onMount, onUnmount } = ctx;
      onMount(() => statePool.add(id));
      onUnmount(() => statePool.delete(id));
      return { balls: props.balls ?? [] /* ... */ };
    },
    // paddle / brick ...
  };

  // emit：事件进入接口（方法签名即类型契约）
  const emit = {
    break: (p: BreakPayload) => breakQueue.push(p),
    launch: (p: LaunchPayload) => launchQueue.push(p),
  };

  // update：帧循环中处理各队列（链式事件：处理中可调 deps.win）
  const update = (frame) => {
    for (const e of breakQueue.splice(0)) onBreak(frame, e, deps);
    for (const _e of launchQueue.splice(0)) onLaunch(frame);
  };

  return { enter, emit, update };
}
```

---

## 四、事件机制（v3 定稿）

### 4.1 事件 = 系统闭包队列 + emit 方法

**引擎零事件机制**——事件队列在事件系统的闭包内（像 pool 一样私有）：

```
事件系统内部：
  每事件类型一个队列（breakQueue / outQueue / ...）
  emit.break(p) → breakQueue.push(p)    —— 生产者调用（类型由签名锁定）
  update()       → 处理各队列（splice 取批）—— 帧循环中触发

队列生命周期 = 累积区：帧外（DOM 事件）随时可入队，update 处理即清空
```

**每事件类型一个队列的意义**：

- 每个队列的 payload 类型不同（`BreakPayload` / `OutPayload` / `WinPayload`...）——**队列身份即类型**
- `emit` 方法签名就是类型契约（`emit.break` 只能收 BreakPayload）
- 不需要事件的 type 字段——无需判别联合、无需 switch 收窄
- 消费端按队列处理（`onBreak` / `onOut`...），零过滤

### 4.2 系统间连接：组装层路由

**生产者持有消费者的 emit 引用**（组装时注入）——系统间连接集中在组装层：

```ts
// 游戏组装层（连接图一目了然）：
const rules = createRuleSystem({ win: (p) => audio.emit.win(p), lose: (p) => audio.emit.lose(p) });
const audio = createSoundSystem(play);

const boundary = createBoundarySystem(config, { onOut: (p) => rules.emit.out(p) });
const collision = createCollisionSystem({
  onBreak: (p) => {
    rules.emit.break(p);
    audio.emit.break(p);
  }, // 多消费者：各压一份
  onBounce: (p) => audio.emit.bounce(p),
});

createGame([input, movement.update, boundary.update, collision.update, rules.update, audio.update]);
```

- **生产者零运行时耦合**（碰撞系统不知道消费者是谁——路由在工厂参数）
- **链式事件**：规则系统处理中调用 `deps.win({})`（音效系统的 emit）→ 音效系统 update 排在后面 → 同帧处理
- **广播精神保留**：一个事件可被多个消费者（break → 规则 + 音效）

**链式事件的帧内时序**（击碎 → 加分 → 胜利，同帧完成）：

```
帧 N 的 update 阶段（按注册顺序）：
  collision.update：检测击碎 → rules.emit.break(p) + audio.emit.break(p)
  rules.update：处理 break 队列 → 加分 → 分数满 → deps.win({})（= audio.emit.win）
  audio.update：处理 break 队列（击砖音）+ win 队列（胜利音）
flush：提交分数/状态数据 → HUD 更新、覆盖层显示
```

事件链在同一帧内完整走完——玩家击碎最后一块砖的瞬间看到胜利画面，无需等待下一帧。

### 4.3 事件 vs 回调 vs 数据（概念澄清）

| 方式             | 语义                       | 时序                        | 耦合                         |
| :--------------- | :------------------------- | :-------------------------- | :--------------------------- |
| 回调             | 无（立即执行）             | 打乱帧时序                  | 生产者知道消费者             |
| 数据（状态标记） | 丢失（只有新值）           | 中立                        | 知道"谁在读"，不知道"谁在意" |
| 事件（闭包队列） | 完整（payload + 方法身份） | 消费者的 update（帧内）处理 | 组装层连接，运行时零耦合     |

**事实 vs 状态（统一原则）**：

> **事实 → emit 方法调用；持续状态 → 信号**

- 瞬时事实（碰撞、点击、发球动作）→ 系统 `emit.xxx(payload)` 压入目标队列
- 持续状态（方向键按住、坐标、血量）→ 信号/实体数据

### 4.4 输入的两分

- **瞬时动作**（点击、空格发球、Enter 重开）→ 直接调用系统 emit（组件持有系统引用）
- **持续状态**（方向键按住）→ 信号 → 帧内更新系统读取写入实体数据

```ts
// 组件层：
rules.emit.launch({});
rules.emit.click({ x, y });
// 持续状态：
const dir = use(0); // 键盘事件写信号
// 帧内输入系统读 dir 信号写挡板 vx
```

---

## 五、实体（v3 定稿）

### 5.1 useEntity：实体 = 信号 + id

```ts
const { useEntity } = createGame<T>([...updates]);

// 组件注册实体：
const paddle = useEntity(
  ctx,
  rules.enter.paddle(),
  movement.enter({ x, y, vx, vy }),
  boundary.enter({ w, h, bounds }),
  collision.enter({ moving: false, shape: "rect", drive: 0.5 }),
);

// 实体信号 = 组件绑定句柄；id = 帧循环身份——id 挂在信号上
paddle.id; // 帧内系统 frame(paddle.id, ...)
use(paddle, () => `${paddle().x}px`); // 组件绑定
```

- `useEntity`——与 kiaao 的 `use` 同前缀："在组件里创建并绑定一个实体"
- `EntitySignal<T> = Signal<T> & { id: EntityId }`——一个对象两个身份
- 实体生命周期 = 组件生命周期（onMount 进池 / onUnmount 出池）

### 5.2 实体生命周期：声明式（数组信号）

**实体的增删 = 数组信号操作**，不提供命令式 createEntity API：

```
实体目录（真相源）            声明式增删                      框架自动反应
entities: Signal<Data[]>  →  数组整体替换（push 新项）→  Each keyed 挂载组件 → useEntity 注册（进池）
                            数组过滤（移除项）       →  Each 卸载组件 → onUnmount 清池（出池）
```

- **数组 = 出生证**（配置数据），**实体信号 = 运行时状态**（帧循环演化）
- 数据单向流动：数组 → 组件 → 实体；销毁无需反向关联（onUnmount 自动清理）
- 实体目录本身是数据——放入**状态实体**（一个承载全局状态的实体），规则系统通过 frame 读写

### 5.3 嵌套数据纪律

**实体数据里的嵌套结构（数组/对象）必须整体替换，不可原地修改**：

```ts
frame(stateId, (v) => {
  v.balls = [...v.balls, createBall(...)];   // ✓ 整体替换（新引用）
  // v.balls.push(...)                       // ✗ 原地修改（浅拷贝共享引用 → 信号不传播）
});
```

- 帧管理器写时拷贝是**浅拷贝**（保护顶层对象，不保护嵌套结构）
- 信号传播靠引用比较（原地修改不产生新引用 → 传播失效）
- 这也是"实体数据以扁平标量为主"（x/y/vx/vy）是 ECS 自然形态的原因

### 5.4 实体与数组项关联（dataId）

动态实体（球）注册时带出生标识：

```ts
const entity = useEntity(
  ctx,
  () => ({ dataId: data.id }),   // 关联实体目录数组项
  movement.enter({ x: data.x, y: data.y, vx: data.vx, vy: data.vy }),
  ...
);

// 规则系统出界处理：frame(id).dataId → 过滤数组（声明式销毁）
// 无需实体 id → 数组项的映射表——数据驱动
```

---

## 六、帧循环流程（v3）

```
每一帧：
  1. 创建 FrameManager（延迟快照）
  2. 按序执行所有系统的 update：
     - 普通系统：遍历自己的池，frame(id, mutate) 变换数据
     - 事件系统：处理自己的闭包队列（splice 取批 → 落地为数据）
     - 系统间通过组装层注入的 emit 引用产生事件（压入目标队列）
  3. flush() → 提交所有脏数据到信号
  4. 等待下一帧
```

要点：

- **没有事件阶段**——事件处理就是事件系统的 update（排在其后系统的 update 可读到落地结果）
- 链式事件（击碎 → 加分 → 胜利音）依赖系统顺序：规则系统在音效系统之前
- 帧外 emit（DOM 事件）随时入队，下一帧该系统的 update 处理（延迟 ≤ 1 帧）
- **`delta` 为秒**（`Math.min((now - prev) / 1000, 0.05)`，上限 50ms 防跳帧）
- **读优先纪律**：`frame(id)` 只读不拷贝（零分配）；写才走写时拷贝（延迟快照）
- **无越界不写**：boundary 等系统先读判断、有变更才写——避免无谓的信号传播（每一帧的对象引用变化都会触发订阅者重算）

---

## 七、游戏引擎 API（v3 定稿）

```ts
type EntityId = symbol;
type EntitySignal<T> = Signal<T> & { id: EntityId };

type FrameManager<T> = {
  (id: EntityId): Readonly<T> | undefined;
  (id: EntityId, mutate: (value: T) => void): void;
};

type Update<T> = (frame: FrameManager<T>, delta: number) => void;

function createGame<T>(updates: Array<Update<T>>) {
  // 实体池 + 帧循环（纯流水线）
  return { useEntity, dispose };
}
```

**导出面（定稿）**：`{ useEntity, dispose }`——实体注册 + 生命周期管理。无事件 API（事件是系统能力）。

---

## 八、设计决策记录

### 8.1 为什么事件用"系统闭包队列 + emit 方法"而非引擎级事件队列？

迭代历程（v2 → v3）：

1. **引擎级队列 + type 字段**：事件 = `{ type, payload }` 统一入队，消费端 switch——引擎多机制、消费端要收窄
2. **Proxy emits 语法**：`emits.break(payload)`——类型安全但引擎机制多（Proxy、路由）
3. **系统闭包队列（定稿）**：每事件类型一个队列在系统闭包内，emit 方法签名即类型契约——**引擎零事件机制**，事件 = 纯 JS

关键洞察：**事件的身份从"数据字段"（type）提升为"结构身份"（队列 + emit 方法）**——与实体进入系统的池（enter）对称。

### 8.2 为什么生产者持有消费者的 emit 引用（点对点）而非广播？

- 广播（统一队列 + 订阅）需要引擎维护队列和分发——机制多
- 点对点 + 组装层路由：**连接显式可见**（组装层即路由图）、引擎零机制
- 生产者运行时仍零耦合（路由在工厂参数，不在系统内部）
- 多消费者 = 组装层多调一个 emit（各压一份）
- 调试：队列分散在系统闭包内（各自可见）

### 8.3 为什么每事件类型一个队列？

- 每个队列 payload 类型不同——**队列身份即类型**，emit 方法签名锁定
- 消费端零过滤、零 switch——按队列处理函数分派
- 不需要 type 字段、不需要判别联合收窄

### 8.4 为什么系统形态是"工厂返回对象"？

- 能力声明式：`{ enter, emit, update }` 即系统接口
- 多注册能力天然支持（`rules.enter.state / paddle / brick`）
- 可扩展：未来可加 pool 暴露、多 update 等成员
- 单成员简写（enter 即函数）、多成员分组（enter/emit 对象）——与事件接口对称

### 8.5 为什么 useEntity 返回 `Signal & { id }`？

发现过程：早期 useGame 只返回信号、不暴露 id——组件需要 id 给帧内系统（frame 读写）时，只能利用"注册函数第一个参数就是 id"的内部契约包一层收集（`(id, c) => { paddleId = id; return reg(id, c); }`）——这是 API 设计问题的补丁证据。

定稿：

- 实体 = 信号（组件绑定）+ id（帧循环身份）——一个对象两个身份，概念内聚
- `entity.id` 直取——消灭注册包装技巧
- 命名与 kiaao 的 `use` 同前缀："在组件里创建并绑定一个实体"
- 同时发现 useGame 的语义问题：它是 createGame 返回的方法，干的却是"创建实体"——"创建游戏"与"创建实体"两个概念绑在一个返回值上——改名 useEntity 后各归其位

### 8.6 为什么实体生命周期用数组信号（声明式）？

- 声明式数据流与 kiaao 信号哲学一致（对比：命令式 createEntity 是"命令世界"）
- 实体生灭天然绑定渲染（挂载即注册、卸载即清理）
- 引擎零新增 API；"实体目录"本身是数据（状态实体的字段），任何系统可读写

### 8.7 为什么 UI 只订阅数据，不接收事件？

- UI 的职责是"把数据翻译成视觉/听觉"，只需知道"现在是什么"
- 订阅事件要处理"事件错过"（组件挂载晚于事件）与瞬时性
- 音效/动画等"数据之外的输出"由表现系统承载（事件系统的 update 副作用）

### 8.8 为什么实体注册方法叫 `enter`（而非 register/join/slice）？

候选与取舍：

| 候选              | 优点                                | 缺点                                                         |
| :---------------- | :---------------------------------- | :----------------------------------------------------------- |
| register          | 语义最完整（加入池 + 提供初始数据） | 长（8 字母）                                                 |
| reg               | 短                                  | 缩写感，不优雅                                               |
| join              | 短、与"池"呼应                      | Array.join 心智歧义；主语偏斜（系统调用 join，加入者是实体） |
| slice             | 与"数据切片"概念呼应                | 只表达"提供切片"，丢"进池"语义                               |
| **enter（定稿）** | 短、"进入（系统）"动感准确          | 与"进入模式"（enterFullscreen）轻微歧义                      |

定稿理由：`enter` 与 `emit`（事件进入）对称——系统的两个"入口接口"：**实体进入（enter）/ 事件进入（emit）**。一对 4 字母动词，读作"实体进入移动系统"、"事件进入规则系统"。

### 8.9 为什么系统变量用职责名（movement/rules/audio）？

候选：`moveSys`（sys 后缀）、`systemMove`（system 前缀）、`movementSystem`（完整）、**职责名（定稿）**。

- `systemMove` 读作"系统移动"——主语错位；所有系统变量以 system 开头，排序时是噪音
- 职责名（movement/boundary/collision/rules/audio）：**变量名表达职责，工厂名表达形态**（createXxxSystem）——`rules.emit.launch({})` 读作"规则系统发射发球"，主语是职责
- 与引擎概念呼应："系统"是工厂的产物，变量名只需要说它负责什么

### 8.10 保留的 v1/v2 决策

- 延迟快照（读多写少场景）
- 系统池私有（封装性）
- Symbol 实体标识（唯一性）
- 不用微任务批处理（帧末统一提交已覆盖）
- 事件 vs 数据修改分离（数据修改是命令，事件是事实）
- 广播的调试性：组装层路由图即事件流图

---

## 九、后续可探索方向

1. **系统对象扩展**：pool 暴露（调试/查询）、多 update（多阶段帧逻辑）
2. **调试工具**：帧内事件可视化（各系统队列）、实体状态面板
3. **性能优化**：空间哈希、四叉树（当实体数量增长时）
4. **更丰富的系统示例**：AI 系统、动画系统、回合制事件系统
5. **事件 payload 的联合消费**：多队列合并处理（当多个事件共享处理逻辑时）

> 命名已定稿：useEntity / enter（实体进入）/ emit（事件进入）/ update（帧逻辑）/ 职责名变量

---

## 附录：参考实现

- v1 原型：`packages/example/src/worlds/bouncing-boxes/index.tsx`、`gravity-balls/index.tsx`
- v3 落地：`packages/example/src/worlds/breakout/`（事件系统 + 声明式生命周期的完整示例）
- 引擎核心：`packages/example/src/worlds/engine/`（EntityId / EntitySignal / FrameManager / createGame / 系统库）

_文档整理于讨论过程中，v3 更新于 API 定型与事件机制定稿，供后续开发参考。_
