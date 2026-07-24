# kiaao SVG 支持分析与方案讨论

**状态**：已采纳（标签集合检测方案）  
**日期**：2026-06-08  
**讨论参与者**：用户、AI

---

## 一、背景

kiaao 的 DOM 创建链路为：

```
JSX → h(tag, props, ...children) → createElement(tag) → document.createElement(tag)
```

`document.createElement` 创建的元素属于 **HTML 命名空间**（`http://www.w3.org/1999/xhtml`）。而 SVG 元素必须属于 **SVG 命名空间**（`http://www.w3.org/2000/svg`）才能正确渲染，需使用 `document.createElementNS(SVG_NS, tag)`。

当前 kiaao 不支持内联 SVG。

---

## 二、Namespace 说明

### 2.1 DOM Namespace 是什么

每个 DOM 元素创建时就绑定了一个 **`namespaceURI`**，且**不可改变**。它决定了：

- 该元素是哪个接口（`SVGSVGElement` vs `HTMLElement`）
- 属性如何解析（大小写敏感性、合法属性集合）
- 在浏览器中如何渲染

HTML 元素全部属于 `http://www.w3.org/1999/xhtml`，SVG 元素属于 `http://www.w3.org/2000/svg`。

### 2.2 Namespace 不继承

```js
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
const circle = document.createElement("circle");

svg.appendChild(circle);

console.log(circle.namespaceURI);
// → "http://www.w3.org/1999/xhtml"  ← 还是 HTML namespace！
// circle 是 HTMLUnknownElement，不是 SVGCircleElement
```

`appendChild` **不改变子元素的 namespace**。每个元素的 namespace 在 `createElement`/`createElementNS` 调用那一刻就固定了。不存在"父元素是 SVG，子元素自动继承"。

### 2.3 浏览器的 Magic

**仅 `<svg>` 标签有特殊处理**：

```js
document.createElement("svg").namespaceURI;
// → "http://www.w3.org/2000/svg"  ← 浏览器自动给了 SVG namespace

document.createElement("circle").namespaceURI;
// → "http://www.w3.org/1999/xhtml"  ← 不行
document.createElement("path").namespaceURI;
// → "http://www.w3.org/1999/xhtml"  ← 不行
```

所以 kiaao 当前的状态：`<svg>` 一级能用，但 `<circle>`、`<path>`、`<g>` 等子元素全是 `HTMLUnknownElement`，不渲染。

### 2.4 唯一"自动"的场景：innerHTML

```js
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.innerHTML = '<circle cx="50" cy="50" r="40"/>';

console.log(svg.firstChild.namespaceURI);
// → "http://www.w3.org/2000/svg"  ← 正确！
```

原因：浏览器解析 `innerHTML` 时，以宿主元素的 `namespaceURI` 作为解析上下文，所有子元素自动归属正确 namespace。这不是 DOM API 的继承，而是 **HTML 解析器** 的行为。

### 2.5 结论

要让 `<circle>`、`<path>`、`<g>` 等标签变成正确的 SVG 元素，只有两条路：

1. **让 `createElement` 知道当前在 SVG 上下文** → 需要 context 传递（namespace 栈或标签集合检测）
2. **绕过 `createElement`，用 `innerHTML` 让浏览器解析器处理** → 不需要 context，但内容必须是字符串

---

## 三、波及代码分析

### 受影响的核心文件

| 文件                               | 影响                                                                                 |       是否不可避免       |
| ---------------------------------- | ------------------------------------------------------------------------------------ | :----------------------: |
| **`src/core/dom-utils.ts`**        | `createElement` 始终用 `document.createElement`，不支持 namespace                    |            是            |
| **`src/core/h.ts`**                | 直接调用 `createElement(tag)`，无法传递 namespace 上下文                             |            是            |
| **`src/core/directives.ts`**       | `createWhenElement`、`createEachElement`、`renderEach` 内部调用 `createElement(tag)` |            是            |
| **`src/core/props.ts`**            | `setClassName` 对 SVG 元素（`el.className` 是 `SVGAnimatedString`）赋值方式不可靠    |            是            |
| **`src/core/components.ts`**       | `lazy` 内部用 `<div>` 做宿主，在 SVG 上下文中非法                                    | 否（可要求用户自行处理） |
| **`src/core/process-children.ts`** | TextNode 在 SVG 中合法，不受影响                                                     |            否            |
| **`src/core/ssr-helpers.ts`**      | SSR 纯字符串拼接，浏览器解析时自动处理 namespace                                     |            否            |
| **`src/core/runtime.ts`**          | 如果需要 namespace 栈，则需新增                                                      |        视方案而定        |
| **`src/jsx-runtime/index.ts`**     | 类型声明 `[elem: string]: any` 已允许 SVG 标签名                                     |            否            |

### 最小改动链

如果只走标签集合检测的路，**不可避免的文件只有 4 个**：

```
dom-utils.ts  (createElement + setClassName)
       ↓
    h.ts      (传递 namespace)
       ↓
directives.ts (传递 namespace)
       ↓
  props.ts    (setClassName 已由 dom-utils 修复)
```

---

## 四、方案讨论

### 方案一：全量 namespace 栈（已否决）

**思路**：在 runtime 中新增 `namespaceStack`，类似 `effectStack`/`componentStack`。`h()` 处理 `svg`、`foreignObject`、`math` 等边界标签时 push/pop namespace。

| 维度         | 评价                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| 改动量       | 5+ 个文件，~50 行                                                                     |
| 正确性       | 100% 符合 SVG 规范，处理 `foreignObject` 切回 HTML、`math` 切 MathML 等边界           |
| 对架构的影响 | 新增全局上下文栈，与 effectStack/componentStack 并列                                  |
| **否决理由** | namespace 栈逻辑渗透到 h、directives、components 等多处，耦合太高，破坏核心代码的干净 |

### 方案二：标签集合检测（最小 core 改动）

**思路**：只在 `dom-utils.ts` 的 `createElement` 中加一个 SVG 标签集合，对命中标签自动走 `createElementNS`。h 和 directives 只需要传递一个 `namespace` 参数即可使用，不需要额外的上下文管理。

```ts
const SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "rect",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "textPath",
  "defs",
  "use",
  "clipPath",
  "mask",
  "pattern",
  "linearGradient",
  "radialGradient",
  "stop",
  "filter",
  "symbol",
  "marker",
  "animate",
  "animateTransform",
  "set",
  "switch",
  "foreignObject",
  "image",
  "desc",
  "metadata",
]);
```

| 维度         | 评价                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| 改动量       | 3~4 个文件（dom-utils、h、directives），约 25 行                                                                |
| 覆盖率       | 覆盖 95%+ 的内联 SVG 场景                                                                                       |
| 盲区         | `a`、`title`、`style` 在 HTML 和 SVG 中都存在，无法通过标签名区分                                               |
| 对架构的影响 | 低。createElement 本身职责就是创建正确元素。h 和 directives 仅仅向下传递一个 namespace 参数，不新增任何全局状态 |
| 向后兼容     | ✅ 完全兼容，HTML 元素行为不变                                                                                  |

**遗留问题**：`a`/`title`/`style` 在 SVG 和 HTML 中都有，标签集合无法区分。但实际 UI 开发中，SVG 内手写 `<a>` 很罕见（更多是 `<path>` 绑点击事件），title 在 SVG 内是 tooltip 描述，style 在 SVG 内很少用。万一遇到，有方案三兜底。

### 方案三：dangerouslySetInnerHTML 模式（零 core 改动）

**思路**：提供一个独立的 `SVG` 工具组件（或 `ads` 工具函数），完全绕过 `h()` 的 createElement 管道，用 `innerHTML` 让浏览器解析器自动处理 namespace。

```ts
// 不碰 core，放在 utils/svg.ts 中
const SVG_NS = "http://www.w3.org/2000/svg";

export function InnerSVG(props: { html: string; [key: string]: any }): SVGElement {
  const { html, ...attrs } = props;
  const el = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) el.setAttribute(k, String(v));
  }
  el.innerHTML = html;
  return el;
}
```

| 维度         | 评价                                                                        |
| ------------ | --------------------------------------------------------------------------- |
| 改动量       | 1 个新文件，~15 行                                                          |
| 正确性       | 100%。`innerHTML` 在 SVG 元素上解析时，浏览器自动将子元素归入 SVG namespace |
| 限制         | 内容必须是字符串，不能用 JSX 写 SVG 子元素；失去 JSX 语法高亮和类型检查     |
| 对架构的影响 | **零。不碰 core。**                                                         |

**响应式更新**：如需响应式（如颜色跟随主题），可通过字符串模板或 `derive`：

```tsx
const iconColor = derive(
  () => `<path d="..." stroke="${currentTheme()}" fill="${currentFill()}"/>`,
);
<InnerSVG html={iconColor} viewBox="0 0 24 24" />;
```

但每次响应式变化时 `innerHTML` 会完全重建子 DOM 树，细粒度更新能力丢失。

### 方案四：混合策略

**思路**：方案二（标签集合）覆盖主流场景 + 方案三（InnerSVG）兜底盲区。

```
        普通 SVG（path、circle、rect 等）
                   │
         ┌─────────▼─────────┐
         │  createElement    │ ← 标签集合检测，自动 SVG namespace
         │  (dom-utils.ts)   │
         └─────────┬─────────┘
                   │
        直接用 JSX 写内联 SVG：
        <svg viewBox="...">
          <circle cx="50" cy="50" r="40" />
        </svg>
                   │
                   ▼
              正常工作

        需要在 SVG 内用 a/title/style 或动态内容
                   │
         ┌─────────▼──────────┐
         │    InnerSVG        │ ← 纯工具函数，不碰 core
         │  (utils/svg.ts)    │
         └─────────┬──────────┘
                   │
        用字符串传内容：
        <InnerSVG html={`<a href="..."><path d="..."/></a>`} />
```

| 维度         | 评价                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| 改动量       | 三四 个 core 文件 + 1 个新工具文件，约 40 行                                    |
| 正确性       | 覆盖所有场景                                                                    |
| 对架构的影响 | 低。core 改动仅限于在 `h` 和 `directives` 中传递 namespace 参数，不引入全局状态 |

---

## 五、各方案对比总表

|         方案          |         改动量          |     正确性     |        架构影响        |          JSX 书写体验           |          细粒度更新           |
| :-------------------: | :---------------------: | :------------: | :--------------------: | :-----------------------------: | :---------------------------: |
|   一：namespace 栈    |    ~50 行 / 5+ 文件     |      100%      | 高（新增全局上下文栈） |             ✅ 完整             |            ✅ 完整            |
|     二：标签集合      |   ~~25 行 / 3~~4 文件   | 95%+（有盲区） |           低           |      ✅ 完整（除盲区标签）      |            ✅ 完整            |
|   三：InnerSVG 工具   |     ~15 行 / 1 文件     |      100%      |           零           |        ❌ 字符串，无 JSX        |          ❌ 全量重建          |
| **四：混合（二+三）** | **~~40 行 / 4~~5 文件** |    **100%**    |         **低**         | **✅ 完整（降级为字符串兜底）** | **✅ 完整（降级为全量重建）** |

---

## 六、结论

**决策结果：采用方案二（标签集合检测）。**

理由：

1. **架构影响最小**——只有 `dom-utils.ts` 涉及行为改动，其余文件仅做类型放宽。不引入全局上下文栈，不改变 h() 的调用约定。
2. **改动量可控**——净增约 38 行代码，其中真正的行为逻辑仅 35 行集中在 `dom-utils.ts` 中。
3. **覆盖主流场景**——95%+ 的内联 SVG 标签由 SVG_TAGS 集合覆盖。`a`/`title`/`style` 盲区接受为已知限制，日常 UI 开发中极少触及。
4. **向后兼容**——所有现有 HTML 代码不受影响，`createElement` 只在命中 SVG_TAGS 时走新路径。

**具体改动规划见 `docs/kiaao SVG 支持分析与方案讨论.md` 末尾，或直接查看提交记录。**
