# Motion / 动画

kiaao provides an official motion extension for declarative enter and exit animations. It is built entirely on the custom directive system and keeps the signal model synchronous and predictable.

kiaao 提供官方的 motion 扩展，用于声明式的进入和退出动画。它完全基于自定义指令系统构建，保持信号模型同步和可预测。

The core idea is **business/animation signal separation**. You operate a business signal directly — the UI reacts immediately. A derived animation signal lags behind to allow exit animations to complete before DOM removal.

核心思想是**业务信号与动画信号分离**。你直接操作业务信号——UI 立即响应。一个派生的动画信号延迟更新，让退出动画在 DOM 移除之前播放完成。

```bash
# motion is included in the kiaao package
# motion 包含在 kiaao 包中
npm install kiaao
```

Import from `kiaao/motion`:

从 `kiaao/motion` 导入：

```ts
import { createMotion, createGroupMotion } from "kiaao/motion";
```

---

## `createMotion` — when mode / when 模式

Use `createMotion` for single elements controlled by `when`. It returns a `[visible, Motion]` tuple — `visible` is the animation signal to bind to `when`, and `Motion` is the directive that wraps the animated element.

使用 `createMotion` 处理由 `when` 控制的单个元素。它返回 `[visible, Motion]` 元组——`visible` 是绑定到 `when` 的动画信号，`Motion` 是包裹动画元素的指令。

### API

```ts
function createMotion(signal, context?): [visible, Motion];
```

- **`signal`**

  A boolean getter. You toggle this to show/hide content. Business UI reads this directly.

  布尔值 getter。你通过它控制显隐。业务 UI 直接读取此信号。

- **`context`** (optional / 可选)

  Component context. When provided, signal cleanup is bound to the component lifecycle.

  组件 context。传入时信号清理绑定到组件生命周期。

**Returns / 返回**

- **`visible`**

  Animation signal. Bind this to `when`. It stays `true` until exit animations finish.

  动画信号。绑定到 `when`。退出动画完成后才变为 `false`。

- **`Motion`**

  Directive. Wrap the element you want to animate.

  指令。包裹需要动画的元素。

### Motion Props

- **`from`**

  Exit target / enter start value. If omitted, no exit animation.

  退出动画目标值 / 进入动画起始值。若不传，无退出动画。

- **`to`**

  Enter target value. If omitted, no enter animation.

  进入动画目标值。若不传，无进入动画。

- All other props (including `duration`, `easing`, `delay`, etc.) are forwarded directly to motion's `animate()` options.

  其余所有属性（包括 `duration`、`easing`、`delay` 等）直接透传给 motion 的 `animate()` 选项。

### Example / 示例

```jsx
import { use } from "kiaao";
import { createMotion } from "kiaao/motion";

function Comp(_, context) {
  const [state, setState] = use(true);
  const [visible, Motion] = createMotion(state, context);
  const [text] = use(state, () => (state() ? "开" : "关"));

  return (
    <div>
      <button onClick={() => setState(false)}>关闭</button>
      <span>当前状态：{text}</span> {/* 立刻变化 */}
      <div when={visible}>
        {/* 绑定动画信号 */}
        <Motion
          from={{ opacity: 0, transform: "translateY(20px)" }}
          to={{ opacity: 1, transform: "translateY(0)" }}
          duration={0.5}
        >
          <div class="content">动画内容</div>
        </Motion>
      </div>
    </div>
  );
}
```

**What happens**

`state(false)` → business UI updates immediately. Motion detects the exit and plays the exit animation. `visible` stays `true` until the animation finishes, then becomes `false` → `when` removes the DOM.

**流程**

`state(false)` → 业务 UI 立刻更新。Motion 检测到退出并播放退出动画。`visible` 在动画完成前保持 `true`，完成后变为 `false` → `when` 移除 DOM。

---

## `createGroupMotion` — each mode / each 模式

Use `createGroupMotion` for lists rendered by `each`. It supports precise diffing with a `keyFn` to animate only removed items, or full-exit mode without a key.

使用 `createGroupMotion` 处理由 `each` 渲染的列表。支持通过 `keyFn` 进行精确 diff，只对被移除的条目播放动画；也支持无 key 的全量退出模式。

### API

```ts
function createGroupMotion(signal, keyFn?, context?): [visibleItems, GroupMotion];
```

- **`signal`**

  An array getter. You update this directly to add/remove items.

  数组 getter。你直接更新它来增删条目。

- **`keyFn`** (optional / 可选)

  Identity function, same as `each`'s `key`. Enables precise diff. If omitted, all old elements play exit animation.

  身份标识函数，与 `each` 的 `key` 一致。启用精确 diff。若不传，所有旧元素播放退出动画。

- **`context`** (optional / 可选)

  Component context.

  组件 context。

**Returns / 返回**

- **`visibleItems`**

  Animation signal. Bind this to `each`.

  动画信号。绑定到 `each`。

- **`GroupMotion`**

  Directive. Wrap each list item element. Requires a `key` prop matching `keyFn`.

  指令。包裹每个列表项元素。需要传入与 `keyFn` 匹配的 `key` prop。

### GroupMotion Props

Same as `Motion` props (`from`, `to`, `duration`, ...), plus:

与 `Motion` props 相同（`from`、`to`、`duration` 等），另外：

- **`key`**

  Required when `keyFn` is provided. The computed key for this item.

  当提供了 `keyFn` 时必须传入。当前条目的计算 key。

### Example / 示例

```jsx
import { use } from "kiaao";
import { createGroupMotion } from "kiaao/motion";

function Comp(_, context) {
  const [items, setItems] = use([
    { id: 1, text: "任务一" },
    { id: 2, text: "任务二" },
    { id: 3, text: "任务三" },
  ]);
  const keyFn = (v) => v.id;
  const [visibleItems, GroupMotion] = createGroupMotion(items, keyFn, context);

  const removeItem = (id) => {
    setItems(items().filter((i) => i.id !== id));
  };

  return (
    <ul each={visibleItems} key={keyFn}>
      {(item) => (
        <GroupMotion
          key={keyFn(item())}
          from={{ opacity: 0, transform: "translateX(-20px)" }}
          to={{ opacity: 1, transform: "translateX(0)" }}
        >
          <li>
            {item().text}
            <button onClick={() => removeItem(item().id)}>删除</button>
          </li>
        </GroupMotion>
      )}
    </ul>
  );
}
```

**What happens**

`removeItem(id)` updates `items` immediately. `createGroupMotion` diffs the old and new arrays, identifies removed keys, plays exit animations only for those elements, then updates `visibleItems`. New items get enter animations automatically via `onMount`.

**流程**

`removeItem(id)` 立刻更新 `items`。`createGroupMotion` diff 新旧数组，识别被移除的 key，只对这些元素播放退出动画，然后更新 `visibleItems`。新增元素通过 `onMount` 自动获得进入动画。

---

## Notes / 注意事项

- **`from` is required for exit animations.** If you only pass `to`, elements will enter with animation but will be removed instantly without exit animation.

  **退出动画必须传 `from`。** 如果只传 `to`，元素会有进入动画，但移除时不会有退出动画。

- **Animation signals (`visible` / `visibleItems`) must be bound to `when` / `each`.** Business signals are for your own UI logic.

  **动画信号（`visible` / `visibleItems`）必须绑定到 `when` / `each`。** 业务信号用于你自己的 UI 逻辑。

- **Mid-flight cancellation is protected by tick-based generation tracking.** If you toggle the signal rapidly, only the latest state takes effect.

  **中途反转由代际标记保护。** 快速切换信号时，只有最后一次的状态会生效。

- **Enter and exit animations are both driven by `motion/mini`.** No WAAPI is involved.

  **进入和退出动画都由 `motion/mini` 驱动。**

---

Now that you understand motion, learn about control flow or component lifecycle. / 现在你了解了动画，继续了解控制流或组件生命周期。

- [Control Flow / 控制流](./control-flow.md)
- [Lifecycle / 生命周期](./lifecycle.md)
