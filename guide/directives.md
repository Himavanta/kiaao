# Directives / 自定义指令

Custom directives allow reusable DOM behavior to be attached directly to native elements. A directive has its own persistent Owner and element-level lifecycle — `onMount`, `onUnmount`, and `use` — independent of any component. Directives do not create extra wrapper nodes in the DOM.

自定义指令允许将可复用的 DOM 行为直接附加到原生元素上。指令拥有自己的持久 Owner 和元素级生命周期——`onMount`、`onUnmount` 和 `use`——独立于任何组件。指令不会在 DOM 中创建额外的包裹节点。

## Creating a Directive / 创建指令

Use `direct` to create a directive. It marks a function so `h()` can distinguish it from a component.

使用 `direct` 创建指令。它标记一个函数，让 `h()` 能够区分指令和组件。

```ts
import { direct } from "kiaao";

const MyDirective = direct((el, props, ctx) => {
  // el — the native DOM element the directive is attached to
  // el — 指令绑定的原生 DOM 元素
  // props — attributes written on the directive in JSX (including children)
  // props — JSX 中写在指令上的属性（包括 children）
  // ctx — element-level lifecycle: { onMount, onUnmount, use }
  // ctx — 元素级生命周期：{ onMount, onUnmount, use }
});
```

The directive function is called once per child element when the element is created. It does not re-run when props change. For reactive updates, subscribe to signals inside the directive using `ctx.use`.

指令函数在每个子元素创建时调用一次。props 变化时不会重新执行。如需响应式更新，在指令内部使用 `ctx.use` 订阅信号。

## TypeScript Support / TypeScript 支持

Directives created with `direct` use an intersection type so they can be used as JSX tags without type errors.

通过 `direct` 创建的指令使用交叉类型，可以直接用作 JSX 标签而不会产生类型错误。

```ts
type DirectiveFunction = (
  el: Element,
  props: Record<string, any>,
  context: DirectiveContext,
) => void;

// direct() returns a type that satisfies both the directive signature and JSX usage
// direct() 返回的类型同时满足指令签名和 JSX 使用
```

## Element-Level Lifecycle / 元素级生命周期

### `ctx.onMount(fn)`

Runs after the element is inserted into the DOM. The element is fully available — you can read layout, play JS animations, or initialize third-party libraries.

在元素插入 DOM 后执行。元素已完全可用——可以读取布局、播放 JS 动画或初始化第三方库。

### `ctx.onUnmount(fn)`

Runs before the element is removed from the DOM. Use it to clean up event listeners, disconnect observers, or clear timers. This callback is synchronous — returning a Promise will not delay removal.

在元素从 DOM 中移除前执行。用于清理事件监听、断开观察器或清除定时器。此回调是同步的——返回 Promise 不会延迟移除。

### `ctx.use(...)`

Creates signals bound to the directive's Owner. Works exactly like component-level `use` — same syntax, same three forms (definition, signal referencing, derivation). Signals created this way are automatically cleaned up when the directive's Owner is disposed.

创建绑定到指令 Owner 的信号。与组件级 `use` 完全一致——相同的语法、相同的三种形式（定义、信号引用、派生）。这样创建的信号在指令 Owner 销毁时自动清理。

```ts
const ObserveSize = direct((el, props, ctx) => {
  const rect = ctx.use({ width: 0, height: 0 });

  const observer = new ResizeObserver(([entry]) => {
    rect(entry.contentRect);
  });
  observer.observe(el);

  ctx.onUnmount(() => observer.disconnect());
});
```

## Multiple Children / 多子元素

A directive can wrap multiple elements. The directive function is called once for each **Element** child. Non-Element children (text nodes, comments, signals, booleans) are skipped with a dev-mode warning.

一个指令可以包裹多个元素。指令函数会为每个 **Element** 子元素调用一次。非 Element 子元素（文本节点、注释、信号、布尔值）会被跳过，并在开发模式下发出警告。

```jsx
<FadeIn>
  <div class="card">A</div>
  <div class="card">B</div>
  <div class="card">C</div>
</FadeIn>
```

`FadeIn` is called three times — once for each `<div>`. Each element gets its own `onMount` callback registered.

`FadeIn` 被调用三次——每个 `<div>` 一次。每个元素独立注册自己的 `onMount` 回调。

## Nesting Directives / 嵌套指令

Multiple directives can nest on the same element. They are processed from inside to outside — the innermost directive registers its hooks first.

多个指令可以嵌套在同一个元素上。从内到外处理——最内层的指令最先注册钩子。

```jsx
<Motion from={{ opacity: 0 }} to={{ opacity: 1 }}>
  <Validate rules={...}>
    <input />
  </Validate>
</Motion>
```

`onMount` callbacks fire in registration order: `Validate` first, then `Motion`. `onUnmount` callbacks fire in parallel — no order is guaranteed between directives.

`onMount` 回调按注册顺序触发：先 `Validate`，后 `Motion`。`onUnmount` 回调并行触发——指令之间不保证顺序。

## Directives vs Components / 指令与组件的区别

|                         | Directive / 指令                                  | Component / 组件                           |
| ----------------------- | ------------------------------------------------- | ------------------------------------------ |
| Created with / 创建方式 | `direct(fn)`                                      | Plain function / 普通函数                  |
| Receives / 接收         | `(el, props, ctx)`                                | `(props, context)`                         |
| Lifecycle / 生命周期    | Element-level / 元素级                            | Component instance-level / 组件实例级      |
| Creates DOM / 创建 DOM  | No — wraps existing elements / 否 —— 包裹已有元素 | Yes — returns DOM / 是 —— 返回 DOM         |
| Can be async / 可异步   | No / 否                                           | Yes — returns Promise / 是 —— 返回 Promise |
| SSR behavior / SSR 行为 | Skipped entirely / 完全跳过                       | Renders to HTML / 渲染为 HTML              |

Directives only work on native HTML elements. Using a directive on a component has no effect.

指令仅对原生 HTML 元素生效。在组件上使用指令无效。

## Rules / 规则

**Directives cannot modify the DOM structure.** The return value of a directive function is ignored. The framework always uses the original children. To change the DOM, operate on `el` directly — but know that `el.replaceWith()` and similar operations are advanced usage and you are responsible for the consequences.

**指令不能修改 DOM 结构。** 指令函数的返回值会被忽略。框架始终使用原始 children。要改变 DOM，直接操作 `el`——但须知 `el.replaceWith()` 等操作属于高级用法，后果自负。

**Directives run once.** A directive function is called when the element is created. It does not re-run when props change. Use `ctx.use` to react to signal changes.

**指令只执行一次。** 指令函数在元素创建时调用。props 变化时不会重新执行。使用 `ctx.use` 响应信号变化。

**Directives are skipped in SSR.** Server-side rendering has no DOM to operate on. `hSSR` ignores directives and renders the children directly.

**SSR 中指令被跳过。** 服务端渲染没有 DOM 可供操作。SSR 模式忽略指令，直接渲染 children。

## Examples / 示例

### Enter Animation / 进入动画

```ts
import { direct } from "kiaao";
import { animate } from "motion";

const FadeIn = direct((el, props, ctx) => {
  const { duration = 0.3 } = props;
  Object.assign(el.style, { opacity: 0 });
  ctx.onMount(() => {
    animate(el, { opacity: 1 }, { duration });
  });
});
```

```jsx
function Comp() {
  return (
    <FadeIn duration={0.5}>
      <div class="content">I will fade in</div>
    </FadeIn>
  );
}
```

### Form Validation / 表单验证

```ts
const Validate = direct((el, props, ctx) => {
  const check = () => {
    const valid = el.checkValidity();
    props.onValidate?.(valid);
  };
  el.addEventListener("input", check);
  ctx.onUnmount(() => el.removeEventListener("input", check));
});
```

```jsx
function Comp() {
  return (
    <Validate onValidate={(valid) => console.log(valid)}>
      <input required minLength={3} />
    </Validate>
  );
}
```

### ResizeObserver / 尺寸观察

```ts
const ObserveSize = direct((el, props, ctx) => {
  const observer = new ResizeObserver(([entry]) => {
    props.onResize?.(entry.contentRect);
  });
  observer.observe(el);
  ctx.onUnmount(() => observer.disconnect());
});
```

### Multiple Directives Combined / 组合多个指令

```jsx
function Comp() {
  return (
    <FadeIn duration={0.5}>
      <ObserveSize onResize={handleResize}>
        <Validate onValidate={handleValidate}>
          <input required />
        </Validate>
      </ObserveSize>
    </FadeIn>
  );
}
```

All three directives operate on the same `<input>` element, each managing its own independent lifecycle.

三个指令作用于同一个 `<input>` 元素，各自管理独立生命周期。

Now that you understand directives, learn about control flow or component lifecycle. / 现在你了解了自定义指令，继续了解控制流或组件生命周期。

- [Control Flow / 控制流](./control-flow.md)
- [Lifecycle / 生命周期](./lifecycle.md)
