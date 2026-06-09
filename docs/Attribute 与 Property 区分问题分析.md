# kiaao 框架属性（Attribute / Property）处理策略

**版本**：v1.0  
**状态**：定稿  
**更新日期**：2026-06-09

## 1. 背景

在 DOM 编程中，**HTML 属性（attribute）** 与 **DOM 属性（property）** 是两套独立的系统。某些关键属性（如 `value`、`checked`）必须通过 property 赋值才能正确响应用户交互；而另一些属性（如 `class`、`for`）由于 property 名称不同或类型不兼容，必须通过 `setAttribute` 设置。

在 kiaao 的早期实现中，`setProp` 对非 class/style/事件属性统一走 `el.setAttribute(key, String(value))`。这种方式对大多数静态属性工作正常，但在以下场景中失效：

- `innerHTML` 走 `setAttribute` 创建无用 attribute，内容不渲染
- `value` 走 `setAttribute` 只设初始值（defaultValue），用户交互后不再同步
- `checked` 同理，只设 defaultChecked
- `indeterminate` 根本没有对应 attribute，永远不生效

为了在框架层面提供一个 **可预测、零猜测、易维护** 的解决方案，同时降低开发者的认知负担，我们制定以下策略。

## 2. 核心设计原则

- **显式优于隐式**：框架的行为应可预测，开发者能根据属性名直接推断出底层操作。
- **默认走 property**：绝大多数现代框架中，直接操作 DOM property 性能更好、类型更丰富（可传递对象、数组等）。
- **小范围例外**：仅当 property 赋值会失败或语义错误时，才回退到 `setAttribute`。
- **不做命名转换**：开发者书写的属性名（key）是什么就是什么，框架不会进行驼峰/小写转换，也不要求统一命名风格。
- **特殊属性单独处理**：`style`、事件等有独立逻辑，不参与通用属性分支。

## 3. FORCE_ATTRIBUTE 列表

### 3.1 筛选原则

**一个属性是否在 FORCE_ATTRIBUTE 中，取决于你是否会在纯 HTML 中手写它。**

```
会在纯 HTML 中手写 → 在列表中 → 客户端走 setAttribute，SSR 输出
不会在纯 HTML 中手写 → 不在列表中 → 客户端走 property，SSR 忽略
```

### 3.2 例外：`value` 和 `checked`

`value` 和 `checked` 虽然在纯 HTML 中常见，但在 kiaao 中必须走 property 赋值才能实现受控组件语义。它们**不在** FORCE_ATTRIBUTE 中。

如果开发者确实需要在 SSR 中输出初始值，可在 JSX 中自行判断并追加为 attribute（框架不特殊处理）。

### 3.3 完整列表

> 以下列表涵盖标准 HTML 全局属性、表单、链接、媒体、表格、脚本等常见场景。按类别分组以便查阅。

```ts
const FORCE_ATTRIBUTE = new Set([
  // ── 全局属性 ──
  "class",
  "id",
  "lang",
  "dir",
  "title",
  "hidden",
  "tabindex",
  "accesskey",
  "contenteditable",
  "draggable",
  "spellcheck",
  "autocapitalize",
  "translate",
  "slot",

  // ── 表单与输入 ──
  "name",
  "type",
  "placeholder",
  "required",
  "disabled",
  "readonly",
  "maxlength",
  "minlength",
  "size",
  "min",
  "max",
  "step",
  "pattern",
  "autocomplete",
  "autofocus",
  "multiple",
  "accept",
  "capture",
  "selected",

  // ── 链接与导航 ──
  "href",
  "target",
  "rel",
  "download",
  "hreflang",
  "ping",
  "referrerpolicy",

  // ── 媒体（img / video / audio / source） ──
  "src",
  "alt",
  "width",
  "height",
  "srcset",
  "sizes",
  "loading",
  "decoding",
  "crossorigin",
  "poster",
  "preload",
  "autoplay",
  "controls",
  "loop",
  "muted",
  "playsinline",

  // ── iframe ──
  "srcdoc",
  "sandbox",
  "allow",
  "allowfullscreen",
  "frameborder",

  // ── 表格 ──
  "colspan",
  "rowspan",
  "headers",
  "scope",

  // ── script / style / link / meta ──
  "async",
  "defer",
  "integrity",
  "media",
  "charset",
  "httpEquiv",

  // ── 其他常用 ──
  "for",
  "usemap",
  "ismap",
  "cite",
  "datetime",
  "form",
  "formaction",
  "formenctype",
  "formmethod",
  "formnovalidate",
  "formtarget",
  "novalidate",
  "nonce",
]);
```

### 3.4 不在列表中的常见属性

| 属性                      | 原因               | 客户端行为                            |
| ------------------------- | ------------------ | ------------------------------------- |
| `value`                   | 受控组件语义       | `el.value = val`                      |
| `checked`                 | 受控组件语义       | `el.checked = bool`                   |
| `innerHTML`               | 非标准 HTML 写法   | `el.innerHTML = str`                  |
| `textContent`             | 非标准 HTML 写法   | `el.textContent = str`                |
| `innerText`               | 非标准 HTML 写法   | `el.innerText = str`                  |
| `indeterminate`           | 无对应 attribute   | `el.indeterminate = bool`             |
| `className`               | 驼峰 property 写法 | `el.className = str`（转为 property） |
| `htmlFor`                 | 驼峰 property 写法 | `el.htmlFor = str`（转为 property）   |
| 自定义属性（非 `data-*`） | 无标准 HTML 意义   | `el[key] = val`                       |

### 3.5 两类写法的兼容

FORCE_ATTRIBUTE 列表中的 key 均为**开发者可使用的原始 key**（JSX 中写的属性名）。驼峰写法（如 `className`、`tabIndex`）不在列表中，走 property 赋值：

```tsx
<div className="btn">          // → el.className = 'btn'       ✅
<div class="btn">              // → setAttribute('class', 'btn') ✅
<input tabIndex={0} />         // → el.tabIndex = 0           ✅
<input tabindex="0" />         // → setAttribute('tabindex', '0') ✅
```

两种方式均正确，开发者任选。

## 4. 显式前缀：`attr:` 与 `prop:`

### 4.1 设计目的

FORCE_ATTRIBUTE 列表覆盖了标准 HTML 场景，但总有例外情况需要开发者手动控制。为此提供两个显式前缀，优先级高于一切自动规则：

|    前缀    | 含义                    |          客户端行为          |     SSR 行为     |
| :--------: | ----------------------- | :--------------------------: | :--------------: |
| `attr:xxx` | 强制作为 HTML attribute | `setAttribute('xxx', value)` | 输出 `xxx="..."` |
| `prop:xxx` | 强制作为 DOM property   |       `el.xxx = value`       |       忽略       |

### 4.2 适用场景

```tsx
// 场景一：Web Component 需要 attribute 触发 attributeChangedCallback
<my-element attr:data={chartData} />

// 场景二：覆盖 FORCE_ATTRIBUTE，强制走 property
<my-button prop:disabled={isDisabled()} />

// 场景三：SSR 中输出表单初始值
<input attr:value="initial" />

// 场景四：强制将未知属性作为 attribute
<div attr:some-attr="value" />
```

### 4.3 组件透传

组件（函数）**不处理前缀**。前缀作为普通 prop 名原样传入组件内部，只有到达 DOM 元素的 `setProp` 时才被识别。这是框架自然的行为，不需要特殊代码。

```tsx
function MyInput(props) {
  return <input {...props} />;
}

// MyInput 收到 { 'attr:placeholder': 'Name' }
// 透传到 <input> 后在 setProp 中识别为 attr: → setAttribute('placeholder', 'Name')
<MyInput attr:placeholder="Name" />;
```

### 4.4 前缀剥离规则

框架只做前缀剥离，**不做命名转换**。开发者写了什么 key 就是什么 key：

```
attr:viewBox   → 剥离后 viewBox（SVG 中正确）
attr:view-box  → 剥离后 view-box（也是有效的 attribute 名）
prop:someProp  → 剥离后 someProp（走 property 赋值）
prop:some-prop → 剥离后 some-prop（走 property，但该 property 名可能有短横线）
```

短横线 vs 驼峰的映射由开发者处理，框架不介入。

## 5. 特殊属性处理

### 5.1 `style` 属性

`style` 根据值类型走不同路径，在前缀剥离后、其他所有分支之前处理：

```ts
if (key === "style") {
  if (typeof value === "string") {
    el.setAttribute("style", value);
  } else if (value && typeof value === "object") {
    el.removeAttribute("style");
    Object.assign(el.style, value);
  }
  return;
}
```

SVG 元素也走此分支，不做单独处理（SVG 的 `el.style` 与 HTML 一致）。

### 5.2 事件属性

以 `on` 开头且后接大写字母的属性视为事件绑定，在 style 之后处理（仅在无前缀时）：

```ts
const EVENT_RE = /^on[A-Z]/;

if (!prefix && EVENT_RE.test(key)) {
  const eventName = key.slice(2).toLowerCase();
  el.addEventListener(eventName, value);
  return;
}
```

> 前缀可以覆盖事件，如 `attr:onClick` 会创建内联 event handler attribute（罕见但有合法用途）。

### 5.3 `class` / `className`

不再需要独立拦截。

- `class` → 在 FORCE_ATTRIBUTE 中 → `setAttribute('class', value)` ✅
- `className` → 不在 FORCE_ATTRIBUTE 中 → 默认走 property → `el.className = value` ✅

两种写法均正确，无需框架特殊处理。SVG 元素上 `className` 会创建 `className` attribute（非 `class`），由开发者自行负责。

### 5.4 `aria-*` / `data-*` 属性

这类属性没有对应的 DOM property，在无前缀时走 `setAttribute`：

```ts
if (key.startsWith("aria-") || key.startsWith("data-")) {
  el.setAttribute(key, String(value));
  return;
}
```

前缀可覆盖：`prop:aria-label` 会尝试 `el['aria-label'] = value`（创建一个无意义的 JS property，不推荐但合法）。

### 5.5 SVG 元素

SVG 元素默认走 `setAttribute`，这是因为 SVG 的 DOM property 大多是复杂对象（`SVGAnimatedRect`、`SVGAnimatedLength` 等），字符串 property 赋值几乎总是错的。

SVG 分支不需要处理 `style`（style 已被前置拦截），其余属性一律 `setAttribute`：

`prop:cx="50"` 等显式前缀会先被前缀分支拦截，不会进入此分支。开发者需自行承担 SVG 只读 property 的后果。

```ts
if (el instanceof SVGElement) {
  el.setAttribute(key, String(value));
  return;
}
```

> `attr:` 前缀在 SVG 上走 `setAttribute`，`prop:` 前缀在 SVG 上走 property 赋值。显式前缀先于 SVG 分支处理。

## 6. 客户端完整决策流程

```
setProp(el, rawKey, value)  →  value == null?  →  return
           │
    ┌──────┴──────┐
    │  剥离前缀    │
    │  (记录 prefix)
    └──────┬──────┘
           │
    ┌──────┴──────┐
    │ SVG 元素？   │──是──→  style → 处理 style
    │              │        其余 → setAttribute
    └──────┬──────┘
          否
           │
    ┌──────┴──────┐
    │ prop: 前缀？  │──是──→ el[key] = value（立即返回）
    └──────┬──────┘
          否
    ┌──────┴──────┐
    │ attr: 前缀？  │──是──→ setAttribute(key, String(value))（立即返回）
    └──────┬──────┘
          否
           │
    ┌──────┴──────┐
    │ 无前缀标准流程 │
    │              │
    │ 事件 (on*)   → addEventListener
    │ style        → style 分支
    │ aria-/data-  → setAttribute
    │ FORCE_ATTR   → setAttribute（含布尔处理）
    │ 其余         → el[key] = value
    └──────────────┘
```

### 实现伪代码

```ts
function setProp(el: Element, rawKey: string, value: unknown): void {
  if (value == null) return;

  // 1. 剥离前缀
  const prefix = rawKey.startsWith("attr:") ? "attr" : rawKey.startsWith("prop:") ? "prop" : null;
  const key = prefix ? rawKey.slice(5) : rawKey;

  // 2. prop: 前缀 → 强制 property
  if (prefix === "prop") {
    el[key] = value;
    return;
  }

  // 3. attr: 前缀 → 强制 setAttribute
  if (prefix === "attr") {
    el.setAttribute(key, String(value));
    return;
  }

  // 4. 无前缀：style（值类型决定路径，与 SVG/HTML 无关）
  if (key === "style") {
    if (typeof value === "string") {
      el.setAttribute("style", value);
    } else if (value && typeof value === "object") {
      el.removeAttribute("style");
      Object.assign(el.style, value);
    }
    return;
  }

  // 5. 无前缀：事件
  if (/^on[A-Z]/.test(key)) {
    el.addEventListener(key.slice(2).toLowerCase(), value);
    return;
  }

  // 6. 无前缀：SVG 全部 setAttribute
  if (el instanceof SVGElement) {
    el.setAttribute(key, String(value));
    return;
  }

  // 7. 无前缀：aria-* / data-*
  if (key.startsWith("aria-") || key.startsWith("data-")) {
    el.setAttribute(key, String(value));
    return;
  }

  // 8. 无前缀：FORCE_ATTRIBUTE
  if (FORCE_ATTRIBUTE.has(key)) {
    if (typeof value === "boolean") {
      if (value) el.setAttribute(key, "");
      else el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(value));
    }
    return;
  }

  // 9. 默认：property 赋值
  el[key] = value;
}
```

## 7. SSR 序列化策略

### 7.1 原则

SSR（`renderToString`）输出的 HTML 中，只包含**需要在浏览器首次渲染时以 attribute 形式存在的属性**。客户端仅通过 property 赋值的属性在 HTML 中没有意义，不予输出。

**SSR 输出以下属性**：

1. `attr:` 前缀的属性（剥离前缀后输出）
2. `style` → 字符串或对象均序列化为 `style="..."`
3. `aria-*` / `data-*` → 原样输出
4. `FORCE_ATTRIBUTE` 中的属性 → 原样输出
5. `class` 在 FORCE_ATTRIBUTE 中，自动输出

**SSR 忽略以下属性**：

1. `prop:` 前缀的属性
2. `on*` 事件属性
3. 不在 FORCE_ATTRIBUTE 中的无前缀属性（`value`、`checked`、自定义 property 等）
4. `children`
5. 响应式函数（SSR 中一次取值，属于上述分类后处理）

### 7.2 布尔属性序列化规则

|    值    |      SSR 输出      |
| :------: | :----------------: |
|  `true`  | `disabled`（无值） |
| `false`  |       不输出       |
| `"true"` | `disabled="true"`  |
|   `0`    |   `disabled="0"`   |

### 7.3 SSR 决策流程

```
serializeAttrs(props)
    │
    ┌── 遍历每个 key ──┐
    │                  │
    children → 跳过     │
    IS_REACTIVE → 求值  │
    null/false → 跳过   │
    │                  │
    ┌──┴──┐            │
    │剥离前缀│           │
    └──┬──┘            │
       │               │
  ┌────┴────┐          │
  │ prop:?   │─是─→ 跳过 │
  └────┬────┘          │
      否               │
  ┌────┴────┐          │
  │ attr:?   │─是─→ 输出  │
  └────┬────┘          │
      否               │
       │               │
  无前缀标准流程          │
  ├─ 事件 (on*) → 跳过   │
  ├─ style     → style   │
  ├─ aria-/data → 输出   │
  ├─ FORCE_ATTR → 输出   │
  └─ 其余      → 跳过    │
    ────────────         │
```

### 7.4 实现伪代码

```ts
function serializeSSRAttrs(props: Record<string, any>): string {
  if (!props || typeof props !== "object") return "";
  let html = "";

  for (const rawKey of Object.keys(props)) {
    if (rawKey === "children") continue;

    let val = props[rawKey];
    if ((val as any)?.[IS_REACTIVE]) val = val();
    if (val == null || val === false) continue;

    // 剥离前缀
    const prefix = rawKey.startsWith("attr:") ? "attr" : rawKey.startsWith("prop:") ? "prop" : null;
    const key = prefix ? rawKey.slice(5) : rawKey;

    // prop: → 跳过
    if (prefix === "prop") continue;

    // attr: → 输出
    if (prefix === "attr") {
      if (val === true) {
        html += ` ${key}`;
      } else {
        html += ` ${key}="${escapeAttr(String(val))}"`;
      }
      continue;
    }

    // 无前缀标准流程
    if (key.startsWith("on")) continue;

    if (key === "style") {
      if (typeof val === "string") {
        html += ` style="${escapeAttr(val)}"`;
      } else if (typeof val === "object") {
        const cssText = Object.entries(val)
          .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}: ${v}`)
          .join("; ");
        html += ` style="${escapeAttr(cssText)}"`;
      }
      continue;
    }

    if (key.startsWith("aria-") || key.startsWith("data-")) {
      html += ` ${key}="${escapeAttr(String(val))}"`;
      continue;
    }

    if (FORCE_ATTRIBUTE.has(key)) {
      if (val === true) {
        html += ` ${key}`;
      } else {
        html += ` ${key}="${escapeAttr(String(val))}"`;
      }
      continue;
    }

    // 其余 → 跳过
  }

  return html;
}
```

## 8. 分场景示例

### 8.1 无前缀

| 写法                         |           客户端（setProp）           |       SSR（serializeAttrs）       |
| ---------------------------- | :-----------------------------------: | :-------------------------------: |
| `<div class="box">`          |    `setAttribute('class', 'box')`     |           `class="box"`           |
| `<div className="box">`      |        `el.className = 'box'`         | 不输出（不在 FORCE_ATTRIBUTE 中） |
| `<input value={val}>`        |           `el.value = val`            |              不输出               |
| `<input placeholder="name">` | `setAttribute('placeholder', 'name')` |       `placeholder="name"`        |
| `<input disabled>`           |    `setAttribute('disabled', '')`     |            `disabled`             |
| `<input disabled={false}>`   |     `removeAttribute('disabled')`     |              不输出               |
| `<img src={url} alt="desc">` |      `setAttribute('src', url)`       |       `src="..." alt="..."`       |
| `<a href={url}>`             |      `setAttribute('href', url)`      |           `href="..."`            |
| `<div aria-label="X">`       |   `setAttribute('aria-label', 'X')`   |         `aria-label="X"`          |
| `<div data-id="1">`          |    `setAttribute('data-id', '1')`     |           `data-id="1"`           |
| `<svg viewBox="0 0 24 24">`  |   `setAttribute('viewBox', '...')`    |          `viewBox="..."`          |
| `<my-el config={obj}>`       |           `el.config = obj`           |              不输出               |
| `<div innerHTML={html}>`     |         `el.innerHTML = html`         |              不输出               |
| `<div onClick={fn}>`         |    `addEventListener('click', fn)`    |              不输出               |

### 8.2 `attr:` 前缀

| 写法                        |           客户端（setProp）           |               SSR（serializeAttrs）                |
| --------------------------- | :-----------------------------------: | :------------------------------------------------: |
| `<div attr:class="box">`    |    `setAttribute('class', 'box')`     |                   `class="box"`                    |
| `<input attr:value="init">` |    `setAttribute('value', 'init')`    |                   `value="init"`                   |
| `<my-el attr:data={obj}>`   |  `setAttribute('data', String(obj))`  | `data="[object Object]"`（注意：对象会被字符串化） |
| `<div attr:onClick={fn}>`   | `setAttribute('onclick', String(fn))` |          `onclick="..."`（函数字符串化）           |

### 8.3 `prop:` 前缀

| 写法                                  |                        客户端（setProp）                        | SSR（serializeAttrs） |
| ------------------------------------- | :-------------------------------------------------------------: | :-------------------: |
| `<div prop:className="box">`          |                     `el.className = 'box'`                      |        不输出         |
| `<my-button prop:disabled={val}>`     |            `el.disabled = val`（触发自定义 setter）             |        不输出         |
| `<input prop:value={val}>`            |              `el.value = val`（默认已走 property）              |        不输出         |
| `<div prop:style={{ color: 'red' }}>` | `el.style = { color: 'red' }`（注意：覆盖 el.style 的完整对象） |        不输出         |

> `prop:style` 的行为是直接将对象赋给 `el.style`，会替换完整的 CSS 声明。与无前缀的 `style={{}}`（走 `Object.assign`）行为不同。

## 9. 边界情况与决策说明

| 场景                              | 处理方式                                                                     | 理由                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `value` 不在 FORCE_ATTRIBUTE      | 走 property                                                                  | 受控组件语义                                                          |
| `checked` 不在 FORCE_ATTRIBUTE    | 走 property                                                                  | 受控组件语义                                                          |
| `<div hidden>`（无值）            | JSX 编译为 `hidden: true`，走 FORCE_ATTRIBUTE → `setAttribute('hidden', '')` | 与 HTML 语义一致                                                      |
| `<div hidden={false}>`            | 走 FORCE_ATTRIBUTE → `removeAttribute('hidden')`                             | 取消隐藏                                                              |
| SVG 中 `className`                | 走 SVG 分支 → `setAttribute('className', value)`                             | 开发者责任，SVG 的 class 应使用 `class`                               |
| SVG 上 `prop:viewBox="0 0 24 24"` | 走 `prop:` 前缀分支 → `el.viewBox = "0 0 24 24"`                             | 开发者责任，SVG 的 `viewBox` 是 `SVGAnimatedRect`，字符串赋值可能失败 |
| 自定义元素 `<x-foo bar={obj}>`    | 无前缀 ∉ FORCE_ATTRIBUTE → `el.bar = obj`                                    | 传递对象                                                              |
| `attr:bar={obj}`                  | `setAttribute('bar', '[object Object]')`                                     | 显式标记，开发者自行负责序列化                                        |
| `el.innerHTML = null`             | 变为 `"null"` 字符串                                                         | 开发者责任，传值前自行保证类型正确                                    |
| 组件上使用前缀                    | 前缀作为普通 prop 透传，不处理                                               | 组件只透传，前缀在 DOM 元素的 setProp 中生效                          |

## 10. 与常见框架的差异

| 维度            | React                                   | kiaao                                           |
| --------------- | --------------------------------------- | ----------------------------------------------- |
| 默认行为        | 驼峰 property（`className`、`htmlFor`） | 大写 property（`el[key] = value`）              |
| 显式属性覆盖    | 无内置机制                              | `attr:` / `prop:` 前缀                          |
| class 设置      | 推荐 `className`                        | 同时支持 `class`（attr）和 `className`（prop）  |
| value 绑定      | 受控                                    | 受控（同 React）                                |
| aria-_ / data-_ | 特殊处理                                | `setAttribute`（同 React）                      |
| SSR 属性输出    | 全部输出                                | 仅 FORCE_ATTRIBUTE + `attr:` + aria-/data- 输出 |
| 自定义属性      | 未知属性走 attribute？                  | 默认走 property                                 |

## 11. 对开发者的约定

- **`value` 和 `checked` 是受控的**：绑定了这些属性的表单元素在每次框架更新时都会覆盖当前值。非受控场景使用 `defaultValue` 或 `defaultChecked`。
- **`attr:` 前缀**：强制属性以 HTML attribute 形式存在。在 SSR 中输出，在客户端走 `setAttribute`。
- **`prop:` 前缀**：强制属性以 DOM property 形式存在。在 SSR 中忽略，在客户端走 `el[key] = value`。
- **SVG 元素默认走 `setAttribute`**，`attr:` 前缀与默认行为一致。`prop:` 前缀会尝试 property 赋值，开发者需自行承担只读 property 的后果。
- **组件上的前缀**：前缀作为普通 prop 名传递给组件，组件透传后在 DOM 元素上生效。
- **不做命名转换**：框架不转换驼峰/短横线，开发者写的 key 是什么就是什么。
- **无需记忆 FORCE_ATTRIBUTE 列表**：框架内部处理。开发者正常写属性即可，两种写法（`class` vs `className`）都工作。
- **自定义元素**：使用驼峰 property 名称传递复杂数据，例如 `<my-element customProp={obj}>`。如需触发 `attributeChangedCallback`，使用 `attr:kebab-prop`。

---

## 附录：FORCE_ATTRIBUTE 完整列表（JSON 格式，可直接用于代码）

```ts
const FORCE_ATTRIBUTE = new Set([
  // 全局
  "class",
  "id",
  "lang",
  "dir",
  "title",
  "hidden",
  "tabindex",
  "accesskey",
  "contenteditable",
  "draggable",
  "spellcheck",
  "autocapitalize",
  "translate",
  "slot",
  // 表单
  "name",
  "type",
  "placeholder",
  "required",
  "disabled",
  "readonly",
  "maxlength",
  "minlength",
  "size",
  "min",
  "max",
  "step",
  "pattern",
  "autocomplete",
  "autofocus",
  "multiple",
  "accept",
  "capture",
  "selected",
  // 链接
  "href",
  "target",
  "rel",
  "download",
  "hreflang",
  "ping",
  "referrerpolicy",
  // 媒体
  "src",
  "alt",
  "width",
  "height",
  "srcset",
  "sizes",
  "loading",
  "decoding",
  "crossorigin",
  "poster",
  "preload",
  "autoplay",
  "controls",
  "loop",
  "muted",
  "playsinline",
  // iframe
  "srcdoc",
  "sandbox",
  "allow",
  "allowfullscreen",
  "frameborder",
  // 表格
  "colspan",
  "rowspan",
  "headers",
  "scope",
  // script / style / meta
  "async",
  "defer",
  "integrity",
  "media",
  "charset",
  "httpEquiv",
  // 其他
  "for",
  "usemap",
  "ismap",
  "cite",
  "datetime",
  "form",
  "formaction",
  "formenctype",
  "formmethod",
  "formnovalidate",
  "formtarget",
  "novalidate",
  "nonce",
]);
```

**文档结束**
