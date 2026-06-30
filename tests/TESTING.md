# Kiaao 测试准则

## 目标：暴力与极端测试

不是常规用例覆盖，而是**主动找茬**——找到框架的脆弱边界。
每个发现的 crash/异常/行为不一致都是有价值的结果，记录下来。

## 测试方向

### 1. 类型极端值

所有核心 API 都必须能处理错误类型而不崩溃：

| API                          | 要测试的错误输入                                                      |
| ---------------------------- | --------------------------------------------------------------------- |
| `h(tag, props, ...children)` | `tag` 传 `null`、`undefined`、`NaN`、`Symbol`、`{}`、`[]`、`Promise`  |
| `use(value, fn?)`            | 传 `undefined`、非函数 fn、信号自身、循环引用对象                     |
| `Show`/`Case`/`Each`         | `value` 传 `null`、`undefined`、非信号对象；`children` 传空、传非函数 |
| `createApp`                  | 传无效 HResult、`null`、已 mount 过的 HResult                         |
| `context.onMount/onUnmount`  | 组件已 dispose 后调用                                                 |
| `direct()`                   | 传非函数、已标记 DIRECT_KEY 的函数                                    |

### 2. 组件异常

- 组件函数内 `throw`
- 组件返回 `null`、`undefined`、`NaN`、`Symbol`、Promise（非 async 组件）
- 组件内 `context.onMount` 里 `throw`
- 嵌套组件多层 `throw`

### 3. 极端结构

- DOM 嵌套深度：100 层 `<div>` 嵌套
- 列表长度：`<Each>` 渲染 1000 个条目
- Fragment 嵌套 Fragment 嵌套 Fragment... 到 50 层
- `<div>{null}{undefined}{false}{true}{0}{""}</div>` 混合过滤与渲染

### 4. 信号竞争

- 快速 toggle：100 次 `visible(true); visible(false)` 循环
- 信号依赖环：A → B → C → A
- 多信号同时更新，派生链超过 50 级
- `disposeOwner` 在信号回调执行中途调用

### 5. 生命周期

- 组件 dispose 后检查 `owner.disposed` 及所有子 Owner 状态
- `onUnmount` callback 在 dispose 后是否执行（应该执行）
- `onMount` 在 dispose 后是否加入队列
- 信号绑定在 Owner dispose 后是否停止触发
- 异步组件的 Promise resolve 时 Owner 已 dispose

### 6. 内存泄漏

- 反复 create/dispose 组件 1000 次，检查 DOM 节点是否完全清理
- 信号订阅在 dispose 后是否从依赖列表中移除
- 动画定时器在 dispose 后是否停止

### 7. DOM 状态

- `adapter.before(anchor, node)` 时 anchor 无 parent
- `adapter.before`/`append` 传已挂载的节点
- `adapter.remove` 传无 parent 的节点
- 动态添加/删除 class、style、data-\* 属性

### 8. 指令

- 指令在组件树 dispose 后触发 `onMount`
- 指令嵌套指令
- 指令返回错误类型

### 9. SSR 渲染

当前 SSR 测试分布在两个文件：

- `tests/server/ssr.test.ts` — `renderToString` 基本功能（10 个测试）
- `tests/core/ssr-mix.test.ts` — SSR adapter API 边界与 `renderToString` 极端输入（17 个测试）

#### 已覆盖场景

| 场景                                               | 文件                   | 状态                         |
| -------------------------------------------------- | ---------------------- | ---------------------------- |
| 基本 HTML 输出                                     | `server/ssr.test.ts`   | ✅                           |
| 嵌套元素渲染                                       | `server/ssr.test.ts`   | ✅                           |
| 属性序列化                                         | `server/ssr.test.ts`   | ✅                           |
| 事件 handler 跳过                                  | `server/ssr.test.ts`   | ✅                           |
| Void 元素自闭合（`<br />`、`<hr />`、`<input />`） | `server/ssr.test.ts`   | ✅                           |
| Fragment 无多余包裹                                | `server/ssr.test.ts`   | ✅                           |
| style 对象序列化（当前输出格式与 CSS 预期不一致）  | `server/ssr.test.ts`   | ⚠️ 已知问题                  |
| 数值类型文本                                       | `server/ssr.test.ts`   | ✅                           |
| props 传参                                         | `server/ssr.test.ts`   | ✅                           |
| slots 传参                                         | `server/ssr.test.ts`   | ✅                           |
| adapter.before/append/remove/clear 在 SSR 下不崩溃 | `core/ssr-mix.test.ts` | ✅                           |
| adapter.on/off/replace 在 SSR 下为空操作           | `core/ssr-mix.test.ts` | ✅                           |
| isNode/isElement 识别 SSR 节点类型                 | `core/ssr-mix.test.ts` | ✅                           |
| prevSibling 返回 null                              | `core/ssr-mix.test.ts` | ✅                           |
| `createStaticDerived` 跳过依赖追踪                 | `core/ssr-mix.test.ts` | ✅                           |
| 特殊字符转义（`<`、`>`、`&`、`"`）                 | `core/ssr-mix.test.ts` | ✅                           |
| 布尔属性 `true` 输出 bare attribute、`false` 跳过  | `core/ssr-mix.test.ts` | ✅                           |
| `attr:` 和 `prop:` 前缀在 SSR 中的处理             | `core/ssr-mix.test.ts` | ✅                           |
| `renderToString` 在无 adapter 注册时容错           | `core/ssr-mix.test.ts` | ✅                           |
| `renderToString` 在组件抛异常时容错                | `core/ssr-mix.test.ts` | ✅                           |
| 控制流组件（Show）在 SSR 下同步渲染                | `core/ssr-mix.test.ts` | ✅（同步渲染优化后自动覆盖） |
| npx vp check 零错误                                | —                      | ✅                           |

#### 待覆盖场景

| 场景                                                                     | 优先级 | 说明                           |
| ------------------------------------------------------------------------ | ------ | ------------------------------ |
| SSR 输出中自定义 `data-*` 属性                                           | P2     | 基础覆盖                       |
| SSR 输出含超大文本（10KB+）                                              | P2     | 字符串边界                     |
| SSR + 动态组件标记（序列化占位符）                                       | P2     | lazy/async 组件在 SSR 下的行为 |
| SSR + hydrate 的节点匹配                                                 | P3     | hydrate 尚未实现               |
| SSR 下 SVG 元素序列化                                                    | P2     | SVG 标签命名空间处理           |
| SSR 下 boolean 属性全覆盖（`disabled`、`checked`、`selected`、`hidden`） | P2     | 当前只覆盖基础                 |
| SSR 下 HTML 实体、Unicode、emoji、零宽字符                               | P2     | 字符编码边界                   |
| SSR 下 `style` 字符串 vs 对象的差异                                      | P2     | 两种格式的输出一致性           |
| SSR + 控制流组件信号切换（反直觉但可能的场景）                           | P2     | 确保不崩溃                     |
| 多次 `renderToString` 调用间的状态隔离                                   | P2     | adapter 热切换                 |

### 10. 并发（如果适用）

- 多个 `createApp` 实例同时存在
- 多个信号同时写入导致派生链合并

## 通过标准

```
PASS = 框架不崩溃、不抛出未捕获异常、行为可预测
FAIL = 出现无法恢复的错误状态

框架可以报错（console.error）但不能崩溃（throw 到用户代码之外）
```

## 记录规范

每个发现的脆弱点记录为：

```
## 边界情况：{描述}

**触发条件**：
**框架响应**：崩溃 / 静默失败 / 抛出合理异常 / 行为正确
**是否修复**：是 / 否（记录原因）
**备注**：
```

## 文件组织

- `tests/core/` — 核心测试
- `tests/server/` — SSR 测试
- `tests/dom/`（旧 35 个文件已删除——引用了已删模块）
- 每个测试文件聚焦一类场景，文件名体现测试方向

### 11. 多层次混合嵌套

真实应用中组件、控制流、异步组件、指令、Portal 是**组合使用**的，但当前无覆盖。

设计文档：[混合嵌套极端测试设计文档](../docs/测试/混合嵌套极端测试设计文档.md)

#### 优先级

| 批次    | 组合                                    | 说明                   |
| ------- | --------------------------------------- | ---------------------- |
| 第 1 批 | Show + Async、Each + Show               | 最常用的组合模式       |
| 第 2 批 | Each + Show + Async、Each + 指令 + Show | 列表+条件+异步+动画    |
| 第 3 批 | Async + Each + Show、Portal + Show      | 异步入口+Portal 内条件 |
| 第 4 批 | 综合压力：Each+Show+Directive+Async     | 全链路                 |

#### 关注点

- Owner 链在多层嵌套后是否正确连接
- 信号绑定跨模块传播是否正常
- dispose 级联是否完整（无泄漏）
- 异步组件在控制流内 resolve 时序
- 指令在条件渲染中的生命周期

#### 通过标准

框架不崩溃，行为可预测，无 DOM 泄漏，无信号泄漏。
