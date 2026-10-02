# saboteur 引擎迁移：切换到 `packages/engine`

**状态**：**全部完成**（M0–M4；引擎缺陷修复 + 系统迁移 + 重开修复）
**最后更新**：2026年10月2日
**关联**：`packages/saboteur/`；目标引擎 `packages/engine/`；参考实现 `packages/worlds/src/breakout/`；对照 `packages/worlds/docs/define 改造：数据归组件、系统只声明参与.md`
**读者行为**：定位查找——本文按条目组织迁移动机、设计决策、实测发现与分阶段步骤

> **声明**：本文代码块是设计与实测记录的示意图。最终形态以落地代码为准。行数与文件状态会随实施变化，实施时应回填。

---

## 一、为什么迁移

saboteur 起步时自行实现了一套引擎（`src/engine/`，260 行），理由是「与 breakout 的重叠面太小」——当时的判断有据：breakout 是「移动 + 边界 + 形状碰撞」，saboteur 是「网格 + 视线 + 寻路」。

但后续演进改变了前提：

1. **引擎被抽成了独立包**（`packages/engine`），不再内嵌于 breakout demo
2. **`define` 改造完成**——数据归组件、系统只声明参与，验证了 `Enter<Need>` 幻影类型 + 交集检查
3. **`createPool` / `createEvent` 泛化**并移入 engine 包
4. 于是 saboteur 与 breakout 的**引擎层**（帧循环、实体注册、池、指令）现在是同一件事，重复的 260 行不再换来「两套形态互不制约」的收益，只换来两处要同步维护的 bug（见 §三）

---

## 二、迁移的真实性质：一次数据所有权反转

这不是 `useEntity` → `define` 的改名。核心是**数据流向反转**。

|          | 现在（saboteur 旧引擎）                                  | 迁移后                                    |
| -------- | -------------------------------------------------------- | ----------------------------------------- |
| 数据来源 | `enter(props) => (id,ctx) => 切片`，`Object.assign` 合并 | 组件 `state` 字面量写全                   |
| `enter`  | 工厂：进池 + **提供数据**                                | `Enter<Need>`：**只进池**                 |
| 注册     | `useEntity(ctx, ...enters, () => data)`                  | `define(ctx, ...enters)(state)`           |
| 读实体   | `frame(id)` 返回**缓存副本**                             | `frame(id)` 返回**活对象**                |
| 写实体   | `frame(id, e => { … })`（写时拷贝）                      | `const e = frame(id); e.x = …`            |
| 池       | 各系统手写 `Set` + `onMount/onUnmount`                   | `createPool<T>()`                         |
| 类型     | 21 字段的 `ActorEntity` 联合作为注册契约                 | 各系统 `Enter<Need>` + `ActorEntity` 注解 |

一句话：**旧引擎的系统「给出」数据，新引擎的系统「声明参与」并由组件「写全」数据。**

---

## 三、迁移前发现的既有缺陷

两个都是**实测**发现，不是推测。第一个是阻塞项，必须先行修复。

### 3.1 新引擎的 `stop()` 在帧内无效（阻塞项）

`packages/engine/src/game.ts` 的 `loop()` 末尾**无条件**重新排队：

```ts
rafId = requestAnimationFrame(loop);
```

而 saboteur 的终局判定 `settle()` 是在 `update` 回调里调用 `stop()` 的。实测对照：

| 场景                       | 旧引擎（saboteur 自带） | 新引擎（`packages/engine`）      |
| -------------------------- | ----------------------- | -------------------------------- |
| 帧内 `stop()`              | 1 帧后停住，待排队 0 ✅ | **又跑 3 帧，待排队 1** ❌       |
| 帧内 `stop()` 后 `start()` | 正常                    | **每帧 2 个回调（帧率翻倍）** ❌ |

原因：saboteur 旧引擎有 `inFrame` 守卫（4 处），新引擎 **0 处**。

**影响面**：`worlds` 只在挂载/卸载时 `stop`，所以此问题在 worlds 里是潜伏的；saboteur 的整个终局机制建立在它上面，**必须先在 engine 层补回守卫**（M0）。

### 3.2 saboteur 的重开没有恢复帧循环

实测原版（未迁移）：

```text
开局: frames=3 entities=7 actors=7 phase=playing
终局: frames=4 phase=won
重开: frames=4 entities=7 actors=7 phase=playing   ← 实体重建了，但 frames 冻在 4
```

真实点击「再来一局（R）」按钮结果相同。`restartRun()` 调了 `stop()`，但**没有任何地方再 `start()`**——`App.onMount(start)` 只在根组件挂载时执行一次，`runId` 递增只重建 `Each` 的子项，不会重挂 `App`。

`rules.ts` 的注释写「重开后帧循环由组件重新 start（Show 分支重建时 onMount 会触发）」——**这个假设不成立**。测试之所以没抓到，是因为 `rules.test.ts` 每次重开后都**手动补了 `start()`**（注释还写着「需重新启动」）。

这是既有 bug，非迁移引入；但迁移要重做这段生命周期，应一并修复（M4）。

---

## 四、三个设计决策

### D1｜保留 `ActorEntity`，但改变它的角色

**决定：保留。**

breakout 改造的目标之一是消灭 21 字段的联合类型。saboteur 不照搬，因为有两个跨系统的实体注册表依赖它：

- `playerEntity: Signal<EntitySignal<ActorEntity> | undefined>`（相机跟随）
- `listActors(): readonly EntitySignal<ActorEntity>[]`（视锥调试层遍历）

拆掉会让这些类型变得很绕。**新的分工**：

- `ActorEntity` 保留为**注册时的注解类型**，兼作字段与写者的文档（每个字段标注【谁写】）
- 各系统**各自声明最小的 `Enter<Need>`**（`pick` 出自己需要的字段）

两重检查并存：组件漏写字段 → `define` 的交集检查报错；系统读了不存在的字段 → 自己的 `Need` 报错。

### D2｜初始值用「系统导出 spawn 纯函数 + 视图组合」（方案 B）

旧引擎里 `speed` / `sneakFactor` / `sightRange` / `mood` / `moodLeft` / `held` 等字段由系统 `enter` 提供。迁移后必须由组件写。采用**方案 B**：

```tsx
// 系统导出纯函数产出自己的切片
const state: ActorEntity = {
  ...spawnLocomotion({ col, row, role, facing }),
  ...spawnPerception(),
  ...spawnBehaviour(random),
  ...spawnInteraction(),
  ...spawnAlarm({ role }),
  role,
};
const entity = define(ctx, ...enters)(state);
```

**为何可行**：已用类型探针实测——`state` 注解为 `ActorEntity` 后，漏掉任一系统的切片会在 `state` 字面量处当场报错（`missing the following properties from type 'ActorEntity': mood, moodLeft, path, goal, and 2 more`）。**编译期检查没有被削弱**。

**为何选 B 而非「视图里写长字面量」（方案 A）**：字段多（21 个）且部分需要随机数（`moodLeft`），字面量会淹没视图的渲染逻辑。B 把「初值怎么算」留在系统侧（它最清楚自己的字段），视图只负责组合与渲染。

**与旧形态的区别**：`spawnXxx` 是**无副作用的纯函数**，不接触 `ctx`、不进池——池的登记完全由 `enter` 承担。这不是「系统提供数据」的回潮，而是「初值计算」这一职责留在它的领域内。

### D3｜接受活对象语义，不去模拟快照

旧引擎里 `behaviour` 每帧捕获的 `self` 是**快照**，`patch` 后不回读（代码注释明确约定）。新引擎 `frame(id)` 返回**活对象**，`self` 会看到自己的写入。

**已逐个状态核对**（wander / linger / panic）：三者的 `update` 都**没有**在同一帧内「写完某字段又回读它」——写入的字段（`moodLeft` / `idleLeft` / `goal` / `followTime` / `path`）在当帧后续逻辑里不再读取。因此当前代码**观测不到差异**。

**决定**：接受活对象语义，把 `StateContext.self` 的类型注释从「只读快照」改为「活对象引用（读它即读当前值）」——**但这属于语义变化，靠 242 个测试兜底**。若某天引入「写后回读」的状态，快照与活对象会产生不同行为，届时应显式缓存局部变量（`const left = self.moodLeft - delta` 这类写法本来就是这么做的）。

---

## 五、实测验证的类型可行性

以下四点用类型探针实测确认，不是推测。

| #   | 验证项                                                        | 结果                                                |
| :-- | :------------------------------------------------------------ | :-------------------------------------------------- |
| T1  | 各系统 `Enter<Pick<ActorEntity,…>>` + 交集检查                | ✅ 漏字段在 `define(...)(state)` 处报错并指出字段名 |
| T2  | **按 role 动态拼接 `enters`**（客人多一个 behaviour）仍能检查 | ✅ 动态数组路径下漏字段照样报错                     |
| T3  | 异形实体（`PropEntity`）与角色共用同一个 `define`             | ✅ 可行                                             |
| T4  | D2 方案 B 的「spawn 纯函数 + 展开组合」仍保住字段检查         | ✅ 漏 spread 报 `missing ... mood, moodLeft, path`  |

### 5.1 信号不变性的陷阱（T5）

`define` 返回 `EntitySignal<字面量类型>`，**不能**直接赋给 `EntitySignal<ActorEntity>`——`Signal` 在 TS 里是不变的（`[REACTIVE]` 属性逆变）：

```text
Types of property '[REACTIVE]' are incompatible.
  ... Type '"east"' is not assignable to type '"south"'.
```

**解法**：把 `state` 字面量**显式注解为 `ActorEntity`**（`const state: ActorEntity = { … }`）。注解后字面量类型被拓宽成 `ActorEntity`，`define` 返回的就是 `EntitySignal<ActorEntity>`，可直接进注册表。

这与 D2 的方案 B 天然契合——方案 B 的写法本就要求注解 `state`。

---

## 六、迁移清单

### 6.1 待改文件

| 类别      | 数量 | 明细                                                                                       |
| :-------- | ---: | :----------------------------------------------------------------------------------------- |
| 系统      |   10 | 5 个有 `enter`；**11 处** `frame(id, fn)` 写入分布在 6 个文件                              |
| 视图      |    2 | `actor.tsx`、`prop.tsx`（`useEntity` 调用点）                                              |
| 组装/类型 |    2 | `instance.ts`（`createGame`）、`types.ts`（`EntityId` 导入）                               |
| 待删      |    4 | `src/engine/`（260 行）                                                                    |
| 测试      |    5 | 用旧 API：`engine.test.ts`、`engine/lifecycle.test.ts`、`movement`、`navigation`、`vision` |
| 文档      |    1 | 1032 行的规划文档（§1.3、§2.1、§5.2、§6 等）                                               |

### 6.2 各系统的 `Enter<Need>` 草案

| 系统        | 需要的字段                                                       |
| :---------- | :--------------------------------------------------------------- |
| locomotion  | `x y speed sneakFactor sneaking facing`                          |
| perception  | `sightRange sightArc visibleIds`（+ 更新时读 `x y facing dead`） |
| behaviour   | `mood moodLeft path goal idleLeft followTime`（+ `dead`）        |
| alarm       | `witnessed fleeFrom`（+ 注册时读 `role`）                        |
| interaction | `held dead poisonLeft`（+ `role`）；道具侧 `PropEntity`          |
| frame       | 无（`Record<string, unknown>`）                                  |
| input       | 无（`attach(ctx)`，不采用实体注册形态）                          |

### 6.3 帧写调用点（11 处）

| 文件           | 处数 | 行号         |
| :------------- | ---: | :----------- |
| alarm.ts       |    1 | 119          |
| behaviour.ts   |    2 | 101、143     |
| interaction.ts |    2 | 233、239     |
| locomotion.ts  |    2 | 101、118     |
| navigation.ts  |    3 | 99、127、135 |
| perception.ts  |    1 | 117          |

`navigation.ts` 虽是**服务**（无 `enter`、无池），但它读写实体，故 `moveTowardGoal` 的 `frame` 参数语义也要跟着变。

---

## 七、实施分期

| 阶段   | 内容                                                                         | 验收                                                                      |
| :----- | :--------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **M0** | 给 `packages/engine` 补回 `inFrame` 守卫 + 写引擎测试（该包现在 **0 测试**） | 帧内 `stop` / `stop→start` 的对照测试                                     |
| **M1** | 系统层：`Enter<Need>` + `createPool` + 活对象读写                            | tsc 通过；`alarm`/`perception`/`locomotion`/`navigation`/`behaviour` 单测 |
| **M2** | 视图 + 组装：`define`、`instance.ts`、入口注入 `engine` 依赖                 | 全量 242 测试绿                                                           |
| **M3** | 删除 `src/engine/`，`StyleMemo` 改用 engine 版（两版实现有差异，需核对）     | build 通过                                                                |
| **M4** | 修重开缺陷（帧循环恢复）、更新规划文档                                       | 重开测试**不手动补 `start()`** 也能通过                                   |

**M0 必须独立先行**：它是对全仓的 bug 修复（消费者含 `worlds`），且是 saboteur 终局机制的前提。

### 7.1 M3 的隐藏差异：两版 `StyleMemo` 并不相同

saboteur 的 `src/engine/directives.tsx` 与 `packages/engine/src/directives.ts` 实现有实际差异：

|                    | saboteur 版                 | engine 版                             |
| :----------------- | :-------------------------- | :------------------------------------ |
| 信号值为 `null` 时 | 写 `""`（清除属性）         | 写 `v`（即 `null`，依赖浏览器行为）   |
| 静态值处理         | 先判 `!isUse` 再 `continue` | 先判 `isUse`，`else if (val != null)` |

替换时需核对当前用法（`actor.tsx` / `prop.tsx` / `stage.tsx`）是否依赖「null → 清空」的行为。

> **已核实（2026年10月2日，见 §11.2 问题 3）**：engine 版确实**没有**实现这个清除，且替换后就是行为回退。已修复为 `v ?? ""` 并补测试。saboteur 三处用法当前都不传 null，故线上无可观测差异——但契约得对。

---

## 八、基线与预期（动手前写下，事后回填）

### 8.1 迁移前基线（2026年10月2日实测）

| 项                                                       |     数值 |
| :------------------------------------------------------- | -------: |
| `packages/saboteur/src`（非测试）                        |  4164 行 |
| —— `src/engine/`（待删）                                 |   260 行 |
| —— `game/systems/`                                       |  1554 行 |
| —— `game/views/`                                         |   779 行 |
| —— `instance.ts` + `state.ts` + `types.ts` + `config.ts` |   383 行 |
| 测试                                                     |  4732 行 |
| 测试用例                                                 | 242 通过 |
| `packages/engine/src`                                    |   395 行 |
| `ActorEntity` 字段数                                     |       21 |
| 帧写调用点 `frame(id, fn)`                               |    11 处 |
| 旧 `enter` 签名                                          |    12 处 |

### 8.2 预期（供事后对照）

| #   | 指标               | 预期                                       | 依据                                                  |
| :-- | :----------------- | :----------------------------------------- | :---------------------------------------------------- |
| P1  | `src/engine/` 删除 | **删除**（260 行）                         | 被 `packages/engine` 取代                             |
| P2  | 总行数             | **可能上升**                               | state 字面量 + `Enter<Need>` 声明；历史三次预测均失败 |
| P3  | 编译期字段检查     | **新增**（旧 `Object.assign` 无此检查）    | §五 T1–T4 实测                                        |
| P4  | 端到端行为         | **完全不变**（242 测试逐值一致）           | 纯重构，除 §3.2 的重开修复                            |
| P5  | 帧写调用点         | **减少**（`frame(id, fn)` → 活对象直接改） | 11 处写入不再需要回调包裹                             |

**P2 我不确信**——同类预测此前三次落空（saboteur `409→532`、breakout-objects `1551→1573`、worlds `1551→1650`）。**行数与心智负担不相关**，此表仅作事后对照，不作为成功标准。

---

## 九、风险与已知取舍

### 9.1 活对象语义（见 D3）

`StateContext.self` 不再是快照。当前所有状态对象都观测不到差异，但这是**语义变化**，不是等价重写。

### 9.2 动态 `enters` 的类型推断

`role === "guest" ? [...common, behaviour.enter] : common` 这种拼接，实测仍能触发字段检查（T2），但推断出的 `Es` 是联合数组，错误信息可能不如静态元组清晰。

### 9.3 `frame` 参数类型的不一致

各系统 `update` 的 `FrameManager<T>` 泛型不同，与 `worlds` 一致：`createGame(updates: ReadonlyArray<Update<any>>)` 里的 `any` 是**诚实的**——容器确实不关心具体字段。

### 9.4 服务（`navigation`）也被卷入

`NavigationService` 不是系统（无 `enter`、无池），但 `moveTowardGoal` 读写实体，其 `frame` 参数语义随引擎改变。它的单测改用 `createHarness`（已存在于 `navigation.test.ts` / `movement.test.ts`），需同步调整。

---

## 十、未决问题

| #   | 问题                                                        | 状态                                               |
| :-- | :---------------------------------------------------------- | :------------------------------------------------- |
| Q1  | `ActorEntity` 是否拆掉                                      | **保留**，改为注册注解类型（D1）                   |
| Q2  | 初始值放哪                                                  | **方案 B**：系统导出 spawn 纯函数 + 视图组合（D2） |
| Q3  | `self` 快照还是活对象                                       | **活对象**，改注释并靠测试兜底（D3）               |
| Q4  | `crowd` demo（闭包状态 + 对象池的对照组）是否会因此失去意义 | 待评估——它是**对照实验**，不受本迁移影响           |
| Q5  | `packages/engine` 是否补测试                                | **已完成**（M0）——该包原有 0 测试，现 19 例        |

---

## 十一、实施记录

### 11.1 M0：引擎帧内 stop 缺陷修复（2026年10月2日）

**改动**：`packages/engine/src/game.ts` 补回 `inFrame` 守卫（+11 行 / −3 行）。

关键点：

- `loop()` 开头 `inFrame = true`、`rafId = 0`（本帧回调已被消费）
- `loop()` 末尾：`if (running) rafId = requestAnimationFrame(loop)`——不再无条件排队（**修复终止失效**）
- `start()`：`if (!inFrame) rafId = requestAnimationFrame(loop)`——帧内启动由 loop 尾部接管（**修复帧率翻倍**）
- `stop()`：`rafId = 0`，清掉已取消的句柄

**测试**：新增 `packages/engine/src/__tests__/game.test.ts`（10 例）。该包此前 **0 测试**。

| 用例组             | 例数 | 覆盖                                                                   |
| :----------------- | ---: | :--------------------------------------------------------------------- |
| 帧循环开关         |    3 | `start`/`stop` 幂等、`autostart` 默认值、stop 后可恢复                 |
| **帧内 stop**      |    3 | 帧内 stop 生效、帧内 stop→start 不重复排队、恢复时重置时间基准         |
| 系统执行           |    1 | `update` 按参数顺序执行                                                |
| `dispose`          |    1 | 停止帧循环                                                             |
| 定义实体与帧末提交 |    2 | `define` 登记 + 帧末提交给信号、卸载后出池（`frame` 返回 `undefined`） |

**验证测试真的能抓住 bug**（关键步骤）：把 `game.ts` 临时改回修复前的实现，两个新用例立即失败——

```text
× 在 update 里 stop：本帧跑完后不再排队
× 帧内 stop 再 start：不重复排队（帧率不翻倍）
Tests  2 failed | 8 passed (10)
```

还原修复后 10/10 通过。**只在这两处失败的测试才是有价值的**——在旧代码上也能通过的话，它没有锁定任何契约。

**全仓验证**：

| 项                          | 结果                             |
| :-------------------------- | :------------------------------- |
| `packages/engine` 测试      | 1 文件 / **10 通过**             |
| `packages/engine` tsc       | 0 错误                           |
| `packages/engine` pack      | OK（11.93 kB）                   |
| `packages/worlds`（消费者） | tsc 0 错误 + build OK            |
| 全仓测试                    | 67 文件 / **804 通过**（原 794） |
| `vp check`                  | 全绿                             |

**M0 未做的一件事**：`worlds` 的 `breakout/game.tsx` 只在 `onUnmount` 调 `game.stop()`，不处于帧内，因此 **M0 对它在行为上没有可见变化**——修复的是潜伏风险（及 saboteur 终局的真实依赖）。这符合预期，不是遗漏。

### 11.2 M1–M4（2026年10月2日）

M1（系统层）与 M2（视图/组装）**无法分开做**：新 `enter` 不返回值，数据必须由视图的 `state` 写全；而 `state` 怎么写取决于所有系统的 `Enter<Need>`。只要有一个系统是旧形态，`define(...)(state)` 就编译不过——**中间状态无法编译**。故二者作为一个原子改动一次落地。

#### 改动范围

| 类别 | 内容                                                                                   |
| :--- | :------------------------------------------------------------------------------------- |
| 系统 | 6 个文件加 `Enter<Need>` + `createPool` + 活对象直接读写（11 处 `frame(id, fn)` 全清） |
| 视图 | `actor.tsx`（状态字面量组合）、`prop.tsx`、`stage.tsx`（StyleMemo 改从 engine 导入）   |
| 组装 | `instance.ts`（`createGame`/`define` from engine）                                     |
| 删除 | `src/engine/`（260 行）+ 两个旧引擎测试文件（它们测的 API 已不存在）                   |
| 新增 | `__tests__/helpers.ts`（共享测试台）、engine 包的 `directives.test.ts`                 |
| 测试 | 5 个文件的实体构造改为新形态（`mountActor` / `entity()` 读取器）                       |

#### 实现中发现并修复的三个真问题

这三个都不是「测试写错了」，而是真实缺陷。

##### 问题 1：引擎缺少「活状态」的访问入口（设计缺口）

新引擎里 `define` 产出**两个不同对象**：渲染信号（`{...state}` 快照）与活状态对象。旧引擎没有这个二分——`frame(id)` 无缓存时回退到 `signal()`。新引擎断开了这条路径，**信号上没有任何入口能拿到活状态**。

实测（探针）：

```text
写信号后 sig() = 99 | 活对象 = 0
跑一帧 flush 后 sig() = 0   ← 99 被覆盖
```

即：**写信号会被下一帧 `flush` 静默覆盖**。生产代码只读信号（帧末能看到最新值），所以运行时不暴露；但任何需要**写入**实体的一方（测试、未来的工具/调试层）无路可走。

**修复**：`EntitySignal<T>` 增加 `state: T`，指向系统读写的同一活对象。

```ts
export type EntitySignal<T> = Signal<T> & { id: EntityId; state: T };
```

这不是为测试开的洞，而是补一个语义缺口：信号是组件拿到的唯一句柄，它理应同时承载「渲染快照」与「活状态」两种视图。加了 3 例引擎测试锁定（含「写信号会被 flush 覆盖」这条反直觉行为的显式记录）。

##### 问题 2：`interaction` 读玩家用了渲染快照而非活对象

```ts
// 改前：快照只在帧末提交，帧内读到的是上一帧的值
const me = entity?.();
// 改后：读活对象
const me = access.actors<ActorEntity>(entity.id) ?? entity.state;
```

玩家位置可能在同一帧被 locomotion 改过，用快照会算错「手心格」。这是迁移暴露的真实 bug（旧引擎的快照回退让它恰好读到了最新值）。

##### 问题 3：engine 版 `StyleMemo` 没实现自己文档承诺的 null 清除

它与 saboteur 原版实现在这点上**不同**（迁移文档 §7.1 曾标记此差异，此处兑现检查）：

|               | saboteur 原版   | engine 版（修复前） |
| :------------ | :-------------- | :------------------ |
| 信号值为 null | 写 `""`（清除） | 写 `v`（即 null）   |

实测写 `null` 的真实行为：

```text
style.left = null    → 静默忽略（保留旧值 "left: 5px;"）
style.zIndex = null  → 写入字面量（"z-index: null;"）
style.left = ""      → 真的清除（style 属性变成 null）
```

即：文档说「null/undefined 时清除该属性」，实际不能。因为是替换（把 saboteur 原版换成 engine 版），这就是**行为回退**。

**修复**：`(style as any)[key] = v ?? ""`（与原版一致），并新增 `directives.test.ts`（6 例）。反向验证：改回修复前实现，恰好 2 例失败。

#### M4：重开缺陷修复

文档 §3.2 记录的既有缺陷——重开后帧循环不再启动。修复：`restartRun()` 在递增 `runId` 后显式 `start()`。

先实测确认了安全性：递增 `runId` 后的重建是**同步完成**的（同一 tick 内 `listActors()` 已返回新实体，`entityCount` 正确），因此在重建后立即 `start()` 不会读到半旧状态。

同时删除 `rules.test.ts` 中 4 处手工补的 `start()`（它们一直在掩盖这个 bug）——删后测试仍全绿，说明修复到位。新增 1 例回归测试用**帧计数**锁定契约。

反向验证：去掉 `start()`，3 例失败；还原后 19/19 通过。

端到端实测（真实点击「再来一局」按钮）：

```text
开局:   frames=5  actors=7 entities=7 timeLeft=149.9
终局:   phase=won frames=6
重开后: frames=36 actors=7 entities=7 phase=playing timeLeft=149.5 kills=0
```

帧循环恢复、实体重建不累积、时限重新流动、击杀归零。

#### 预期对照（回填 §8.2）

| #   | 预测               | 实测                                                       | 结论            |
| :-- | :----------------- | :--------------------------------------------------------- | :-------------- |
| P1  | `src/engine/` 删除 | 已删除（260 行）                                           | ✅              |
| P2  | 总行数**可能上升** | **4164 → 3981（降 183）**                                  | ❌ **反向错了** |
| P3  | 新增编译期字段检查 | 各系统 `Enter<Need>` 生效（漏字段在 `state` 处报错）       | ✅              |
| P4  | 端到端行为不变     | 233 例通过（原 242，减去 10 例旧引擎测试 + 新增 1 例回归） | ✅              |
| P5  | 帧写调用点减少     | 11 处 `frame(id, fn)` → **0**（活对象直接改）              | ✅              |

**P2 又错了，且是反方向**：历次都是「预测降、实际涨」，这次是「预测涨、实际降」。原因为：`state` 字面量确实变长了，但删掉的 260 行旧引擎与 11 处写时拷贝回调（每处多一层闭包）超过了增长。**这四个数据点（涨/涨/涨/降）共同说明：行数预测在这类重构上没有信息量。**

#### 全仓验证

| 项                          | 结果                                         |
| :-------------------------- | :------------------------------------------- |
| `packages/engine`           | tsc 0 错误；**19 测试通过**（原 0）；pack OK |
| `packages/worlds`（消费者） | tsc 0 错误；41 测试通过；build OK            |
| `packages/saboteur`         | tsc 0 错误；**233 测试通过**；build OK       |
| `packages/example`          | tsc 0 错误                                   |
| 全仓测试                    | 66 文件 / **804 通过**                       |
| `vp check`                  | 392 文件全绿                                 |

---

## 附一、与其它文档的关系

- `packages/worlds/docs/define 改造：数据归组件、系统只声明参与.md`——本次迁移的**直接前提**。`Enter<Need>` 幻影类型、`createPool` / `createEvent` 的形态在那篇文档里定义
- `packages/worlds/docs/actor 模型实验：闭包状态 + 对象池.md`——上一个实验，`crowd` demo 的理论来源
- `packages/saboteur/docs/saboteur 游戏架构与实施规划.md`——现状方案。本次迁移后，其 §1.3「不复用、不抽取共享包」、§5.2「实体结构」等章节需要重写

## 附二、修订记录

| 日期       | 修订                                                                                                                                                                                                    |
| :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-02 | 初稿。记录迁移动机、数据所有权反转、两个实测缺陷（帧内 stop / 重开未恢复）、D1–D3 决策、T1–T5 类型实测、分阶段步骤与基线                                                                                |
| 2026-10-02 | **M0 完成**。补回 `inFrame` 守卫；新增 10 例引擎测试（此前该包 0 测试）；记录「测试在旧实现上会失败」的反向验证                                                                                         |
| 2026-10-02 | **M1–M4 完成**。删 `src/engine/`（260 行）；系统改 `Enter<Need>` + 活对象；修三个真问题（引擎缺活状态入口、interaction 读快照、StyleMemo null 不清除）；修重开帧循环；行数 4164→3981（P2 预测反向错误） |
