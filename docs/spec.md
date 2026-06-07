# kiaao 框架规范 v3.1

**宣传语**：更少的概念，更少的编译，更多的代码，更高的性能。

**设计哲学**：把响应式的本质（谁依赖谁）从框架的隐性机制，变成开发者的显性承诺。以最少的 API 和最少的概念，在纯运行时直接兑现细粒度更新。

---

## 零、架构原则

### 信号独立性原则

`define` 创建的信号是完全独立于组件树的值容器。信号不绑定在任何组件实例上，可以在模块顶层、闭包内或任何 JavaScript 作用域中创建和持有。信号的依赖绑定直接发生在信号和消费方（DOM 节点、`effect`、`derive`）之间，不经过组件层级。

### 依赖直接绑定原则

当消费方通过 `getter(selector)` 创建订阅时，该订阅直接向信号注册。更新时，信号直接触发消费方的更新闭包，中间组件不参与、不重跑、不转发。组件树只决定 DOM 的挂载结构，不决定数据的流动路径。

### 闭包即作用域原则

组件实例隔离和局部作用域通过 JavaScript 原生闭包实现。工厂函数每次调用创建独立的闭包和信号，返回的组件函数共享这些信号。框架不提供额外的 `Context`、`provide/inject` 等作用域管理 API。原生语言能力已足够。

### 原生控制流原则

控制流通过 `h()` 的属性指令实现，直接依附于原生 DOM 元素，而非独立的组件。这保证了动态内容始终处于宿主元素的 `childNodes` 中，`disposeNode` 沿 DOM 树的递归路径自然可抵达所有动态节点，从根本上杜绝生命周期泄漏。

---

## 一、核心 API（4 个）

### `define<T>(initialValue: T): [Getter<T>, Setter<T>]`

创建响应式状态。唯一的状态原语，不区分基本类型和对象。

```javascript
const [count, setCount] = define(0);
const [user, setUser] = define({ name: "tom", age: 18 });
```

#### Getter：`value(selector?)`

- **不传参**：返回当前全量快照（立即求值）。
- **传选择器函数**：返回一个**响应式派生函数**。该函数在被调用时才执行选择器并返回当前值，同时自动收集依赖。返回的函数携带 `IS_REACTIVE` 标记，供 `h()` 识别。

```javascript
value(); // 全量快照（立即求值）
value((v) => v.name); // 返回派生函数，延迟求值，精准订阅 name
value((v) => v.age >= 18); // 返回派生函数，就地计算逻辑
```

**重要行为**：`value(selector)` 不立即求值，而是返回一个函数。该函数在每次调用时执行选择器逻辑并返回结果，以此保持依赖追踪的活性。

**Getter 引用稳定性**：Getter 函数引用在组件生命周期内保持稳定。子组件在初始化时通过 props 或闭包接收父组件的 getter，并通过 `getter(selector)` 创建针对该信号的局部订阅。该订阅直接向信号注册，与中间组件无关。更新时中间组件不重跑。

**内部标记**：`define` 返回的原始 getter 函数本身也挂载 `IS_REACTIVE` 标记。当它作为子节点或属性值传入 `h()` 时，框架识别该标记并调用 `getter()` 获取当前值、建立依赖。这使得 `{count}` 和 `{count(v => v)}` 在 JSX 中行为一致——前者订阅整个值的变化，后者通过选择器订阅局部变化。此外，`derive` 返回的函数同样带有该标记。

#### Setter：`setValue(updater)`

- **传新值**：直接替换内部状态。
- **传函数**：接收旧值，返回新值。

```javascript
setCount(456);
setCount((prev) => prev + 1);
setUser((prev) => ({ ...prev, age: prev.age + 1 }));
```

**数据纯净度**：内部存储的是纯普通对象/基本类型。任何时候拿到的都是普通值，无 Proxy，无 getter/setter 劫持。更新采用不可变替换，但框架不依赖引用对比触发更新，而是依赖选择器函数的结果对比。

---

### `derive<T>(computeFn: () => T): () => T`

创建派生状态。带缓存和脏标记。**上游变化时立即重新计算**，若新结果与缓存不同则通知下游；若相同则拦截下游更新，避免无效传播。

```javascript
const double = derive(() => count() * 2);
const activeUsers = derive(() => users().filter((u) => u.active));
```

**内部机制**：

- `derive` 内部使用 `effect` 监听其所依赖的上游信号。
- 上游变化时，内部 `effect` 回调立即执行 `computeFn` 获取新值。
- 若新值与缓存不同（`!==`），更新缓存，并通知下游订阅者。
- 若新值与缓存相同，则不通知下游，实现拦截。
- `derive` 返回的函数同样带有 `IS_REACTIVE` 标记，能被 `h()` 识别。
- 派生函数上挂载 `STOP_KEY` 用于清理内部 `effect`。

**与 Getter 的区别**：Getter 的选择器返回的是无缓存的派生函数，每次调用都执行选择器；`derive` 返回的函数带缓存和拦截，用于重度计算或多处复用。

---

### `effect(fn: () => void): () => void`

执行副作用，自动收集 `fn` 内部触发的所有依赖。依赖变化且对账通过后重新执行。返回一个停止函数，调用后取消该 effect。

```javascript
const stop = effect(() => {
  localStorage.setItem(
    "token",
    user((v) => v.token),
  );
});
// 需要清理时
stop();
```

**执行上下文**：`currentEffect` 为栈结构，支持 `effect` 嵌套。每次 `effect` 执行时压栈，执行后弹出。

**与 `derive` 的区别**：`derive` 是纯计算（有返回值，有缓存），`effect` 是无返回值的副作用。

---

### `h(tag, props?, ...children): HTMLElement`

统一创建函数。根据第一个参数的类型，分两种模式：

#### DOM 模式（`tag` 为字符串）

创建真实 DOM 元素。与 Vite 默认 JSX 转换对接。对 `children` 进行**递归扁平化**（自动展开嵌套数组）。对每个子节点：

- 若为响应式函数（携带 `IS_REACTIVE` 标记）：创建文本占位，并通过 `effect` 绑定动态更新。该 effect 的停止函数**挂载到该文本节点**上，而非父组件实例，确保节点移除时精准清理。
- 若为 DOM 节点：直接附加。
- 若为其他值：转为字符串后创建静态文本节点。

**属性处理规则**：

- **事件属性**（`onXxx`，匹配 `/^on[A-Z]/`）：识别并转换为 `addEventListener` 绑定。事件名取 `on` 之后的部分**全小写**（如 `onClick` → `click`，`onMouseOver` → `mouseover`）。值应为函数，在组件初始化时绑定一次。**事件属性不参与响应式绑定**，即使值为响应式函数也直接读取其当前值作为回调注册一次。

- **响应式属性绑定**：除 `children`、事件属性及 `when`/`each` 保留属性外，若属性值为响应式函数（携带 `IS_REACTIVE` 标记），`h()` 会自动创建 `effect` 在值变化时通过 `setProp` 更新该属性。该 effect 挂载到元素节点的 `LOCAL_EFFECTS` 集合中，随元素移除而自动清理。

- **静态属性**：除上述情况外，若属性值为非响应式普通值，则在初始化时通过 `setProp` 设置一次。

- **`class` / `className`**：只接受字符串（静态或响应式函数返回的字符串）。直接赋值给 `el.className`。不支持对象或数组形式的自动转换。动态 class 应通过选择器函数返回字符串实现。

- **`style`**：接受字符串或对象（静态或响应式函数返回的字符串/对象）。
  - 字符串：直接设置 `el.style.cssText`。
  - 对象：**先清空内联样式**，再 `Object.assign(el.style, value)`。这意味着每次对象形式的更新都是**完全替换**，新对象中缺失的属性会被清除。若需要混合静态/动态值，应使用 `derive(() => ({ color: 'red', height: count() }))` 返回完整对象。

- **布尔属性**：值为 `true` 时设置空字符串 attribute，值为 `false` 时移除 attribute。

- **其他属性**：直接调用 `setAttribute(key, String(value))`。

- **`children`**：保留用于组件模式的 `props.children`，不设置为 DOM 属性。在 DOM 模式中作为子节点单独处理。

**控制流指令**：

- **`when`**：控制宿主元素**内部子节点**的挂载/卸载。宿主元素始终存在于 DOM 中。`when` 接受响应式函数或普通函数，当其返回值 truthy 时，子节点被插入宿主元素；falsy 时，子节点被递归清理（`disposeNode`）并从宿主元素移除。

  > 如果希望宿主元素不参与布局（仅作为逻辑容器），可对其设置 `style="display: contents"`。该样式使元素自身不生成盒子，子节点直接作为父级子元素参与布局，且不影响生命周期管理。

  `when` 仅在 `tag` 为字符串时生效，在自定义组件上无效。`when` 在 void 元素（`<br>`、`<input>` 等）上使用会抛出错误（开发模式 `throw`，生产模式静默忽略）。

  **`when` 的 children 形式**：
  - 若不存在 `each`，`children` 可以是静态内容（任意节点、字符串等），也可以是**惰性求值函数** `() => any`。若传入函数且不存在 `each`，该函数被视为惰性求值函数，仅在 `when` 条件为真时调用以获取内容。惰性求值允许延迟执行昂贵的初始化操作（如动态导入的组件）。
  - 若同时存在 `each`，则 `children` 必须为 `(item: T, index: number) => any`，惰性函数模式被忽略。

- **`each`**：控制宿主元素内部按数组生成子节点。`each` 接受返回数组的 getter/derive 函数。每次数组变化时，先递归清理旧子节点，再为每个数组元素调用渲染函数生成新子节点并插入。

  > 如果希望宿主元素不参与布局（仅作为逻辑容器），可对其设置 `style="display: contents"`。该样式使元素自身不生成盒子，子节点直接作为父级子元素参与布局，且不影响生命周期管理。

  `children` 必须为渲染函数 `(item: T, index: number) => any`。`each` 仅在 `tag` 为字符串时生效。在 void 元素上使用同样会抛出错误。

- **`when` + `each` 共存**：`when` 优先。当 `when` 为 falsy 时，不执行 `each`，不渲染任何子节点；当 `when` 为 truthy 时，再根据 `each` 生成子节点。语义等价于 `when` 包裹 `each`。

- **`key`**：配合 `each` 使用的函数 `(item: T, index: number) => any`，必须为每个列表项返回唯一且稳定的值。提供 `key` 后，列表更新时基于 key 进行增量更新：始终调用渲染函数生成新节点，旧节点在 key 相同时先销毁后重建（确保数据正确），不再使用的 key 对应的旧节点被自动清理。若未提供 `key`，则回退到全量重建模式。

**类型约束**：

```typescript
// 字符串标签允许 when/each
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: HTMLAttributes & {
    when?: (() => any) | ReactiveFunction;
    each?: () => any[];
    key?: (item: any, index: number) => any;
    [key: string]: any;
  },
  ...children: any[]
): HTMLElement;

// 函数组件禁止 when/each
function h(
  tag: (props: any) => any,
  props?: Record<string, any> & { when?: never; each?: never },
  ...children: any[]
): HTMLElement;
```

**SSR 中的控制流指令**：

- `when`：条件判断后决定是否序列化子节点，但**宿主元素始终保留**（即使 when 为 false，仍输出空标签，与客户端行为一致）。
- `each`：宿主元素序列化一次，子节点在内部按数组重复渲染（需要三段式序列化：开标签 → 重复子节点 → 闭标签）。

#### 组件模式（`tag` 为函数）

将 `tag` 视为组件函数：

1. 创建新的组件实例，压入 `currentComponent` 栈。
2. 执行 `tag(props)`，传入的 `props` 即为第二个参数（若无则传空对象）。
3. 函数返回真实 DOM 节点。
4. 组件实例出栈，恢复父组件上下文。
5. 返回该 DOM 节点。

这种设计使得 JSX 编译后的 `h(Component, props)` 与纯 `h()` 调用都能统一处理。

**使用示例**：

```jsx
// DOM 模式
<div class="card">
  <h1>{user(v => v.name)}</h1>
  <p>年龄：{user(v => v.age)}</p>
</div>

// 条件渲染（静态内容）
<section when={visible}>
  <span>可见内容</span>
</section>

// 条件渲染（惰性求值）
<section when={showDashboard}>
  {() => <Dashboard />}
</section>

// 列表渲染
<ul each={() => items()} key={item => item.id}>
  {(item) => <li>{item.text}</li>}
</ul>
```

---

## 二、内置组件（2 个）

### `<Teleport to={...}>`

将子组件的内容渲染到指定的 DOM 容器中，逻辑上仍属于当前组件树（生命周期、依赖追踪不受影响）。

- `to` 可以是 CSS 选择器字符串或直接的 DOM 元素。
- 子内容在挂载时被移动到目标容器，并在当前组件卸载时自动从目标容器中清除。

```jsx
<Teleport to="#modal-root">{() => <div class="modal">弹窗内容</div>}</Teleport>
```

```javascript
// 纯 h 调用
h(Teleport, { to: "#modal-root", children: () => h("div", { class: "modal" }, "弹窗内容") });
```

函数签名：

```ts
function Teleport(props: { to: string | HTMLElement; children: () => any }): Node;
```

---

### `lazy<T extends (...args: any[]) => any>(loader: () => Promise<{ default: T } | T>): T`

包装异步加载的组件，与构建工具的代码拆分（`import()`）配合使用。返回一个代理组件函数，初始渲染时显示占位注释节点，待模块加载完成后自动替换为真实组件。

- `loader`：返回 Promise 的函数，通常为 `() => import('./Component.tsx')` 形式。
- 代理组件内部使用 `when` 指令（而非独立的 Show 组件）管理加载状态，利用惰性求值延迟初始化。
- 加载失败时抛出错误，可被上层 `ErrorBoundary` 类组件捕获（未来提供或用户自行实现）。

```javascript
import { lazy } from "kiaao";
const AsyncComponent = lazy(() => import("./HeavyComponent.ts"));
h(AsyncComponent, { someProp: value });
```

类型签名：

```typescript
function lazy<T extends (...args: any[]) => any>(loader: () => Promise<{ default: T } | T>): T;
```

---

## 三、生命周期与挂载辅助

### `onMount(fn: () => void): void`

组件首次挂载到 DOM 后执行一次。必须在组件外壳同步执行期间调用，通过当前组件实例栈注册。

### `onUnmount(fn: () => void): void`

组件销毁前执行，用于清理定时器、取消订阅等。必须在组件外壳同步执行期间调用。

```javascript
function Timer() {
  const [time, setTime] = define(new Date());
  const timer = setInterval(() => setTime(new Date()), 1000);
  onUnmount(() => clearInterval(timer));
  return <div>{time((v) => v.toLocaleTimeString())}</div>;
}
```

**内部机制**：`currentComponent` 为组件实例栈。组件函数执行前（通过 `h` 的组件模式）压栈，执行后出栈。`onMount`/`onUnmount` 将回调注册到栈顶实例的队列中。

### 挂载辅助函数

#### `mount(root: HTMLElement, container: HTMLElement): void`

将 `root` 添加到 `container` 中，并递归触发所有待执行的 `onMount` 回调。

#### `unmount(root: HTMLElement): void`

从 DOM 中移除 `root`，并递归清理所有关联资源（包括节点级动态 effect、组件级 effect、生命周期回调）。

---

## 四、组件模型

### 组件函数只执行一次

```jsx
function UserProfile() {
  const [user, setUser] = define({ name: "tom", age: 18 });
  return (
    <div>
      <h1>{user((v) => v.name)}</h1>
      <p>年龄：{user((v) => v.age)}</p>
      <button onClick={() => setUser((prev) => ({ ...prev, age: prev.age + 1 }))}>长大一岁</button>
    </div>
  );
}
```

- 没有返回渲染函数，直接返回由 `h()` 创建的真实 DOM 节点。
- 状态变化时，组件函数不重新执行，只有被响应式函数绑定的具体 DOM 文本节点或属性原地更新。

### 多实例隔离（推荐模式）

使用工厂函数闭包：

```javascript
function createForm() {
  const [formData, setFormData] = define({ name: "", email: "" });
  function FormInput({ field, label }) {
    return (
      <div>
        <label>{label}</label>
        <input
          value={formData((v) => v[field])}
          onInput={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
        />
      </div>
    );
  }
  return function Form() {
    return (
      <form>
        <FormInput field="name" label="姓名" />
        <FormInput field="email" label="邮箱" />
      </form>
    );
  };
}
```

### 暴露方法与 DOM

kiaao 的组件是普通的 JavaScript 函数，返回真实 DOM，无需 `ref` 转发或 `defineExpose`。可通过回调或工厂函数暴露内部 DOM 或方法。

---

## 五、渲染机制

### 初始化流程

1. 组件函数执行，创建组件实例并压栈。
2. 遇到 `define()` 创建信号。
3. 遇到响应式函数作为子节点或属性时，`h()` 建立动态绑定。
4. 返回真实 DOM 树，组件实例出栈。
5. 用户调用 `mount(root, container)` 触发 `onMount`。

### 更新流程

1. `setter` 被调用，保存旧值，写入新值。
2. 遍历所有选择器依赖，对每个依赖用新旧值执行选择器，使用 `!==` 浅对比。
3. 结果不同则触发对应 `effect`（DOM 更新或副作用回调）。
4. DOM 更新是单点文本替换或属性更新，无虚拟 DOM Diff，无组件重跑。

### 无虚拟 DOM

不创建 VNode 树，不进行树形 Diff 算法。更新是直接的 `textNode.textContent = newValue` 或 `setProp(el, key, newValue)`。

---

## 六、依赖收集与调度

### 全局上下文

- `currentEffect`：栈结构，支持 `effect` 嵌套。
- `currentComponent`：栈结构，支持组件嵌套。

### 依赖图谱结构

每个信号内部维护 `deps: Map<selectorFn, Set<{ run }>>`，键为选择器函数引用，配合信号内部唯一 ID 避免冲突。

### Effect 所有权追踪

每个 `effect` 维护 `ownedDeps: Map<signal, Set<selectorFn>>`，用于停止时从信号注销。

### 对账机制

更新时，同一通知周期内每个 `effect` 只执行一次（去重）。

---

## 七、Effect 清理与组件卸载

### 节点级 Effect 清理

动态绑定产生的 `effect.stop` 存储在节点的 `LOCAL_EFFECTS` 集合中。`disposeNode` 递归清理节点时，执行所有本地 effect 停止函数。

### 组件级 Effect 清理

显式 `effect()` 或组件模式创建的 effect，其 `stop` 注册在组件实例的 `effectStops` 中，组件卸载时统一执行。

### 组件卸载流程

`unmount(root)` 或控制流指令切换分支时调用 `disposeNode`：

1. 递归处理子节点。
2. 执行当前节点 `LOCAL_EFFECTS` 中的全部 `stop`。
3. 执行 `DISPOSE_KEY` 回调（若有）：执行 `onUnmount` 回调、停止所有 effect、标记组件实例为已销毁。
4. 从 DOM 移除节点。

---

## 八、内部标记（Symbol 键）

| Symbol            | 挂载位置                                        | 用途                            |
| ----------------- | ----------------------------------------------- | ------------------------------- |
| `IS_REACTIVE`     | Getter / getter 选择器返回的函数 / DeriveSignal | 标识响应式函数                  |
| `LOCAL_EFFECTS`   | DOM 节点                                        | 存储该节点上的 effect stop 集合 |
| `DISPOSE_KEY`     | DOM 节点（组件根节点）                          | 存储组件销毁回调                |
| `INSTANCE_KEY`    | DOM 节点                                        | 存储组件实例引用                |
| `INITIALIZED_KEY` | 组件实例                                        | 标记已初始化                    |
| `DISPOSED_KEY`    | 组件实例                                        | 标记已销毁                      |
| `STOP_KEY`        | derive 返回的函数                               | 存储停止内部 effect 的函数      |

---

## 九、跨组件通信与 Store

### 模块级 Store（全局共享）

`define` 创建的信号是独立的值容器，可直接在模块顶层创建，任何组件通过 `import` 引入并按需订阅。

### Props 传递 getter

父组件可将 getter 函数引用通过 props 传给子组件。由于组件只执行一次，props 仅在初始化时传递，子组件订阅直接向信号注册，中间组件不参与更新。

### 无 Context / provide-inject

kiaao 不提供 `Context`、`provide`、`inject` 等跨层级通信 API。信号的独立性、闭包的原生能力以及模块机制已覆盖所有跨层级共享场景。

---

## 十、路由（独立包）

路由以独立包 `kiaao-router` 提供，完全基于核心原语实现。

- `createRouter(routes)` 返回 `{ RouterView, navigate, currentPath, currentParams }`。
- `RouterView` 组件根据当前路径匹配路由表并渲染对应组件。
- `navigate(path)` 进行编程式导航。
- `currentParams` 为派生信号，返回当前路由的动态参数对象。
- 支持 fallback 组件处理 404。

```javascript
import { createRouter } from "kiaao-router";
const { RouterView, navigate } = createRouter(
  [
    { path: "/", component: Home },
    { path: "/users/:id", component: UserProfile },
  ],
  { fallback: () => <div>404</div> },
);
```

---

## 十一、SSR 与 Astro 集成

### 渲染模式

内部状态 `RenderMode = "dom" | "ssr" | "hydrate"`，默认 `"dom"`。`setRenderMode(mode)` 切换模式。

### SSR 核心行为

- **`effect`**：SSR 下禁用，返回空 `stop` 函数。
- **`derive`**：退化为一次性计算，返回固定值但保留 `IS_REACTIVE` 标记。
- **`onMount` / `onUnmount`**：SSR 中不触发。
- **`h()`**：SSR 模式委托给 `hSSR`，`hSSR` 负责字符串拼接。属性值若为响应式函数则调用取值，事件属性跳过。控制流指令按规则生成对应 HTML：`when` 为 false 时保留宿主空元素标签；`each` 采用三段式序列化；`when` 与 `each` 共存时先判断 `when`。

### `renderToString`

```typescript
function renderToString(
  component: (props: any) => HTMLElement,
  props?: any,
  options?: { slots?: Record<string, string> },
): string;
```

### Astro 集成

通过 `kiaao/astro` 插件注册渲染器，支持纯静态组件和 `client:only` 组件。

```bash
npm install kiaao astro
```

```ts
// astro.config.ts
import kiaao from "kiaao/astro";
export default defineConfig({ integrations: [kiaao()] });
```

---

## 十二、TypeScript 核心类型

```typescript
interface Getter<T> {
  (): T;
  <R>(selector: (value: T) => R): () => R;
}

interface Setter<T> {
  (newValue: T): T;
  (updater: (prev: T) => T): T;
}

interface ReactiveFunction {
  (): any;
  [IS_REACTIVE]?: true;
}

function define<T>(initialValue: T): [Getter<T>, Setter<T>];
function derive<T>(computeFn: () => T): () => T;
function effect(fn: () => void): () => void;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | ((props: any) => any),
  props?: any,
  ...children: any[]
): HTMLElement;

function mount(root: HTMLElement, container: HTMLElement): void;
function unmount(root: HTMLElement): void;
function lazy<T extends (...args: any[]) => any>(loader: () => Promise<{ default: T } | T>): T;
function renderToString(
  component: (props: any) => HTMLElement,
  props?: any,
  options?: { slots?: Record<string, string> },
): string;
```

---

## 十三、API 总览

| API              | 分类     | 用途                                                             |
| ---------------- | -------- | ---------------------------------------------------------------- |
| `define`         | 核心     | 创建响应式状态                                                   |
| `derive`         | 核心     | 派生状态（缓存 + 拦截）                                          |
| `effect`         | 核心     | 副作用执行，自动追踪依赖，返回停止函数                           |
| `h`              | 渲染     | 创建真实 DOM 或调用组件，支持属性指令 `when`/`each` 及响应式绑定 |
| `Teleport`       | 内置组件 | 将内容渲染到指定 DOM 容器                                        |
| `lazy`           | 内置组件 | 异步组件加载，配合动态导入                                       |
| `onMount`        | 生命周期 | 挂载后回调                                                       |
| `onUnmount`      | 生命周期 | 销毁前清理                                                       |
| `mount`          | 挂载     | 挂载组件树并触发生命周期                                         |
| `unmount`        | 挂载     | 卸载组件树并清理所有资源                                         |
| `renderToString` | SSR      | 服务端渲染为 HTML 字符串（来自 `kiaao/server`）                  |
| `createRouter`   | 路由     | 客户端路由（来自 `kiaao/router`）                                |

**核心概念为 4 个（define、derive、effect、h），控制流由 `h()` 的原生属性指令实现，无需额外的 Show/List 组件。**

---

## 十四、与主流框架差异

| 维度            | React         | Vue                    | Solid            | **kiaao**                  |
| --------------- | ------------- | ---------------------- | ---------------- | -------------------------- |
| 数据纯净度      | 纯净          | 不纯净                 | 纯净（两套）     | **纯净（一套）**           |
| 组件运行次数    | 每次重跑      | 外壳一次               | 外壳一次         | **外壳一次**               |
| 虚拟 DOM        | 有            | 有                     | 无               | **无**                     |
| 编译器依赖      | 无            | 可选                   | 强依赖           | **无**                     |
| 响应式原理      | 无            | Proxy                  | 编译期           | **显式选择器**             |
| 核心概念数      | 10+           | 8+                     | 6+               | **4**                      |
| 更新粒度        | 组件级        | 组件/块级              | DOM 节点级       | **选择器结果级**           |
| 控制流方式      | 三元/`&&`/map | `v-if`/`v-for`         | `<Show>`/`<For>` | **`when`/`each` 属性指令** |
| Context/Provide | 有            | 有                     | 有               | **无（信号即通道）**       |
| 传送门          | 有            | 有                     | 有               | **有 (`<Teleport>`)**      |
| 异步组件        | `lazy`        | `defineAsyncComponent` | `lazy`           | **`lazy`**                 |
| 路由            | 独立库        | 独立库                 | 独立库           | **独立包**                 |

---

## 十五、代码量估算

| 模块                                                              | 预计行数          |
| ----------------------------------------------------------------- | ----------------- |
| `define`                                                          | 40-50             |
| `derive`                                                          | 25                |
| `effect`                                                          | 20                |
| `h` (含组件模式、children 扁平化、属性响应式绑定、when/each 指令) | 90-110            |
| 全局上下文与调度                                                  | 30                |
| `<Teleport>`                                                      | 15                |
| `lazy`                                                            | 20                |
| 生命周期钩子                                                      | 15                |
| 组件实例与清理（含 mount/unmount、节点级 effect）                 | 35                |
| SSR 相关 (`hSSR`, `renderToString`)                               | 55-65             |
| TypeScript 类型定义                                               | 40                |
| **总计**                                                          | **约 385-445 行** |

---

## 十六、待实现（V2+）

- 异步数据原语（`resource`）、微任务批处理调度器
- `<Suspense>` 完整实现
- DevTools：依赖图谱可视化
- Transition / TransitionGroup 动画支持
- 批量更新调度优化

---

## 十七、禁止事项

- 不使用 Proxy
- 不引入虚拟 DOM
- 不依赖编译插件
- 不为不同类型数据提供不同 API
- 不强制使用编译器
- 不提供 Context / provide-inject 机制
- 不提供独立的 Show/List 组件——控制流通过 `h()` 的原生属性指令实现
