# Kiaao ECS 框架设计文档

**状态：** 设计讨论中（v2 迭代）
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

### 1.3 v2 迭代主题

v2 讨论聚焦于**事件机制**与**实体生命周期**，解决两个问题：

1. 系统之间的通信（"事实"如何在帧内流转）
2. 实体的动态生灭（如何声明式地增删实体）

结论概要：

- **事件 = 带语义的瞬时事实**，通过帧内事件队列传输（广播，非订阅）
- **两类系统**：更新系统（帧驱动，工厂形态）与事件系统（事件驱动，纯函数形态）
- **实体生命周期声明式**：实体目录 = 数组信号，增删 = 数组操作，无需命令式 createEntity
- **类型化事件总线**：领域词汇表 + Proxy emits 语法，发射与消费双侧类型安全

---

## 二、设计讨论历程

### 2.1 核心设计决策

| 决策点             | 结论                                                                        |
| :----------------- | :-------------------------------------------------------------------------- |
| **数据存储方式**   | 硬 ECS——数据全局扁平存储（Map<EntityId, Signal<T>>），系统通过 `frame` 读写 |
| **实体标识**       | `Symbol`（天然唯一，全链路统一使用）                                        |
| **数据快照策略**   | 延迟快照——只在写时创建副本，读直接返回信号值                                |
| **系统 pool 管理** | 系统闭包内私有管理（`Set<EntityId>`），框架不介入                           |
| **系统执行顺序**   | `createGame` 的参数顺序即执行顺序                                           |
| **跨系统通信**     | 帧内事件队列（累积区语义，消费时清空）                                      |
| **系统形态**       | 更新系统 = 工厂（register + update）；事件系统 = 纯函数                     |
| **实体生命周期**   | 声明式：数组信号 + Each keyed 挂载/卸载                                     |
| **事件类型**       | 游戏层显式声明的领域词汇表（EventMap），createGame 泛型参数                 |
| **类型系统**       | 使用者显式声明实体类型 `T`，系统通过泛型约束工作                            |

### 2.2 关键设计演进

**从 defineSystem 到系统工厂**

第一阶段：`defineSystem(update, init)` 返回 `{ update, init, pool }`
第二阶段：系统工厂 `createSystem()` 返回 `[register, update]`
最终形态：系统工厂函数，返回数组解构：

```ts
const [register, update] = createMovementSystem<BoxEntity>();
```

**从全量快照到延迟快照**

第一阶段：每帧全量浅拷贝所有实体（`new Map(...gamePool)`）
第二阶段：按需创建副本（`get` 时拷贝）
最终形态：**只读不拷贝，只有写才创建**

**FrameManager 的双重签名设计**

```ts
// 读：只读，不拷贝
const data = frame(id);
// 写：写时拷贝，原地修改
frame(id, (e) => {
  e.x += e.vx * delta;
});
```

**从"回调/状态标记"到"帧内事件队列"（v2 核心）**

事件机制经历过三轮认知迭代：

1. **状态标记**：事件 = 数据变化（`enabled = false`）——零机制但丢失语义（被击碎 vs 被重置无法区分），且"谁消费"靠每帧扫描变化检测
2. **组件派生副作用**：事件 = 组件订阅信号变化后执行逻辑——被证明是错误方向（游戏逻辑跑到帧循环外，时序失控：加分每帧执行、状态被覆盖）
3. **帧内事件队列（定稿）**：事件 = 带语义的事实记录，入队 → 帧内统一消费 → 落地为数据

### 2.3 概念澄清（v2 讨论的洞见）

**事件 vs 回调 vs 数据**

| 方式             | 语义                   | 时序             | 耦合                         |
| :--------------- | :--------------------- | :--------------- | :--------------------------- |
| 回调             | 无（立即执行）         | 打乱帧时序       | 生产者知道消费者             |
| 数据（状态标记） | 丢失（只有新值）       | 中立             | 知道"谁在读"，不知道"谁在意" |
| 事件（队列）     | 完整（type + payload） | 帧内固定位置处理 | 生产者完全不知道消费者       |

**事实 vs 状态（统一原则）**

> **事实 → 事件；持续状态 → 信号**

- 瞬时事实（碰撞、点击、拾取、发球动作）→ `emits` 入队
- 持续状态（坐标、方向键按住、血量）→ 信号/实体数据

**广播 vs 订阅**

- 事件带 type 是"广播频道"，不是"注册 key"
- 生产者零耦合：新增消费者无需改任何现有代码
- 队列完整可见：调试友好（事件可视化、回放的基础）

**系统 = 唯一逻辑形态**

事件机制不是"特殊的系统类型"，而是"系统之间的通信协议"：

- 队列（数据暂存区）+ 通道（emits 入队 / 事件阶段分发）+ 消费系统（普通逻辑函数）
- 事件消费系统与更新系统**同源**（都是处理数据的函数），区别在执行模式（帧驱动 vs 事件驱动），而非类型

---

## 三、最终架构设计

### 3.1 核心概念

| 概念          | 说明                                                   |
| :------------ | :----------------------------------------------------- |
| **实体**      | `Symbol` 标识，无实际结构                              |
| **组件/数据** | 由 `register` 函数返回的数据切片合并而成               |
| **更新系统**  | 帧驱动：每帧扫描自己的池，推进世界状态（工厂形态）     |
| **事件系统**  | 事件驱动：队列有货才处理，落地事实为数据（纯函数形态） |
| **事件**      | 带语义的瞬时事实：`{ type, payload }`                  |
| **帧管理器**  | 延迟快照，统一读写接口                                 |
| **事件队列**  | 帧内暂存区（累积区语义），事件阶段消费即清空           |

### 3.2 架构层次

```
┌─────────────────────────────────────────────────────┐
│                   View Layer                       │
│   (Kiaao 组件 + Signal：注册实体、绑定 DOM、订阅数据) │
│   （DOM 事件 → emits 发射瞬时事实；方向等 → 信号）   │
├─────────────────────────────────────────────────────┤
│                 Assembly Layer                     │
│    useGame(ctx, ...registerFns) → Signal<T>        │
│    emits.key(payload) → 帧外事实入口（Proxy）       │
├─────────────────────────────────────────────────────┤
│                 Scheduling Layer                   │
│    createGame<T, EM>(updates, eventSystems)        │
│    更新阶段 → 事件阶段（while 队列非空）→ flush     │
├─────────────────────────────────────────────────────┤
│                   Data Layer                       │
│    gamePool: Map<EntityId, Signal<T>>              │
│    FrameManager: 延迟快照 + 脏数据追踪             │
│    EventQueue: 帧内事件管道（累积区）               │
├─────────────────────────────────────────────────────┤
│                   System Layer                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐      │
│  │ Movement │ │ Boundary │ │ Event Systems│      │
│  │ System   │ │ System   │ │ (纯函数)      │      │
│  └──────────┘ └──────────┘ └──────────────┘      │
│  更新系统：私有 pool + register(id,ctx) + update  │
│  事件系统：无池，消费事件 + 落地数据               │
└─────────────────────────────────────────────────────┘
```

### 3.3 帧循环流程（v2）

```
每一帧：
  1. 创建 FrameManager（延迟快照）
  2. 更新阶段：按注册顺序执行所有更新系统：
     - frame(id, mutate) → 写时拷贝，原地修改
     - emits.key(payload) → 产生事件（入队）
  3. 事件阶段：while (队列非空) {
      取出本批事件
      按序分发给所有事件系统（可再 emits，进入下一轮）
     }
  4. flush() → 提交所有脏数据到信号
  5. 等待下一帧
```

要点：

- 队列为**累积区**语义：帧外（用户输入、异步回调）随时可入队，事件阶段消费即清空
- 帧外入队的事件在**下一帧**被消费（延迟 ≤ 1 帧 ≈ 16ms，输入延迟一帧是标准做法）
- JS 单线程保证帧循环执行期间无帧外代码插入，入队与消费无并发问题
- 链式事件（击砖 → 加分 → 分数满 → 胜利）同一帧内完成：事件系统处理时发射的新事件进入下一轮分发

---

## 四、API 参考

### 4.1 系统工厂（更新系统）

```ts
function createMovementSystem<T extends Movable>() {
  const pool = new Set<EntityId>();

  const register = (props: { x?: number; y?: number; vx?: number; vy?: number }) => {
    return (id: EntityId, ctx: Context) => {
      const { onMount, onUnmount } = ctx;
      onMount(() => pool.add(id));
      onUnmount(() => pool.delete(id));
      return { x: props.x ?? 0, y: props.y ?? 0, vx: props.vx ?? 0, vy: props.vy ?? 0 };
    };
  };

  // 更新系统签名：可发射事件
  const update = (frame: FrameManager<T>, delta: number, emits: Emits<EM>) => {
    for (const id of pool) {
      frame(id, (e) => {
        e.x += e.vx * delta;
        e.y += e.vy * delta;
      });
    }
  };

  return [register, update] as const;
}
```

### 4.2 事件系统（纯函数）

事件系统**不需要工厂**——无池、无 register，直接是消费事件的函数：

```ts
type EventSystem<T, EM> = (
  frame: FrameManager<T>,
  events: GameEvent<EM>[], // 本批事件（判别联合）
  emits: Emits<EM>, // 链式事件：处理时也能再发射
) => void;

// 打砖块规则系统示例：
const onRule: EventSystem<Entity, Events> = (frame, events) => {
  for (const e of events) {
    switch (e.type) {
      case "brickHit":
        frame(scoreId, (s) => {
          s.points += e.payload.points;
        });
        break;
      case "ballOut":
        frame(ballId, (b) => {
          b.out = false;
        });
        break;
    }
  }
};
```

事件系统可用闭包持有自己的状态（无需框架 register 机制）。

### 4.3 游戏引擎（v2）

```ts
type EntityId = symbol;

type FrameManager<T> = {
  (id: EntityId): Readonly<T> | undefined;
  (id: EntityId, mutate: (value: T) => void): void;
};

type Update<T, EM> = (frame: FrameManager<T>, delta: number, emits: Emits<EM>) => void;
type EventSystem<T, EM> = (
  frame: FrameManager<T>,
  events: GameEvent<EM>[],
  emits: Emits<EM>,
) => void;

function createGame<T, EM extends EventMap>(
  updates: Update<T, EM>[],
  eventSystems: EventSystem<T, EM>[],
) {
  const gamePool = new Map<EntityId, Signal<T>>();
  const eventQueue: GameEvent<EM>[] = [];

  // Proxy emits：属性访问即发射函数（零样板、类型安全）
  const emits = new Proxy({} as Emits<EM>, {
    get: (_, key: string) => {
      return (payload: unknown) => eventQueue.push({ type: key, payload });
    },
  });

  function loop() {
    const { frame, flush } = createFrameManager(gamePool);

    // 更新阶段：所有更新系统按序执行（可 emits 发射）
    for (const update of updates) {
      update(frame, delta, emits);
    }

    // 事件阶段：循环分发直到队列空（链式事件同帧完成）
    while (eventQueue.length > 0) {
      const batch = eventQueue.splice(0);
      for (const eventSystem of eventSystems) {
        eventSystem(frame, batch, emits);
      }
    }

    flush();
    requestAnimationFrame(loop);
  }

  const useGame = (ctx, ...registers) => {
    /* 同 v1 */
  };

  return { useGame, emits, dispose: () => cancelAnimationFrame(rafId) };
}
```

**导出面（定稿）**：`{ useGame, emits, dispose }`——注册、事实、生命周期管理，无命令式实体 API。

### 4.4 组件使用

```ts
const [regMove, updMove] = createMovementSystem<BoxEntity>();
const [regBound, updBound] = createBoundarySystem<BoxEntity>();
const [regColl, updColl] = createCollisionSystem<BoxEntity>();

const { useGame, emits, dispose } = createGame<BoxEntity, GameEvents>(
  [updMove, updBound, updColl],
  [onRule, playSound],
);

function Box({ x, y, vx, vy, color }: BoxProps, ctx: Context) {
  const entity = useGame(ctx, regMove({ x, y, vx, vy }), regBound({ w: 80, h: 80 }), regColl());
  // ...
}

// 组件层绑定 DOM 事件 → 发射事实：
<div onClick={(e) => emits.click({ x: e.clientX, y: e.clientY })} />
```

---

## 五、事件系统设计（v2 完整版）

### 5.1 事件类型 = 领域词汇表（EventMap）

事件类型是游戏的领域词汇，**独立显式声明**，不从事件系统推导：

- 生产者集合 ≠ 消费者集合（`emits` 需要全集，事件系统只声明子集）
- 显式声明 = 单一真相源，双侧（发射/消费）校验同一个表

```ts
/** 打砖块事件词汇表 */
type BreakoutEvents = {
  brickHit: { id: EntityId; points: number };
  ballOut: {};
  click: { x: number; y: number };
  launch: {};
};

/** 事件统一形态：判别联合（消费端 switch 自动收窄 payload） */
type GameEvent<EM> = { [K in keyof EM]: { type: K; payload: EM[K] } }[keyof EM];

/** emits 句柄：事件名即方法，payload 自动校验 */
type Emits<EM> = { [K in keyof EM]: (payload: EM[K]) => void };
```

### 5.2 Proxy emits 语法

```ts
emits.brickHit({ id, points }); // ✓ payload 类型校验 + 自动补全
emits.click({ x: 100, y: 200 }); // ✓
emits.launch({}); // ✓
```

- 类型层面：映射类型 `Emits<EM>`——属性名即事件名（camelCase 命名约定）
- 运行时：Proxy get 陷阱返回发射函数（首次访问创建，入队 `{ type, payload }`）
- 游戏层零样板：事件名即方法，无需手动定义包装函数

### 5.3 消费端

```ts
const onRule = (frame, events, emits) => {
  for (const e of events) {
    switch (e.type) {
      case "brickHit":
        e.payload.id;
        e.payload.points; // TS 自动收窄
      case "click":
        e.payload.x; // 收窄为 { x, y }
    }
  }
};
```

### 5.4 事件的来源与边界

| 来源                       | 通道                               | 消费时机       |
| :------------------------- | :--------------------------------- | :------------- |
| 更新系统（碰撞、边界检测） | `emits`（帧内）                    | 同帧事件阶段   |
| 用户操作（点击、按键动作） | `emits`（帧外，组件绑定 DOM 事件） | 下一帧事件阶段 |
| 异步回调（资源完成、网络） | `emits`（帧外）                    | 下一帧事件阶段 |

**输入的两分**（事实 vs 状态）：

- 瞬时动作（点击、空格发球、Enter 重开）→ `emits` 事件
- 持续状态（方向键按住）→ 信号，帧内更新系统读取

### 5.5 UI 边界与表现系统

**组件只订阅数据，不订阅事件**：

- 事件在帧内被消费、落地为数据变化（分数实体、enabled 字段）
- UI 订阅数据：HUD 显示分数、砖块订阅 enabled 隐藏
- 组件不需要知道"发生了什么"，只需要知道"现在是什么"——避免事件错过问题（组件挂载晚于事件）

**表现系统（音效、动画）**：

- 音效不是"UI 组件职责"，是**事件驱动的表现系统**（带副作用，调用 AudioContext）
- 注册进事件系统列表，消费事件匹配类型播放：
  - `brickHit` → 击砖音；`ballOut` → 失败音
- 传统 ECS 中"渲染系统"就是有副作用的系统——kiaao 里 DOM 渲染被信号接管，声音等"数据之外的输出"仍由表现系统承载

```
碰撞系统 emits("brickHit")
  → 规则系统消费：加分 + enabled=false（数据落地 → HUD/砖块组件订阅）
  → 音效系统消费：播放击砖音（副作用）
```

---

## 六、实体生命周期（v2 定稿）

### 6.1 声明式：数组信号即实体目录

**实体的增删 = 数组信号操作**，不提供命令式 createEntity API：

```
实体目录（真相源）            声明式增删                      框架自动反应
entities: Signal<Data[]>  →  数组追加（push 新项）   →  Each keyed 挂载组件 → useGame 注册实体（进池）
                            数组过滤（移除项）       →  Each 卸载组件 → onUnmount 清池（出池）
```

- **数组 = 出生证**（配置数据：位置、尺寸、颜色），**实体信号 = 运行时状态**（帧循环演化）
- 数据单向流动：数组 → 组件 → 实体；销毁无需反向关联（onUnmount 自动清理）
- 静态实体（砖块网格、挡板）同样声明：数组初始值 + 组件挂载即注册

### 6.2 数组信号进实体数据

"实体目录"本身是数据——放入**游戏状态实体**（一个承载全局状态的实体），事件系统通过 frame 读写：

```ts
type GameStateEntity = {
  balls: BallData[]; // 实体目录（数组信号字段）
  score: number;
  lives: number;
  state: "ready" | "running" | "win" | "lose";
};

// 事件系统处理"点击生成球"：
const onSpawn = (frame, events, emits) => {
  for (const e of events) {
    if (e.type === "click") {
      frame(stateId, (s) => {
        s.balls.push(randomBall(e.payload.x, e.payload.y));
      });
    }
  }
};
```

- 一切游戏状态（含实体目录）都是实体数据——保持"数据驱动"的纯粹
- UI 侧：`Each value={use(stateEntity, () => stateEntity().balls)}` 订阅渲染

### 6.3 为什么不要命令式 createEntity

| 维度         | 命令式 createEntity          | 声明式数组信号                     |
| :----------- | :--------------------------- | :--------------------------------- |
| 引擎 API     | 多一个概念                   | 零新增（useGame/emits/dispose）    |
| 渲染绑定     | 实体与组件脱节（谁渲染它？） | 挂载即渲染、卸载即清理（天然绑定） |
| 生命周期清理 | 引擎要管理销毁               | onUnmount 自动清池                 |
| 心智模型     | "命令世界"                   | "数据流"（与信号哲学一致）         |

---

## 七、设计决策记录

### 7.1 为什么不用全量快照？

- 全量快照每帧 O(n) 内存分配
- 延迟快照只在写时才创建副本
- 适合"读取多、修改少"的典型游戏场景

### 7.2 为什么系统 pool 私有？

- 保持系统封装性
- 避免跨系统直接耦合
- 系统只通过 `frame` 共享数据

### 7.3 为什么用 Symbol 做 EntityId？

- 天然唯一，无需 `crypto.randomUUID()` 开销
- 全链路统一使用（从创建到销毁）

### 7.4 为什么不用微任务批处理？

- Kiaao 核心设计原则：立即推送 DOM
- 游戏循环中"帧末统一提交"已覆盖批处理需求
- 保持调试透明度

### 7.5 为什么事件队列是"累积区"而非"帧末清空"？（v2）

- 帧外来源（用户输入、异步回调）需要随时入队
- 消费时清空（drain 即空）：事件在"某一帧"被处理，而非"某一刻"——确定性粒度 = 帧
- 帧外入队的事件自然进入下一帧消费（延迟 ≤ 1 帧，标准输入延迟）

### 7.6 为什么事件不用 register 绑定系统？（v2）

- 广播 vs 订阅：绑定 = 路由表把生产者和消费者绑死（新增消费者要改注册）；广播 = 生产者零耦合
- register 是"实体注册"（实体进池），事件不是实体——事件是"流"，消费者是"流的读取者"，概念本质不同
- 调试：统一队列完整可见（事件可视化、回放的基础）
- "按类型绑定"的合理变体：事件系统在消费端按 type 过滤——编译期由 EventMap 保证

### 7.7 为什么事件系统不需要工厂？（v2）

- 更新系统需要池（实体注册、遍历）→ register 是必需形态
- 事件系统无池（处理的是"事件携带的 id"）→ 纯函数 + 闭包状态即可
- 两组分离传参 = 结构即时序：引擎强制"更新阶段 → 事件阶段"，不靠注册顺序约定

### 7.8 为什么事件类型不从事件系统推导？（v2）

- 生产者集合 ≠ 消费者集合：`emits` 需要词汇表全集，事件系统只声明消费子集
- 从消费者反推会漏掉"暂无消费者"的事件（如规则系统未写，输入已在发射）
- 领域词汇表独立声明 = 单一真相源

### 7.9 为什么实体生命周期用数组信号？（v2）

- 声明式数据流与 kiaao 信号哲学一致（对比：命令式 API 是"命令世界"）
- 实体生灭天然绑定渲染（挂载即注册、卸载即清理）
- 引擎零新增 API；"实体目录"本身是数据（游戏状态实体的字段），任何系统可读写

### 7.10 为什么 UI 不订阅事件？（v2）

- UI 的职责是"把数据翻译成视觉/听觉"，只需知道"现在是什么"
- 订阅事件要处理"事件错过"（组件挂载晚于事件）与瞬时性
- 音效/动画等"数据之外的输出"由表现系统承载（事件驱动的副作用系统）

### 7.11 事件 vs 数据修改的分离（保留 v1 结论）

- 数据修改是"命令"（即将执行的动作）
- 事件是"事实"（已经发生的事情）
- 合并会带来语义混淆、性能开销和调试困难

---

## 八、后续可探索方向

1. **多系统协作**：一个实体同时注册到多个系统（已实现）
2. **实体生成与销毁**：声明式数组信号（v2 定稿，见第六章）
3. **事件调试工具**：帧内事件可视化、事件回放（统一队列是基础）
4. **性能优化**：空间哈希、四叉树（当实体数量增长时）
5. **更丰富的系统示例**：输入系统、AI 系统、动画系统、表现系统（音效）
6. **事件优先级/过滤**：事件系统的选择性消费（当前为全量分发）
7. **Proxy emits 的类型边界**：非法事件名（非 EM 键）的运行时防御

---

## 附录：参考实现

- v1 原型：`packages/example/src/worlds/bouncing-boxes/index.tsx`、`gravity-balls/index.tsx`
- v2 重构目标：`packages/example/src/worlds/breakout/`（事件机制 + 声明式生命周期的落地示例）
- 引擎核心：`packages/example/src/worlds/engine/`（EntityId / FrameManager / createGame / 系统库）

_文档整理于讨论过程中，v2 更新于事件机制与实体生命周期的专题讨论，供后续开发参考。_
