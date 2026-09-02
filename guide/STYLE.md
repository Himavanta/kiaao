# Documentation Style Guide / 文档编写风格指南

**状态**：定稿  
**适用**：kiaao 项目下所有面向用户的文档（README、guide/ 目录下的引导文档、框架规范）  
**版本**：v1.3  
**日期**：2026年9月2日

## 一、核心原则

本文档是**可执行规范**：规则附带判定条件与正反例，供人类编写者与自动执行 agent 共同遵循；规则的表述不依赖任何具体项目。

**清晰优于简洁。** 宁可多写几句话让语义明确，也不要为了节省篇幅而引入歧义。

**一致优于个性。** 整份文档的格式、措辞、代码风格应保持一致。读者不应该因为阅读了不同章节而感到切换了语境。

**双语平等。** 英文和中文都是第一语言。两种语言应各自完整、连贯，不以其中一种作为另一种的注释或附属。

**可判定优先于完备。** 每条规则都应能被机械检查或正反例裁决。两种模式二选一时，给出判定条件；无法给出精确条件时，用正反例让边界可见。宁可规则稍窄而明确，不要宽泛到无法执行。

## 二、中英文双语规则

### 2.1 标题

每个章节的标题**同时给出英文和中文**，用 `/` 分隔：

```markdown
## Quick Start / 快速开始

### Definition Mode / 定义模式
```

**规则**：

- 英文在前，中文在后
- 用 `/`（空格 + 斜杠 + 空格）分隔
- 只用于 `h2` 和 `h3` 级别的标题。更深层级（`h4` 及以下）通常只使用一种语言

**粗体小标题**（非标题层级，如 `**Self-hosted (default):**`）分两种情况：

- **纯标题**（后接代码块或双语正文块）：合并为单行——`**Self-hosted (default) / 自托管（默认）：**`。同一标题写成两行（英一行、中一行）重复且占版面。
- **特殊块标题**（标题后跟各自语言的正文，见 §2.5）：英文块与中文块各自成块，标题随正文语言。

### 2.2 正文段落：块级双语

正文段落采用**块级双语**模式——先完成一段完整的英文，再用空行分隔，完成对应的中文。两种语言各自独立、完整、连贯：

```markdown
A component function runs once when mounted. The DOM is created, signals are created, and JSX expressions like `{count}` bind signals to their text nodes. When a setter is called later, only the bound text node updates. The component function does not re-run.

组件函数在挂载时运行一次。DOM 被创建，信号被创建，`{count}` 这样的 JSX 表达式将信号绑定到对应的文本节点。之后调用 setter 时，只有绑定的文本节点更新。组件函数不会重新运行。
```

**规则**：

- 英文段落和中文段落之间用空行分隔
- 两种语言的段落内容应对等，但不要求逐句翻译
- 不要在同一个段落内部交替中英文句子
- 块的最小粒度是**一个完整主题**：英文块与对应中文块应各自包含对一个主题的完整论述（通常多句）。一两句的段落单独成块仍会造成频繁切换——此类碎片并入相邻块

**不推荐的写法**：

```markdown
A component function runs once when mounted.
组件函数在挂载时运行一次。
The DOM is created, signals are created.
DOM 被创建，信号被创建。
```

这种“逐句交替”会让两种语言的读者都感到阅读不连贯。

### 2.3 API 参数列表（定位查找型）

适用于读者**定位某一项**的清单——API 参数、选项、配置项等。每个条目按以下格式组织——**标题行 + 独立语言段落**：

```markdown
- **`signal`**

  A boolean getter. You toggle this to show/hide content.

  布尔值 getter。你通过它控制显隐。

- **`context`** (optional / 可选)

  Component context. When provided, signal cleanup is bound to the component lifecycle.

  组件 context。传入时信号清理绑定到组件生命周期。
```

**规则**：

- 参数名用粗体 + 行内代码格式（``**`paramName`**``）
- 可选参数标注 `(optional / 可选)`
- 英文描述和中文描述各占一个独立段落，中间用空行分隔
- 简短条目（一行能写完的）可以合并到一行：``- **`aria-*` / `data-*`** — Output as-is. / 原样输出。``

**不推荐的写法**：

```markdown
- **`signal`** — A boolean getter. You toggle this to show/hide content.
- **`signal`** — 布尔值 getter。你通过它控制显隐。
```

这种写法导致同一参数在两个条目中重复出现，阅读体验差。

**与 §2.6 的判定**：条目是并列的独立信息、读者通常只查其中一条（参数、选项、配置项）→ 用本条格式；条目按顺序推进、读者顺着读（步骤、流程）→ 用 §2.6 整块切换。拿不准时问一句：读者是“跳着找”还是“顺着读”。

### 2.4 代码块

**代码块只写一次，不重复。** 英文段落和中文段落共享同一个代码块：

```markdown
The compute function runs immediately when the derivation is created, and re-runs whenever any of its declared dependencies change. The result is cached.

计算函数在派生创建时立即执行，并在任何声明的依赖发生变化时重新执行。结果会被缓存。

\`\`\`js
const count = use(1);
const double = use(count, () => count() \* 2);
\`\`\`
```

**规则**：

- 代码块位于中英文段落之后
- 代码块内的注释**使用英文**
- 如果代码块需要同时向中英文读者解释，可以使用简短的中英文并列注释：`// direct replacement / 直接替换`

### 2.5 特殊块（注意、提示、声明）

使用粗体标题 + 正文的格式：

```markdown
**Recommendation:** When you need a wrapper that leaves no DOM trace, explicitly use a native element with `style="display: contents"`.

**建议**：当你需要一个无 DOM 痕迹的包裹容器时，显式使用原生元素并自行设置 `style="display: contents"`。
```

### 2.6 列表（叙述/流程型）

适用于**按顺序叙述**的列表——步骤、流程、特性清单。**若列表是定位查找型**（读者只找某一项），改用 §2.3 的条目级格式。

**有序列表和无序列表**采用**整块切换**模式——先完整列出所有英文条目，再用空行分隔，完整列出所有中文条目：

```markdown
When navigating to `/dashboard/users`:

1. The top-level `RouterView` matches `dashboard` → renders `DashboardLayout`.
2. Inside `DashboardLayout`, the nested `RouterView` with `base="/dashboard"` strips the prefix, leaving `/users`.
3. It matches `users` in `dashboardRoutes` → renders `Users`.
4. `DashboardLayout` (including `Sidebar`) stays in the DOM. Only the content inside `<main>` updates.

导航到 `/dashboard/users` 时：

1. 顶层 `RouterView` 匹配 `dashboard` → 渲染 `DashboardLayout`。
2. 在 `DashboardLayout` 内部，带有 `base="/dashboard"` 的嵌套 `RouterView` 将前缀裁剪，剩下 `/users`。
3. 在 `dashboardRoutes` 中匹配 `users` → 渲染 `Users`。
4. `DashboardLayout`（包括 `Sidebar`）保留在 DOM 中。只有 `<main>` 中的内容更新。
```

**规则**：

- 先完整列出英文列表，再完整列出中文列表
- 两者之间用空行分隔
- 有序列表和无序列表均适用
- **有序列表的编号陷阱**：多数渲染器会把两个被空行分隔的有序列表合并续号——英文列到 1、2 之后，中文列会显示为 3、4。需要两组都从 1 开始时：改用无序列表两遍式；或在两组之间插入非列表内容分隔；或将序号并入粗体标题（`**1. 标题 / 中文标题：**` + 双语正文块，见 §2.1）

**理由**：有序列表的每个步骤之间有逻辑先后关系。逐句交替会打断这个逻辑流——读完英文步骤 1 后立刻看到中文步骤 1，再回到英文步骤 2，读者很难连贯地理解整个流程。整块切换让读者可以一口气读完所有英文步骤，或一口气读完所有中文步骤，流程的连贯性得以保持。

**不推荐的写法**：

```markdown
- CSS selectors like `:nth-child` or the `>` direct child combinator will count the container element.
- CSS 选择器（如 `:nth-child`、`>` 直接子代选择器）会将容器元素计入。
- DOM traversal APIs (`parentNode.children`, `previousElementSibling`, etc.) will see the container node.
- DOM 遍历 API（`parentNode.children`、`previousElementSibling` 等）会看到容器节点。
```

这种逐句交替在无序列表中同样会打断阅读节奏。

### 2.7 表格

表格采用**行级拆分**模式——每个数据行拆为两行：第一行英文，第二行中文。表头可用 `/` 合并为一行：

```markdown
| Property / 属性 | Type / 类型              | Description / 说明                                  |
| --------------- | ------------------------ | --------------------------------------------------- |
| `RouterView`    | Component                | The route view. Renders the matched component.      |
|                 |                          | 路由视图。渲染匹配的组件。                          |
| `Link`          | Component                | Declarative navigation link.                        |
|                 |                          | 声明式导航链接。                                    |
| `navigate`      | `(path: string) => void` | Programmatic navigation. Receives an absolute path. |
|                 |                          | 编程式导航。接收完整绝对路径。                      |
```

**规则**：

- 每个数据行包含两行——第一行英文，第二行中文
- 中文行的第一个单元格（属性名列）留空
- 表头用 `Property / 属性` 格式合并为一行
- 当描述较长时，分行比用 `/` 分隔在同一个单元格内更易于阅读——读者视线可以纵向扫描而不被另一语言干扰

**对于简单表格**（单元格内容简短，一行能写完），可以用 `/` 分隔在同一个单元格内：

```markdown
| Hook / 钩子     | When it runs / 执行时机          |
| --------------- | -------------------------------- |
| `onMount(fn)`   | After DOM insertion / DOM 插入后 |
| `onUnmount(fn)` | Before DOM removal / DOM 移除前  |
```

**长描述表格**：当描述需要两行以上时，行级拆分让读者逐行跳语言——可改为**两遍式**（先完整英文表，空行后完整中文表），每张表自含。

**模式判定**：单元格一行能写完（约 6 词内）→ `/` 合并；需要多句或超出一行 → 行级拆分；整表描述普遍需两行以上 → 两遍式。

**表格禁区**：表格不用于承载代码与长文本。内容以代码、映射、等宽对齐为佳（如 `token → 声明` 对照）时改用代码块（见 §3.4）；单元格内不放长代码段或长句——格式化工具会把列撑到最长单元格的宽度，可读性随最宽列崩塌。

### 2.8 粒度选择指南

“块级双语”的块大小是**文档级选择**，按文档类型与读者行为决定：

| 文档类型 / 读者行为         | 推荐粒度                           |
| --------------------------- | ---------------------------------- |
| 门面（README）——扫读        | 主题级大块；小节特别多时可章节级分离 |
| 引导（guide）——按序学习     | 主题级大块                         |
| 参考/规范（spec）——定位查找 | 条目级小块（§2.3）                 |

原则：**叙述型内容用大块**（论述连贯），**查找型内容用小块**（逐条对照）。判断标准：读者是“顺着读”还是“跳着找”。

写作前先确定本篇的读者行为，据此锁定粒度，并在文档元信息中声明（见 §4.4）。

## 三、代码示例规范

### 3.1 代码语言

所有代码块标注正确的语言标识：

```markdown
\`\`\`jsx
function Comp() { ... }
\`\`\`

\`\`\`ts
function use<T>(initialValue: T): Signal<T>;
\`\`\`

\`\`\`bash
npm install kiaao
\`\`\`
```

### 3.2 代码注释

代码块内的注释使用**英文**。对于面向中文读者的示例，可以在代码块前后用中文段落解释代码的功能。

如果注释需要同时向中英文读者解释，使用简短的中英文并列：

```js
count(42); // direct replacement / 直接替换
```

### 3.3 伪代码声明

如果代码块是示意性伪代码（不是可直接运行的实际代码），必须在代码块之前声明。可以使用全局声明（文档顶部）或局部声明（代码块前）：

```markdown
> **声明**：本文档中的代码示例均为示意伪代码，用于说明概念和设计模式。具体实现由开发者根据实际需求自行决定。

\`\`\`ts
// 伪代码示例
function createMotion(signal, context?) {
// ...
}
\`\`\`
```

### 3.4 行内代码与代码块的选择

**判定**：单个标识符、属性名、路径片段用行内代码；出现以下任一情况一律改用代码块：

- 代码含**反引号**（模板字符串、shell 反引号等）
- 多行结构，或需要等宽对齐的映射（如 `token → 声明` 对照）
- 长度超过约一个短句，或需要语法高亮

**反引号禁令**：markdown 行内代码没有转义机制——行内出现反引号会提前闭合代码段，`` \` `` 中的反斜杠只是字面字符。这类内容会被渲染器与格式化工具反复改写。含反引号的代码只能放进代码块：

````markdown
```ts
p: (v) => `padding:${v}`; // 模板字符串写进代码块
```
````

（上面的演示自身用四反引号围栏，内层才能安全包含三反引号代码块。）

若确需在句子中引用含反引号的代码：用双反引号围栏包裹（`` `` `name` `` ``），并在运行格式化工具后复核。

## 四、文档结构规范

### 4.1 文档类型分层

项目中的文档分为三个层级：

| 层级             | 位置            | 定位                                    | 语言要求 |
| ---------------- | --------------- | --------------------------------------- | -------- |
| README           | 根目录          | 项目门面，快速开始 + 导航               | 中英双语 |
| Guide / 引导     | `guide/`        | 按学习路径组织的引导文档                | 中英双语 |
| Spec / 规范      | `guide/spec.md` | 框架的权威定义，精确描述每个 API 的行为 | 中英双语 |
| Notes / 设计讨论 | `docs/`         | 设计过程的存档，面向协作者              | 中文为主 |

### 4.2 文件命名

- 引导文档：英文小写 + 短横线（`reactivity.md`, `control-flow.md`）
- 设计讨论：中文描述性命名（`动画方案探索与 Motion 指令实现.md`）

### 4.3 章节组织

引导文档按“概念 → 用法 → 示例 → 下一步”的顺序组织：

1. 简要介绍：这是什么、为什么需要它
2. 核心 API 说明：签名、参数、返回值
3. 使用示例：从简单到复杂
4. 注意事项 / 边界情况
5. 指向下一篇引导文档的链接

### 4.4 文档元信息与读者行为

每个文档头部给出元信息块，与本文档头部同构：

```text
**Status / 状态**：草稿 / 定稿
**Applies to / 适用**：本文档覆盖的文档范围
**Version / 版本**：语义化版本号
**Date / 日期**：YYYY年M月D日
**Reader behavior / 读者行为**：扫读 / 按序学习 / 定位查找（三选一）
```

“读者行为”锁定 §2.8 的粒度：门面文档声明扫读（主题级大块）、引导文档声明按序学习（主题级大块）、参考文档声明定位查找（条目级小块）。该行让编写者与 agent 开篇即知全文的粒度取向。

### 4.5 写作流程

1. 确定文档类型与读者行为（§2.8、§4.4），列出大纲与章节标题
2. 逐节写作：先标题骨架，再成块双语正文；代码块就近放在所属节，不集中到文末
3. 运行项目配置的格式化工具（§6.6），以工具输出为排版基线
4. 按 §7 审阅清单自查：先跑可机械验证项，再通读需人工判断项

## 五、措辞与术语

### 5.1 英文术语统一

| 术语                | 统一写法                        |
| ------------------- | ------------------------------- |
| 信号（getter 函数） | `signal` 或 `getter`            |
| 信号的 setter       | `setter`                        |
| 创建信号            | `create a signal`               |
| 派生信号            | `derived signal`                |
| 组件卸载            | `unmount`                       |
| 元素挂载            | `mount` / `element is inserted` |
| 指令                | `directive`                     |
| 生命周期            | `lifecycle`                     |

### 5.2 中文术语统一

| 术语        | 统一写法                                            |
| ----------- | --------------------------------------------------- |
| 信号        | 信号                                                |
| 派生        | 派生                                                |
| 副作用      | “副作用”（带引号，因为 kiaao 中不存在真正的副作用） |
| 挂载 / 卸载 | 挂载 / 卸载                                         |
| 响应式      | 响应式                                              |
| 指令        | 指令                                                |
| 生命周期    | 生命周期                                            |

### 5.3 框架名称

统一使用 `kiaao`（全小写）。不写成 `Kiaao` 或 `KIAAO`。

### 5.4 术语引入与翻译（通用规则）

- **术语阶梯**：新术语在首次出现的章节定义（加粗或一句话解释）；禁止在定义之前使用。前置章节确需提及时，先给简短定义，或改用读者无门槛的措辞
- **标识符不翻译**：代码标识符、API 名、属性名、文件名保持原文与行内代码格式，不做中译
- **概念只论述一次**：同一概念在一处完整展开；后续章节引用前文并附链接，不重复论述（例如“回顾 §x 中的形态”）
- **命名规范独立成表**：项目自身的名称大小写约定与术语表记录在本章或项目文档中；正文任何位置保持一致，包括句首

## 六、格式细节

### 6.1 空行

- 英文段落和中文段落之间**必须**有空行
- 代码块前后**必须**有空行
- 标题前后**必须**有空行

### 6.2 行内代码

- API 名称、prop 名称、变量名使用行内代码格式：`` `use` ``、`` `from` ``
- 信号值、普通值不需要行内代码格式：`42`、`"hello"`

### 6.3 链接

- 内部链接使用相对路径：`[Lifecycle / 生命周期](./lifecycle.md)`
- 链接文本同时包含中英文：`[Quick Start / 快速开始](./quick-start.md)`

### 6.4 粗体与强调

- 关键概念首次出现时使用粗体：**进入动画**
- 不要在正文中使用斜体（中文的斜体可读性差）

### 6.5 标点与符号

- 标点跟随所在语言：英文段落用英文标点（长破折号 em dash — 两侧留空格，不用连字符 `-` 顶替）；中文段落用中文标点（破折号 ——，两侧不加空格）
- 两种语言不混用对方的标点；引号、括号等成对符号在各自语言内配对
- 数字、单位与代码原样保留（`px`、`ms`、`em` 等不翻译）

### 6.6 与格式化工具的协作

- 文档提交前运行项目配置的格式化工具；排版以工具输出为基线（表格宽度、缩进、空行等由工具统一）
- 表格列宽不手调：工具会等宽化所有列，写作时只需保证内容正确
- 代码块内容可能被工具格式化（如补分号、重排）：先按本规范写作，运行工具后复核语义未被改写
- 被格式化工具反复改写或改回的内容，是写法与工具冲突的信号——按本规范改用推荐写法（§3.4），不要对抗工具

## 七、审阅清单

提交前先跑**可机械验证**项（可由脚本或工具检查），再逐条通读**需人工判断**项。

**可机械验证：**

- [ ] 行内代码中无嵌套反引号——正文不出现反斜杠 + 反引号的组合，双反引号围栏处复核（§3.4）
- [ ] 非代码块行的反引号成对
- [ ] 代码块标注了语言（§3.1）
- [ ] 链接有效：相对路径存在，锚点与标题匹配
- [ ] 已运行格式化工具且无告警（§6.6）

**需人工判断：**

- [ ] 英文段落可独立阅读，不依赖中文段落
- [ ] 中文段落可独立阅读，不依赖英文段落
- [ ] 代码块只出现一次，不在中英文之间重复
- [ ] API 参数列表使用统一格式（§2.3）
- [ ] 表格模式判定正确且无代码/超长内容入表（§2.7）
- [ ] 列表类型判定正确（§2.3 vs §2.6）；有序列表未用两遍式编号
- [ ] 双语块为主题级——没有一两句短段的交替
- [ ] 粗体纯标题已合并为单行（`Title / 标题`），未两行重复
- [ ] 术语阶梯成立——无前置使用未定义术语（§5.4）
- [ ] 无跨节重复论述——后文引用前文（§5.4）
- [ ] 标点跟随所在语言（§6.5）
- [ ] 术语与项目术语表一致；名称大小写全文统一

## 八、示例对照

### ✅ 推荐写法

```markdown
### `onMount` / 挂载回调

`onMount(fn)` registers a callback that runs after the component's DOM is inserted into the document. It can be called anywhere — at the top level of the component function, inside a nested function, or inside another `onMount` callback — as long as the component instance has not been disposed.

`onMount(fn)` 注册一个回调，在组件的 DOM 插入文档后执行。它可以在任何地方调用——组件函数顶层、嵌套函数内部、或另一个 `onMount` 回调内部——只要组件实例尚未被销毁。

**Execution timing / 执行时机：**

| When called / 调用时机 | Behavior / 行为                                             |
| ---------------------- | ----------------------------------------------------------- |
| Before mount / 挂载前  | `fn` is queued, waits for mount / `fn` 被推入队列，等待挂载 |
| After mount / 挂载后   | `fn` runs immediately / `fn` 立即执行                       |

\`\`\`jsx
function App(props, { onMount }) {
onMount(() => {
console.log("Component is in the DOM");
});
return <div>Hello</div>;
}
\`\`\`
```

### ❌ 不推荐的写法

```markdown
### onMount

onMount(fn) registers a callback.
onMount(fn) 注册一个回调。
It can be called anywhere.
它可以在任何地方调用。
The callback runs after DOM insertion.
回调在 DOM 插入后执行。

| When called  | Behavior      |
| ------------ | ------------- |
| Before mount | fn is queued  |
| 挂载前       | fn 被推入队列 |

\`\`\`jsx
// 英文代码
function App(props, { onMount }) {
onMount(() => {
console.log("mounted");
});
}
\`\`\`

\`\`\`jsx
// 中文代码（重复）
function App(props, { onMount }) {
onMount(() => {
console.log("已挂载");
});
}
\`\`\`
```

**问题**：逐句交替破坏阅读连贯性；表格中英文分离；代码块重复。

**文档版本**：v1.3  
**撰写日期**：2026年9月2日  
**状态**：定稿
