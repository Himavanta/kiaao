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

## 用法

```bash
vp install    # 安装依赖
vp test       # 单元测试
vp build      # 构建（vp pack）
```

开发期 `exports` 指向 `src/index.ts`（零构建，由 bundler 处理）；发布前需改回 `dist` 并开启 `exports: true`。
