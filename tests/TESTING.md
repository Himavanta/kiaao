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

### 9. SSR 与 DOM 混用

- SSR adapter 下执行 `adapter.on()`（应无操作）
- SSR adapter 下执行 `adapter.before()`（应无操作）
- SSR 序列化含特殊字符的文本 / 属性值

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
