# Attributes / 属性处理

In kiaao, attributes on JSX elements are handled by a unified `setProp` pipeline. This document explains the rules you need to know. For the complete specification including the full FORCE_ATTRIBUTE list, see the Attribute Handling Specification.

在 kiaao 中，JSX 元素上的属性由统一的 `setProp` 管道处理。本文档解释你需要知道的规则。完整的规范（包括完整的 FORCE_ATTRIBUTE 列表）参见属性处理规范文档。

---

## Default Behavior / 默认行为

By default, most attributes are set as DOM properties (`el[key] = value`). This is the fastest path and works for the majority of cases. However, some attributes have special rules.

默认情况下，大多数属性通过 DOM property 赋值（`el[key] = value`）。这是最快的路径，适用于大多数情况。但某些属性有特殊规则。

---

## FORCE_ATTRIBUTE / 强制属性

A predefined set of standard HTML attributes are always set via `setAttribute` rather than property assignment. This includes `class`, `id`, `disabled`, `placeholder`, `src`, `href`, `alt`, `title`, `hidden`, `readonly`, `required`, `maxlength`, `type`, `name`, `min`, `max`, `step`, `pattern`, `autocomplete`, `autofocus`, `multiple`, `accept`, `target`, `rel`, `download`, `width`, `height`, `colspan`, `rowspan`, `for`, and others.

一组预定义的标准 HTML 属性始终通过 `setAttribute` 设置，而非 property 赋值。这包括 `class`、`id`、`disabled`、`placeholder`、`src`、`href`、`alt`、`title`、`hidden`、`readonly`、`required`、`maxlength`、`type`、`name`、`min`、`max`、`step`、`pattern`、`autocomplete`、`autofocus`、`multiple`、`accept`、`target`、`rel`、`download`、`width`、`height`、`colspan`、`rowspan`、`for` 等。

The rule is simple: if you can write it in plain HTML, it is in FORCE_ATTRIBUTE and will be set with `setAttribute`. If you cannot write it in plain HTML (like `innerHTML`, `textContent`, `value`, `checked`, or custom properties), it is set as a DOM property.

规则很简单：如果可以在纯 HTML 中手写它，它就在 FORCE_ATTRIBUTE 中，会通过 `setAttribute` 设置。如果不能（如 `innerHTML`、`textContent`、`value`、`checked` 或自定义属性），则通过 DOM property 赋值。

**Important exceptions / 重要例外**：`value` and `checked` are set as DOM properties (`el.value = val`, `el.checked = bool`), not as attributes. This is required for controlled component semantics — after user interaction, only the property reflects the current value.

**重要例外**：`value` 和 `checked` 通过 DOM property 赋值（`el.value = val`、`el.checked = bool`），而非 setAttribute。这是受控组件语义所必需的——用户交互后，只有 property 反映当前值。

```jsx
// These are set via setAttribute / 以下通过 setAttribute 设置
<input placeholder="Enter name" disabled={isDisabled} />
<img src={url} alt="description" />
<a href={link} target="_blank" />

// These are set via property assignment / 以下通过 property 赋值
<input value={name} onInput={e => setName(e.target.value)} />
<input checked={isChecked} type="checkbox" />
<div innerHTML={htmlContent} />
```

---

## Reactive Attributes / 响应式属性

When an attribute value is a signal, kiaao automatically creates a derivation that updates the attribute whenever the signal changes. No manual binding is needed.

当属性值是信号时，kiaao 会自动创建一个派生，在信号变化时更新该属性。不需要手动绑定。

```jsx
const [isActive, setActive] = use(false);

return <div class={isActive} />;
// class is automatically updated when isActive changes
// isActive 变化时 class 自动更新
```

---

## Boolean Attributes / 布尔属性

For attributes in FORCE_ATTRIBUTE, when the value is `true`, an empty string attribute is set (e.g., `disabled=""`). When the value is `false`, the attribute is removed. This matches native HTML boolean attribute behavior.

对于 FORCE_ATTRIBUTE 中的属性，当值为 `true` 时，设置空字符串属性（如 `disabled=""`）。当值为 `false` 时，移除该属性。这与原生 HTML 布尔属性行为一致。

```jsx
<button disabled={true}>  // <button disabled="">
<button disabled={false}> // <button>
```

---

## `class` and `className` / class 与 className

Both `class` and `className` are supported. `class` is in FORCE_ATTRIBUTE and goes through `setAttribute`. `className` is not, and goes through property assignment (`el.className = value`). Both produce the same result on HTML elements. Use whichever style you prefer.

`class` 和 `className` 均受支持。`class` 在 FORCE_ATTRIBUTE 中，通过 `setAttribute` 设置。`className` 不在，通过 property 赋值（`el.className = value`）。两者在 HTML 元素上产生相同的结果。选择你偏好的风格即可。

```jsx
<div class="box" />
<div className="box" />
// Both work / 两者都有效
```

Only string values are accepted for `class`/`className`. Object and array forms are not supported. Use a derivation to compute the class string.

`class`/`className` 仅接受字符串值。不支持对象和数组形式。使用派生来计算 class 字符串。

```jsx
const [isActive, setActive] = use(false);
const [className] = use(isActive, () => (isActive() ? "btn active" : "btn"));

return <button class={className}>Click</button>;
```

---

## `style` / 样式

`style` accepts a string or an object.

- **String** — Set directly as `el.style.cssText`.
- **Object** — The inline style is first cleared, then all properties from the object are assigned with `Object.assign(el.style, value)`. This means each object update is a full replacement — properties not in the new object are removed.

`style` 接受字符串或对象。

- **字符串** — 直接设置为 `el.style.cssText`。
- **对象** — 首先清空内联样式，然后用 `Object.assign(el.style, value)` 赋值对象中的所有属性。这意味着每次对象更新都是完全替换——新对象中不存在的属性会被移除。

```jsx
// String / 字符串
<div style="color: red; font-size: 16px" />

// Object / 对象
const [styles] = use({ color: 'red', fontSize: '16px' })
<div style={styles} />

// Derivation with mixed static and dynamic values
// 混合静态和动态值的派生
const [height, setHeight] = use(100)
const [boxStyle] = use(height, () => ({
  color: 'red',
  height: height() + 'px'
}))
<div style={boxStyle} />
```

---

## `attr:` / `prop:`

Two explicit prefixes give you full control when the default behavior doesn't match your needs.

- **`attr:xxx`** — Force the value to be set as an HTML attribute via `setAttribute`. This is useful for setting initial form values in SSR, triggering `attributeChangedCallback` in Web Components, or preserving attributes that would otherwise be set as properties.
- **`prop:xxx`** — Force the value to be set as a DOM property. This overrides the FORCE_ATTRIBUTE list and is useful for Web Components with custom property setters.

两个显式前缀让你在默认行为不满足需求时拥有完全的控制权。

- **`attr:xxx`** — 强制通过 `setAttribute` 将值设置为 HTML 属性。适用于在 SSR 中设置表单初始值、触发 Web Components 的 `attributeChangedCallback`，或保留原本会通过 property 设置的属性。
- **`prop:xxx`** — 强制通过 DOM property 设置值。这会覆盖 FORCE_ATTRIBUTE 列表，适用于具有自定义 property setter 的 Web Components。

```jsx
// Force attribute for SSR initial value
// 强制使用 attribute 以在 SSR 中输出初始值
<input attr:value="initial" />

// Force property to trigger custom setter in a Web Component
// 强制使用 property 以触发 Web Component 的自定义 setter
<my-button prop:disabled={isDisabled()} />
```

---

## SVG Elements / SVG 元素

On SVG elements, all attributes default to `setAttribute`. SVG DOM properties are often read-only `SVGAnimated*` objects, so property assignment is almost always wrong. The `prop:` prefix can override this, but use it with caution.

在 SVG 元素上，所有属性默认走 `setAttribute`。SVG 的 DOM property 通常是只读的 `SVGAnimated*` 对象，因此 property 赋值几乎总是错误的。`prop:` 前缀可以覆盖此行为，但请谨慎使用。

```jsx
<svg viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" />
</svg>
```

`style` on SVG elements works the same as on HTML elements — string or object, handled through `el.style`.

SVG 元素上的 `style` 与 HTML 元素一致——字符串或对象，通过 `el.style` 处理。

---

## Event Handlers / 事件处理器

Attributes matching the pattern `onXxx` (where `Xxx` starts with an uppercase letter) are treated as event listeners. They are bound via `addEventListener` and are not set as DOM attributes or properties. Event bindings are not reactive — the value is read once at initialization and used as the callback.

匹配 `onXxx` 模式（`Xxx` 以大写字母开头）的属性被视为事件监听器。它们通过 `addEventListener` 绑定，不会设置为 DOM 属性或 property。事件绑定不是响应式的——值在初始化时读取一次并用作回调。

```jsx
<button onClick={() => setCount(c => c + 1)}>+1</button>
<input onInput={e => setName(e.target.value)} />
```

---

## `aria-*` and `data-*` / aria-_ 和 data-_

Attributes starting with `aria-` or `data-` are always set via `setAttribute`. They have no corresponding DOM properties.

以 `aria-` 或 `data-` 开头的属性始终通过 `setAttribute` 设置。它们没有对应的 DOM property。

```jsx
<div aria-label="Close" data-id="modal-1" />
```

---

## SSR Attribute Serialization / SSR 属性序列化

During SSR, only attributes that have meaning in static HTML are serialized:

- `attr:` prefix → output as HTML attribute
- `prop:` prefix → ignored
- Event handlers → ignored
- `style` → serialized as HTML style attribute
- `aria-*` / `data-*` → output as-is
- FORCE_ATTRIBUTE members → output as HTML attributes
- Everything else → ignored

SSR 期间，只有对静态 HTML 有意义的属性会被序列化：

- `attr:` 前缀 → 作为 HTML 属性输出
- `prop:` 前缀 → 忽略
- 事件处理器 → 忽略
- `style` → 序列化为 HTML style 属性
- `aria-*` / `data-*` → 原样输出
- FORCE_ATTRIBUTE 成员 → 作为 HTML 属性输出
- 其他 → 忽略
