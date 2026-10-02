# define 改造：数据归组件、系统只声明参与

**状态**：**已完成首轮实现**（类型通过、行为与原版逐值一致；行数未降，见 §5.3）
**最后更新**：2026年10月2日
**关联**：`packages/example/src/worlds/breakout-objects/`；对照实现 `packages/example/src/worlds/breakout/`（原版，不动）
**读者行为**：定位查找——本文按条目组织改造动机、设计、类型方案与实施步骤

> **声明**：本文代码块是设计意图的示意图。最终形态以落地代码为准。

---

## 一、为什么改

### 1.1 起点：两类实体、两种诉求

这个 demo 的实体天然分两半：

|              | 例子                                | 诉求                                     |
| :----------- | :---------------------------------- | :--------------------------------------- |
| **同质实体** | 48 块砖、多个球                     | 共享一条处理管线（物理、碰撞）——ECS 擅长 |
| **异质实体** | 挡板（跟随输入）、未来的 Boss、道具 | 各自的私有状态与行为——OOP 擅长           |

现状用**一套机制**服务两者：所有实体都必须通过 `useEntity(ctx, ...enters)` 注册，数据由各系统的 `enter()` **切片**提供、`Object.assign` 合并。于是：

- `breakout/systems.ts` 里有个 `BreakoutEntity` 类型，把 5 个系统的字段揉成一个联合类型（21 个字段）
- 想知道"一个球有什么"，要在 `views.tsx` / `engine/systems.ts` / `breakout/systems.ts` 之间跳
- 系统通过 `createMovementSystem<BreakoutEntity>()` 反向依赖这个联合类型

**这个联合类型是"跳文件"的根因**，不是调度方式的问题。

### 1.2 要验证的假设

> **数据所有权应当归组件；系统只声明"我参与哪些实体"，不再提供数据。**

副产物的期待：`BreakoutEntity` 联合类型消失；`enter` 退化成"登记函数"，不再是工厂。

---

## 二、设计

### 2.1 目标写法

```tsx
function Ball({ data }: BallProps, ctx: Context) {
  const state = {
    // 物理字段：组件写全（不再由系统切片提供）
    x: data.x, y: data.y, vx: data.vx, vy: data.vy,
    w: BALL_SIZE, h: BALL_SIZE,
    // 边界动作：扁平（原先是嵌套的 bounds 对象）
    left: "bounce", right: "bounce", top: "bounce", bottom: "die",
    // 碰撞形状
    shape: "circle", enabled: true, breakable: false, drive: 0, points: 0,
    // 私有字段（系统看不见，只有它自己用）
    dataId: data.id,
    isLive: true,
    kill() { state.isLive = false; },
  };

  // 声明「参与哪些系统」——不再传递数据
  const entity = define(ctx, movement, boundary, collision)(state);
  ...
}
```

### 2.2 三个变化

|                | 现状                                     | 改造后                                |
| :------------- | :--------------------------------------- | :------------------------------------ |
| 数据从哪来     | `enter()` 返回切片，`Object.assign` 合并 | **组件直接写在 `state` 对象字面量里** |
| `enter` 做什么 | 进池 + **提供数据**                      | **只进池**（登记），参数全部取消      |
| 入口           | `useEntity(ctx, ...enters)`              | `define(ctx, ...enters)(state)`       |

### 2.3 `enter` 的新形态

参数取消后，`enter` 不再是工厂（不再 `enter(props) => (id, ctx) => slice`），而是**一个普通函数**：

```ts
// 现在
const enter = (props: { w?: number; ... }) => (id: EntityId, ctx: Context) => {
  onMount(() => pool.add(id));
  return { w: props.w ?? 80, ... };
};

// 改造后
const enter: Enter<Bounded> = (id, ctx) => {
  const { onMount, onUnmount } = ctx;
  onMount(() => pool.add(id));
  onUnmount(() => pool.delete(id));
};
```

三段柯里化变成两参数普通函数。**这正是"简化"的兑现点**——`enter` 的复杂度全部来自"提供数据"那件事。

### 2.4 `bounds` 必须拍平

现状系统读嵌套对象：

```ts
const { left, right } = e.bounds; // engine/systems.ts
```

改造后状态是扁平的 `e.left` / `e.right` / `e.top` / `e.bottom`。

**理由不只是"方便"**：`flush` 用 `{...state}` 做**浅拷贝**，嵌套对象的引用会被共享——一个实体的 `bounds` 与渲染信号持有同一个对象。虽然当前 `bounds` 只读（只在 enter 时构造），但这是**靠约定活着**。拍平后顶层字段天然隔离。

---

## 三、类型方案（已实测验证）

这是本次改造最容易卡住的地方，已用 TS 7.0.2 实测确认可行。

### 3.1 核心手法：幻影类型 + 交集

让每个 `enter` **携带"我要求实体有哪些字段"**：

```ts
/** `__need` 只存在于类型层，运行时是 undefined —— 幻影字段 */
type Enter<N> = ((id: EntityId, ctx: Context) => void) & {
  readonly __need?: (state: N) => void;
};

// 系统声明自己的最小字段需求
const enter: Enter<Movable> = (id, ctx) => { ... };
```

`define` 收集所有 `enter` 的需求，求**交集**：

```ts
type U2I<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type NeedOf<E> = E extends Enter<infer N> ? N : never;

function define<const Es extends readonly Enter<any>[]>(
  ctx: Context,
  ...enters: Es
): <const S extends U2I<NeedOf<Es[number]>> & Record<string, unknown>>(state: S) => S;
```

- `U2I`（Union to Intersection）是标准技巧，把联合转成交集
- `const Es`：保住字面量类型（`left: "bounce"` 不被宽化成 `string`）
- `& Record<string, unknown>`：**放宽多余字段**（实体可以有系统不认识的私有字段）

### 3.2 实测结果

| 用例                                              | 预期             | 实测                                        |
| :------------------------------------------------ | :--------------- | :------------------------------------------ |
| 字段齐全                                          | 通过             | ✅ 通过                                     |
| **缺 `left` 字段**                                | 报错并指出字段名 | ✅ `Property 'left' is missing in type ...` |
| **多余字段**（`mood` / `kill`）                   | 允许             | ✅ 通过                                     |
| 字面量联合（不加 `as const`）                     | 保住             | ✅ 保住                                     |
| 自引用 state（`kill() { state.isLive = false }`） | 可用             | ✅ 可用                                     |
| `createGame` 不再需要 `<T>`                       | 可行             | ✅ `Update<Movable>` 可赋给 `Update<any>`   |

**这比预期更好**：改造不只是"简化"，还**换来一个真正的编译期保护**——写实体时漏了某个系统要的字段，TS 当场指出。而现状的 `enter` 切片合并**没有这个检查**（`Object.assign` 是运行时拼接）。

### 3.3 已知代价

`__need` 是幻影字段，运行时不存在。它只在类型层生效，**没有运行时代价**，但读代码的人需要知道这是约定。

---

## 四、实施步骤

分四步，每步可独立验证。

### 步骤 1+2：拍平 `bounds` + `enter` 去返回值（一起做）

分不开——中间状态会不一致。

**engine 侧**：

- `engine/systems.ts`：`boundary` 改读 `e.left` 等扁平字段；`movement` / `boundary` / `collision` / `input` 的 `enter` 去掉柯里化与返回值；各系统加 `Enter<字段>` 类型标注
- `engine/index.ts`：`useEntity` → `define`（接收 state，不再合并切片）

**breakout 侧**：

- `bricks.tsx` / `views.tsx`：三处实体注册改为"state 字面量 + `define`"
- `breakout/systems.ts`：`rules.enter.paddle` / `rules.enter.brick` 去柯里化；**删掉 `BreakoutEntity` 类型**

**验收**：端到端——球能弹、砖能碎（显示隐藏）、球出界销毁、生命递减、重开恢复。

### 步骤 3：类型保护到位

如果步骤 1+2 顺手就做了（因为不标注 `Enter<N>` 会报错），那这步已包含在内。

### 步骤 4：抽 pool 辅助函数

各系统里 `const pool = new Set<EntityId>()` + `onMount/onUnmount` 的模板重复 5 次：

```ts
// 可抽成
function createPool(): {
  enter: Enter<any>;
  has: (id: EntityId) => boolean;
  ids: () => Iterable<EntityId>;
};
```

**先不做**——等步骤 1–3 跑通、看清真实重复形态之后再抽，避免抽错。

---

## 五、实现记录（2026-10-02）

### 5.1 最终形态：`define(ctx, ...enters)(state)`

```tsx
const entity = define(
  ctx,
  movement.enter,
  boundary.enter,
  collision.enter,
)({
  x: data.x,
  y: data.y,
  vx: data.vx,
  vy: data.vy,
  moving: true,
  w: BALL_SIZE,
  h: BALL_SIZE,
  left: "bounce",
  right: "bounce",
  top: "bounce",
  bottom: "die",
  shape: "circle",
  enabled: true,
  breakable: false,
  drive: 0,
  points: 0,
  dataId: data.id, // 私有字段：系统不认识，但允许存在
});
```

### 5.2 实现中修正的两处设计（预期之外）

**① `define` 返回的是信号，不是 state**

最初我让它返回 `state`（方便自引用）。但组件需要的是能传给 `use(entity, ...)` 的**信号**——否则渲染无从订阅。最终返回 `EntitySignal<S>`。

自引用的需求由**闭包**满足（`state` 是 `const`，方法定义时就能捕获）：

```tsx
const state = { ..., kill() { state.isLive = false; } };
const entity = define(ctx, ...)(state);   // 两者都在，互不干扰
```

**② `createGame` 必须接受异质的 `Update`**

```ts
// 改前（会报错：Update<Collidable> 不可赋给 Update<BoundedEntity>）
updates: Array<Update<T>>;

// 改后
updates: ReadonlyArray<Update<any>>;
```

这是“**系统各自声明字段**”的必然要求：每个系统的 `Update` 参数类型不同，容器不能强求统一。`any` 在此是诚实的——容器**确实**不知道也不关心具体字段。

### 5.3 三个系统各自声明的字段需求

| 系统      | 需求类型                  | 字段                                            |
| :-------- | :------------------------ | :---------------------------------------------- |
| movement  | `Movable`                 | `x y vx vy moving`                              |
| boundary  | `BoundedEntity`           | 上述 + `w h` + 四边动作 `left right top bottom` |
| collision | `Collidable`              | 上述 + `shape enabled breakable drive points`   |
| input     | `Record<string, unknown>` | 无（只借用生命周期钩子）                        |
| rules     | `RuleEntity`              | `x y vx vy w h enabled` + `dataId?`             |

`define` 把它们求交集作为必填项——**漏写任一个就在调用处报错**。

### 5.4 步骤 4：pool 抽象（先否后取，两次评估）

#### 第一次评估（改造完成时）：不做

当时判断依据：

| 系统      | 池形态                               | `enter` 行数 |
| :-------- | :----------------------------------- | -----------: |
| movement  | 双池（按 `moving` 路由）             |           10 |
| collision | 双池（按 `moving` 路由）             |           10 |
| boundary  | 单池                                 |            9 |
| rules     | 双池（paddle / brick，**语义不同**） |         各 8 |
| input     | **无池**（只挂事件监听）             |           10 |

重复总量 ≈ 27 行，抽象成本 15–20 行，净收益 ≈ 0。

#### 第二次评估（同日稍后）：改做

**触发点**：作者提出“很多 `enter` 是否都是模板代码”。重看后发现第一次的账**算错了**（当时行数估偏），而且**“二次复制”的证据已出现**：

- movement 与 collision 的 `enter` 是**逐字相同**的（双池路由）
- boundary / rules.paddle / rules.brick 是同一种单池模板，复制 3 次

**真正的收益不是行数，而是消除一类隐患**：双池版本的 `onUnmount` 必须同时删两个池——

```ts
onUnmount(() => {
  movePool.delete(id);
  staticPool.delete(id); // ← 复制粘贴漏掉这行 = 实体泄漏在静止池
});
```

遗漏时很难发现：实体已卸载，但静止池里还留着 `id`。这正是“必须成对出现”的代码该被封装的典型。

#### 当前决定

**做。** 采用 `createPool`（池与其 enter 封为一体，放 `engine/pool.ts`），而不是只抽 enter。理由：二者天然配对，可避免“用 A 池的 enter 却往 B 池加”这类错误。

> **2026-10-02 后续修正**：最初还做了 `createMovingPools`（双池路由），**已删除**——它不该存在。详见 §6.4。

---

---

## 六、后续重组（同日）

改造完成后，作者反馈「`systems.ts` 读起来像 Vue 的 Options API」——**同一件事的东西被按类型切成几堆**。本节记录两次重组。

### 6.1 规则系统：`createEvent`（一个事件 = 一个定义点）

**病因（用数据说）**：以 `break` 为例，它被切在 **5 个地方**：

```
line  70   BreakPayload          ← 类型
line 107   breakQueue            ← 队列
line 119   emit.break            ← 发射口
line 165   for (...) onBreak()   ← 派发调用（在 update 里）
line 176   function onBreak      ← 处理逻辑（在 90 行之外）
```

而 5 个 `on*` 的**签名各不相同**，因为它们被提到了模块级、失去了闭包上下文：

```ts
onBreak(frame, payload, deps);
onLaunch(frame, paddleId, deps); // 多一个
onClick(payload, deps); // 少一个
onRestart(frame, brickPool, deps); // 多一个
```

**这正是 Options API 的同构病症**：按「队列 / 发射 / 处理」分类，而不是按「哪个事件」聚合。`createRuleSystem` 函数体因此膨胀到 **67 行**（项目规范：30 行内，最多 50）。

**解法**：`createEvent<P>` 把三者封在一个定义点（14 行）：

```ts
function createEvent<P>(handle: (payload: P, frame: FrameManager<RuleEntity>) => void) {
  const queue: P[] = [];
  return {
    emit: (payload: P) => {
      queue.push(payload);
    },
    drain: (frame: FrameManager<any>) => {
      for (const payload of queue.splice(0)) handle(payload, frame);
    },
  };
}
```

每个事件变成连续一块：

```ts
const breaking = createEvent<BreakPayload>((p, frame) => {
  const b = frame(p.id);
  if (!b || !b.enabled) return;
  b.enabled = false;
  // …后续处理全在这里
});
```

**关键改进：签名统一了。** 全部变成 `(payload, frame)`（`deps` 在闭包里）——之前签名各不相同，正源于它们被提出了闭包。

`update` 从"派发表"变成**顺序清单**：

```ts
breaking.drain(frame);
outing.drain(frame);
launching.drain(frame);
clicking.drain(frame);
restarting.drain(frame);
```

顺序仍显式可见（即原来的队列处理顺序）。

**代价**：文件 300 → 327 行（+27：`createEvent` 14 行 + `emit` 名字映射 + 分隔注释）。

**行为验证**（同条件对照）：重组前 `400 帧：分数=2 隐藏砖块=2 球数=1 生命=3`；重组后逐值一致。

**实现中自己引入又修掉的一处丑东西**：第一版在 `update` 里写了 5 处 `drain(frame as unknown as FrameManager<RuleEntity>)`。改成 `drain` 接收 `FrameManager<any>` 后消除——现在文件里 `as unknown` 零处。

### 6.2 池抽象：见 §5.4

### 6.3 未做：音效系统拆出去

`sound system` 与规则系统无关，只是碰巧也是系统。但那是「文件职责」问题，与「碎片化」不是同一件事，**未做**。

---

### 6.4 泛化：两个辅助收进 engine，改为数组返回值

作者提出两点要求：**① 泛化（不耦合 demo 类型）；② 返回值用数组**（强制解构命名）。已实施。

#### `createPool` → `engine/pool.ts`

删掉了上一版的 `createMovingPools`——它不该存在。证据：`movement` 只用 `pools.moving`，**从不读 `pools.statics`**：

```ts
for (const id of pools.moving) { … }   // 只有这一处
```

静止池在那里纯粹是陪衬，仅为“不被遍历”而存在。正确的原语是**带筛选的单池**：

```ts
createPool<T>((s) => s.moving); // 移动系统：只收移动的
createPool<T>((s) => !s.moving); // 碰撞系统：静止侧
createPool<T>(); // 全部（boundary）
```

一个原语覆盖所有情况，`createMovingPools` 只是它的特例。

#### `createEvent` → `engine/events.ts`

原实现**硬编码了 `RuleEntity`**（`frame: FrameManager<RuleEntity>`），不可复用。泛化为两个类型参数：

```ts
createEvent<T extends Record<string, any>, P>(
  handle: (payload: P, frame: FrameManager<T>) => void,
): [emit: (payload: P) => void, drain: (frame: FrameManager<T>) => void]
```

**注意顺序是 `<T, P>` 而不是 `<P, T>`**：实测过 `<P, T>` 有逆变问题——当 `T` 来自外层泛型 `createRuleSystem<T>` 时，`FM<T>` 无法赋给 `FM<Record<string, any>>`。

现在两个文件都不再依赖 demo 类型：`pool.ts` 只依赖 `EntityId` / `Enter<N>`，`events.ts` 只依赖 `FrameManager`。

#### 数组返回值

```ts
const [movers, enter] = createPool<T>((s) => s.moving);
const [paddlePool, enterPaddle] = createPool<T>();

const [emitBreak, drainBreak] = createEvent<T, BreakPayload>((p, frame) => { … });
```

**强制解构命名**——名字由使用者按语义取（`emitBreak` / `drainBreak`、`movers` / `enter`），而不是被固定的属性名（`.emit` / `.drain`）绑死。同一系统里五个事件各自的 `emit`/`drain` 不会再靠 `.emit` 这种同名字段区分。

#### 实现中的两处取舍

1. **`event<P>()` 两层调用被放弃**，改为直接 `createEvent<T, P>`。前者能简化书写（`T` 不用重复写），但多一层闭包阅读更绕；实测单层写法同样能通过类型检查。
2. **`frame` 参数可省略类型标注**——从 `createEvent` 的签名推断得出，不必在每个事件里重复写 `frame: FrameManager<T>`。

#### 副作用：`engine/systems.ts` 变了

`collision` 原本是“一个 enter 路由到两个池”，现在是“两个独立池 + 各自筛选，enter 同时登记两边”：

```ts
const [movers, enterMovers] = createPool<T>((s) => s.moving);
const [statics, enterStatics] = createPool<T>((s) => !s.moving);

const enter = ((id, ctx, state) => {
  enterMovers(id, ctx, state);
  enterStatics(id, ctx, state);
}) as Enter<T>;
```

（一次 `Enter` 调用里两个池各判一次 `accept`，所以“双池路由”在语义上并没丢。）

**行为验证**（同条件对照，与泛化前逐值一致）：

```
400 帧: 分数=2 隐藏砖块=2 球数=1 生命=3
重开: 可见砖块=48 状态=ready 分数=0
砖块 translate = 36px 48px（moving=false 不入移动池，400 帧未位移）
```

---

## 七、基线与预期

### 7.1 改造前基线（2026-10-02 实测）

| 文件                        |     行数 |
| :-------------------------- | -------: |
| `engine/systems.ts`         |      471 |
| `breakout/systems.ts`       |      320 |
| `breakout/views.tsx`        |      202 |
| `engine/index.ts`           |      185 |
| `breakout/game-instance.ts` |       99 |
| `breakout/bricks.tsx`       |       97 |
| `breakout/game.tsx`         |       67 |
| `breakout/assets.ts`        |       65 |
| `engine/directives.tsx`     |       32 |
| `breakout/index.tsx`        |       13 |
| **合计**                    | **1551** |

其它指标：

- `BreakoutEntity` 联合类型：**21 个字段**
- `.enter` 调用点：**12 处**
- `bounds.` 嵌套读取：**8 处**（`engine/systems.ts`）

### 7.2 预期（动手前写下，事后对照）

| #   | 指标                   | 预期                           | 依据                                                        |
| :-- | :--------------------- | :----------------------------- | :---------------------------------------------------------- |
| P1  | `BreakoutEntity` 类型  | **删除**                       | 数据归组件后，联合类型无存在理由                            |
| P2  | 读"一个球有什么"       | **一个文件内可见**             | 首次出现 state 字面量即全部字段                             |
| P3  | `enter` 是否变短       | **变短**（去掉返回值与柯里化） | 复杂度来自"提供数据"                                        |
| P4  | 总行数                 | **下降**，但幅度有限           | `define` + `Enter<N>` 引入新机制；`game-instance.ts` 要重写 |
| P5  | 是否引入新的编译期保护 | **是**（意外收获）             | §3.2 实测                                                   |
| P6  | 端到端行为             | **完全不变**                   | 纯重构                                                      |

**P4 我不确信**——上一轮同类预测（"行数会降"）实际是 `409 → 532`（涨了 123 行）。写在这里供事后对照。

### 7.3 事后对照（2026-10-02 改造完成后实测）

| #   | 预测                   | 实测                                                             | 结论            |
| :-- | :--------------------- | :--------------------------------------------------------------- | :-------------- |
| P1  | `BreakoutEntity` 删除  | 已删除（换成 `RuleEntity` —— 规则系统自己的最小需求）            | ✅              |
| P2  | 一个球在一个文件内可见 | `views.tsx` 的 `Ball` 里 state 字面量写全 13 个字段              | ✅              |
| P3  | `enter` 变短           | 三段柯里化 → 两参数普通函数                                      | ✅              |
| P4  | 总行数下降             | **1551 → 1573（+22）**                                           | ❌ **预测错误** |
| P5  | 引入新的编译期保护     | 删掉 `left` 立刻报 `Property 'left' is missing in type 'Bounds'` | ✅              |
| P6  | 端到端行为不变         | 与原版逐值一致（见下）                                           | ✅              |

#### P4 为何没降（如实记录）

三个地方在涨：

1. **state 字面量很长**——`Ball` 一个实体要写 13 个字段（`views.tsx` 202 → 233）。旧版是 `movement.enter({x,y,vx,vy})` 这种短调用，现在是完整字段列表
2. **`engine/index.ts` 185 → 242**——`Enter<N>` / `NeedOf` / `UnionToIntersection` / `Definer` 四个类型 + `createDefine` 工厂，约 60 行
3. **`bricks.tsx` 97 → 118**——同上，字段写全

减少的：`breakout/systems.ts` 320 → 300（删了 `BreakoutEntity` 的 21 字段声明与 `rules.enter` 的柯里化）。

**又一个行数预测失败**——与上次重构（预测降、实际 409 → 532）同类型。**行数与心智负担不相关**，后面的评估不应再看行数。

#### P6 的验证方式（逐值对照）

同一个测试逻辑（固定 `Math.random` = 0.5、发球、400 帧），分别在改造版与原版上跑：

```
改造版 400 帧: 分数=2 隐藏砖块=2 球数=1 生命=3
原  版 400 帧: 分数=2 隐藏砖块=2 球数=1 生命=3
```

另外单独验证的路径：

| 路径                          | 结果                           |
| :---------------------------- | :----------------------------- |
| 挂载（54 个元素）             | ✅ 状态 ready                  |
| 发球（球数 1、状态 running）  | ✅                             |
| 球移动与渲染跟随              | ✅ `389px 528px → 435px 331px` |
| 出界销毁 + 生命递减           | ✅ 生命 3 → 2                  |
| 击碎（分数累加 + 砖块隐藏）   | ✅                             |
| 重开（48 块砖恢复、分数归零） | ✅                             |

---

## 八、风险与已知取舍

### 8.1 `flush` 会把方法拷进渲染信号

```ts
flush: () => signal({ ...state }); // state 上的 kill() 也被浅拷贝进去
```

**决定：接受**（作者明确表态）。理由：无害，且 `JSON.stringify` 会自然忽略函数。

但要在 `engine/index.ts` 的 `flush` 处**加注释说明这是有意为之**，否则半年后看到信号里有函数会以为是 bug。

### 8.2 方法不能用 `this`

```ts
kill() { state.isLive = false; }   // ✅ 闭包捕获 state
kill() { this.isLive = false; }    // ⚠️ this 指向 state（Object.assign 后成立），但脆弱
```

**约定用闭包**。`frame` 是每帧新建的，方法本来就不能闭包捕获它，注定要显式传参——既然要传参，`this` 的语法糖就不值钱。

### 8.3 跨实体逻辑仍必须留在系统

判据：**要不要看别的实体**。

| 行为                  | 看别人吗 | 归属       |
| :-------------------- | :------- | :--------- |
| `kill` / 道具自身效果 | 否       | state 方法 |
| 碰撞 / 感知 / 寻路    | 是       | 系统       |

这不是缺陷——是划分。系统负责"实体之间"，方法负责"实体自己"。

### 8.4 `input` 系统有特殊性

`input.enter()` 借用宿主实体的 `ctx` 钩子挂键盘监听，**不贡献数据，也不参与池遍历**（无 `update`）。改造后它是最"纯"的 `enter`——只借用生命周期。可作为"`enter` 只进池"的极端例证。

---

## 九、未决问题

| #   | 问题                                                                                                | 状态                                                                        |
| :-- | :-------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| Q1  | `define` 的柯里化（`define(ctx, ...enters)(state)`）还是普通函数（`define(ctx, state, ...enters)`） | **柯里化**——便于类型推断，且读作"定义（这些系统参与的）实体"                |
| Q2  | 是否抽 pool 辅助函数                                                                                | **已定：抽**（见 §5.4——二次评估后改为做）                                   |
| Q3  | `rules.enter.paddle` / `.brick` 的形态                                                              | 去柯里化，与 `engine` 各系统的 `enter` 同形                                 |
| Q4  | 改造后 `game-instance.ts` 是否还需要                                                                | **需要**——系统实例仍需组装；但不再需要 `BreakoutEntity`                     |
| Q5  | `RuleEntity` 里 `dataId` 为何是可选                                                                 | `onOut` 读它销毁球；只有球有，挡板/砖块没有。`Partial` 比另立一个类型更简单 |

---

## 附一、本改造与其它文档的关系

- `docs/game/Kiaao ECS 框架设计文档.md`——**现状（v3）的权威定义**。本改造不推翻它，而是验证"`enter` 是否必须提供数据"这一条
- `packages/example/src/worlds/crowd/docs/actor 模型实验：闭包状态 + 对象池.md`——上一个实验。那里的教训（帧首快照、跨实体读取顺序）在本改造中仍然适用
- `packages/saboteur/docs/saboteur 游戏架构与实施规划.md`——现状方案的最大实践。若本改造成功，那份文档的 §5.2「实体结构」需要重新评估

## 附二、文档修订记录

| 日期       | 修订                                                                                                                         |
| :--------- | :--------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | 初稿（规划）                                                                                                                 |
| 2026-10-02 | **首轮实现完成**。补第五节实现记录、§6.3 事后对照（含 P4 行数预测失败）；§5.2 记录实现中修正的两处设计                       |
| 2026-10-02 | §5.4 补「不抽 pool」的量化评估（重复 ≈ 27 行 vs 抽象成本）；Q2 结案                                                          |
| 2026-10-02 | 新增第六节：`createEvent` 重组（规则系统）、pool 抽象的二次评估；§5.4 改为「先否后取」；Q2 反转为「抽」                      |
| 2026-10-02 | §6.4：删除 `createMovingPools`（改为带筛选的 `createPool`）；`createEvent` 泛化并移入 `engine/events.ts`；两者改为数组返回值 |
