# engine

kiaao 游戏引擎：帧循环 + 实体 + 系统。

提供「游戏循环」这一层的机制，**不含具体玩法**——移动、边界、碰撞等系统由各项目自行实现。

## 三个层次

| 文件            | 内容                                                                | 面向     |
| :-------------- | :------------------------------------------------------------------ | :------- |
| `game.ts`       | `createGame`、`define`、`FrameManager`、`Enter` / `EntityId` 等类型 | 框架核心 |
| `pool.ts`       | `createPool`——实体池与登记函数封为一体                              | 系统作者 |
| `events.ts`     | `createEvent`——事件队列与发射/消费封为一体                          | 系统作者 |
| `directives.ts` | `StyleMemo`——style 属性级细粒度更新                                 | 表现层   |

## 核心概念

**状态是活对象。** `frame(id)` 直接返回该实体的可变状态对象，读写都作用于它：

```ts
const e = frame(id);
if (!e) return;
e.x += e.vx * dt;
```

帧末各实体把自己的状态浅拷贝提交给渲染信号（信号只在组件侧，引擎看不到它）。

**数据归组件，系统只声明参与。** 实体的字段由组件在 `state` 字面量里写全；`enter` 只负责把实体登记进自己的池，不提供数据：

```tsx
const entity = define(
  ctx,
  movementSystem.enter,
  boundarySystem.enter,
)({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  w: 80,
  h: 80,
  left: "bounce",
  right: "bounce",
  top: "bounce",
  bottom: "bounce",
});
```

各系统声明自己需要的字段（见 `Enter<N>` 的幻影类型），`define` 求交集作为必填项——**漏写字段会在调用处当场报错**。

**`define` 的返回值带两个东西**：

```ts
type EntitySignal<T> = Signal<T> & { id: EntityId };
```

| 写法        | 是什么                          | 用途                                 |
| :---------- | :------------------------------ | :----------------------------------- |
| `entity()`  | 渲染快照（帧末由 `flush` 提交） | 读给视图用，**不要写**               |
| `entity.id` | 帧循环身份（`Symbol`）          | 传给 `frame(id)` / 注册表 / 排除自己 |

**为什么 `id` 是属性而不是数据**：`id` 由 `define` 内部生成（组件自己造不出），而组件又必须把它交出去——注册表要存「信号 + `id`」，系统要 `frame(id)` 取活对象。挂在返回值上是唯一的渠道。

它也**不放进 `state`**：`state` 是「组件的字段」，会被 `flush` 每次浅拷贝一遍；而 `id` 是运行时身份，不是数据。全项目只有 `entity.id` 这一个非信号属性，不要再往上挂别的。

反例（曾经加过，已删）：曾给信号挂 `state: T` 指向活对象。那是把**系统的数据**挂到**组件的句柄**上，两个通道混在一起。活对象的入口是 `frame(id)`。

## 用法

```bash
vp install    # 安装依赖
vp test       # 单元测试
vp build      # 构建（vp pack）
```

开发期 `exports` 指向 `src/index.ts`（零构建，由 bundler 处理）；发布前需改回 `dist` 并开启 `exports: true`。
