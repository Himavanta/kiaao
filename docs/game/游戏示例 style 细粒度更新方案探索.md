# 游戏示例 style 细粒度更新方案探索

**状态**：讨论中
**关联**：packages/example/src/world/index.tsx（ECS 游戏示例）
**前置依赖**：自定义指令系统（direct）、derivation memo 语义（待实现）

## 一、背景与动机

ECS 游戏示例中，Box 组件通过派生信号生成整个 style 对象：

```tsx
const style = use(entity, () => ({
  width: `${entity().w}px`,
  height: `${entity().h}px`,
  transform: `translate(${entity().x}px, ${entity().y}px)`,
  // ...
}));

return <div style={style} />;
```

当前存在两个层级的粒度问题：

1. **派生层**：`use` 的依赖是信号级——实体信号每帧提交新对象，整个 style 派生每帧重算。
2. **应用层**：DOM adapter 对 style 对象做全量替换（先 `removeAttribute("style")` 清空、再 `Object.assign` 合并），即使只有 height 变化，width/transform 等属性也会被重新写入。

**目标**：允许 style 属性级细粒度更新——例如 height 单独变化时，只重算 height 对应逻辑、只写 `el.style.height`，不触碰其他属性。

## 二、现状分析

### 2.1 应用层现状：setProp 的 style 分支

```ts
// style 对象 → 全量替换：先清空再合并
if (key === "style" && isObject(value)) {
  const elStyle = (el as any).style;
  if (elStyle && isObject(elStyle)) {
    el.removeAttribute("style");
    Object.assign(elStyle, value);
    return;
  }
  // SSR 路径（不应走到这里，兜底）
  el.setAttribute("style", attrToString(value));
  return;
}
```

### 2.2 关键技术事实（已用 happy-dom 验证）

**事实 1：CSSStyleDeclaration 是 style attribute 的活视图，双向同步。**

| 操作                                  | 结果                                            |
| ------------------------------------- | ----------------------------------------------- |
| `setAttribute("style", "color: red")` | `el.style.color` 立即为 `"red"`                 |
| `el.style.color = "blue"`             | `getAttribute("style")` 立即为 `"color: blue;"` |
| `Object.assign(el.style, {...})`      | attribute 同步为完整序列化结果                  |
| `removeAttribute("style")`            | `el.style.cssText` 清空                         |

**事实 2：`Object.assign(el.style, obj)` 只增不减。**

先设置 `opacity: 0.5`，再 `Object.assign(el.style, { color: "red" })`，结果 attribute 为 `"color: red; opacity: 0.5;"`——旧键残留。这就是 `removeAttribute` 存在的意义：从存储层面抹掉所有旧键，保证"新对象精确取代旧样式"（全量替换语义）。

**事实 3：`el.style = 对象` 无效。**

CSSOM 规范中 `HTMLElement.style` 定义为 `[PutForwards=cssText]`，赋值被转发给 `cssText` 的 setter；`cssText` 类型是 DOMString，对象被 ToString 成 `"[object Object]"`（无效 CSS，被忽略；happy-dom 直接置空）。因此"对象 → 内联样式"的唯一通道是 `Object.assign(el.style, obj)` 逐属性写入。

**事实 4：字符串 style 不需要特殊处理。**

`style="color:red"` 不满足 `isObject(value)`，跳过 style 分支，落到兜底 `el[key] = value`，等价于 `el.style.cssText = "color:red"`（原生全量替换，MDN 确认有效）。两条路径最终语义一致（都是全量替换），但对象路径必须用"清空 + 合并"来模拟字符串路径天然具备的全量语义。

### 2.3 派生层现状：信号级依赖

`use(entity, () => styleObject)` 中读取 `entity()` 收集的是实体信号级依赖，实体信号任何字段变化都会触发派生重算。派生重算后返回新对象（引用不等），下游无条件收到通知。

## 三、方案探索历程

### 3.1 方案 A：绑定层解包内嵌信号（core 通用机制）

JSX 允许对象属性值内嵌信号：

```tsx
<div style={{ color, transform }} />
```

core 绑定层识别 style 对象中的信号，为每个属性建立独立订阅；adapter 暴露逐键应用接口。

- 优点：使用形态最自然，零封装
- 代价：绑定层要动（对象解包 + per-key 订阅），adapter 要加逐键接口，且需要处理键集合 diff、undefined 语义、与字符串路径并存等问题
- 结论：改动面大，实现复杂

### 3.2 方案 B：Proxy 字段级依赖追踪

实体信号值 Proxy 化，读字段收集 `(信号, 字段)` 依赖，帧提交时 diff 旧值/新值、只触发变化字段的依赖。

- 优点：使用方 API 完全不变，派生自动按读取字段收集依赖
- 代价：为 kiaao 引入字段级依赖引擎（依赖状态机扩展字段维度），与"整对象替换"的帧提交语义冲突，需要提交时字段级 diff
- 结论：重型方案，暂不采纳；若未来派生 fn 昂贵（如布局计算）才值得

### 3.3 方案 C：DOM adapter 层遍历订阅

adapter 收到 style 对象时遍历内部属性，`isUse` 识别信号并建立 per-key 订阅，信号变化时 `el.style[key] = v`。

- 优点：改动集中在 DOM adapter 一处，使用方零封装
- 代价：adapter 从"纯应用"变为"有状态订阅者"（需持有订阅映射、键集合 diff、卸载清理钩子）；core 需暴露信号订阅原语；且 style 分支的 removeAttribute/cssText 语义纠缠使改造比预想复杂
- 结论：可行但成本高，与"core 收敛、平台特化"的分工存在张力

### 3.4 共同地基：derivation memo 语义

所有方案的前提——派生层值比较：**派生重算后与缓存值比较（`===`），相同则不通知下游**。

- 副作用派生不受影响：副作用发生在重算时（fn 执行），值比较只过滤"下游通知"。`use(left, () => { el.style.left = left(); })` 的 fn 在 left 变化触发重算时执行，与是否通知无关。
- 向后兼容：现有整对象派生每帧返回新引用，`===` 恒不等，行为不变。
- 使用约定：投影派生应返回原始值（`() => entity().color` 返回 string），`===` 比较才有意义；返回新对象则 memo 退化为不 memo（行为正确，只是没省到）。

### 3.5 方案 D（结论方向）：StyleMemo 指令

用自定义指令封装"信号 → 样式属性"映射，不动 core 绑定层与 adapter：

```tsx
function Box(_, { use }) {
  const entity = useGame(ctx, ...);

  return (
    <StyleMemo
      value={{
        color: use(entity, () => entity().color),
      }}
    >
      <div />
    </StyleMemo>
  );
}

const StyleMemo = direct((el, { value }, { use }) => {
  const vals = toValue(value);
  for (const key in vals) {
    const val = vals[key];
    if (isUse(val)) {
      use(val, () => {
        el.style[key] = val();
      });
    } else {
      el.style[key] = val;
    }
  }
});
```

## 四、结论方案分析

### 4.1 链路验证

```
entity 每帧更新（整对象提交）
  → color = use(entity, () => entity().color)    值派生，返回原始值
  → memo：color 没变 → 不通知下游
      → use(color, () => { el.style.color = color() })
        副作用派生不重算 → el.style.color 不被碰 ✓
  → color 真变 → 通知 → 副作用重算 → el.style.color = 新值 ✓
```

### 4.2 依赖的 kiaao 模型前提（均已满足）

1. **组件函数只执行一次**（无 React 式重渲染）——`value` 对象只创建一次，指令挂载时遍历的键集合固定。
2. **指令函数只在元素创建时执行一次**（自定义指令系统 2.7 节）——与组件哲学一致；props 中的信号变化由指令内部 `context.use` 订阅处理，正是 StyleMemo 的实现方式。
3. **指令的包裹元素形态**（自定义指令系统 2.5/3.1 节）——`<StyleMemo><div /></StyleMemo>` 遍历 children 对每个 Element 调用指令函数；多子元素时每个元素各自建立订阅。
4. **`context.use` 绑定元素生命周期**（自定义指令系统 2.4 节）——指令创建的派生随元素移除自动清理，无需手动管理。

### 4.3 实现约定

- **undefined 值**：信号变 `undefined` 时应 `removeProperty(key)`，而不是赋值 `"undefined"` 字符串。
- **camelCase 键**：`el.style[key] = v` 对 `backgroundColor` 等键原生映射，无需处理。
- **责任边界**：指令管理的 style 键由指令独占；元素上同时存在 `style={...}` 绑定且对象含相同键时，两处写入冲突——约定为指令优先/文档化契约。
- **键集合固定**：条件样式（`{ color, ...(cond && { opacity }) }`）需要条件变化时重新挂载指令才能增删键——在无重渲染模型下的明确约定。

### 4.4 与其他方案的关系

| 方案                          | 细粒度实现位置                 | core 改动                   |
| ----------------------------- | ------------------------------ | --------------------------- |
| A：绑定层解包                 | core 绑定层 + adapter 逐键接口 | 绑定层要动                  |
| B：Proxy 字段追踪             | 响应式状态机                   | 状态机扩展字段维度          |
| C：adapter 遍历订阅           | DOM adapter                    | 暴露订阅原语 + 卸载钩子     |
| **D：StyleMemo 指令（采纳）** | **指令生态**                   | **仅 derivation memo 语义** |

方案 D 将复杂度隔离在指令内部，与 PositionDirect（位置映射专用指令）形成统一形态：StyleMemo 是通用版（value 对象任意键），PositionDirect 是专用版（位置计算封装）。

## 五、待确认 / 遗留问题

1. **memo 语义的实现落点**：derivation 重算后与缓存值比较，相同不通知下游——需要确认 `DerivationState` 中缓存写入与通知的时序。
2. **副作用派生的下游**：嵌套在副作用派生（返回 undefined）上的下游永远收不到通知——在"副作用派生不产生值"的语义下属于错误用法，无需特别处理，但值得在文档中说明。
3. **StyleMemo 与 style 绑定并存的责任边界**：是否需要运行时检测（指令写入的键与 style 绑定冲突时警告）。
4. **PositionDirect 示例**：作为专用指令的对照实现，验证指令形态的复用性。

## 六、结论

游戏示例的 style 细粒度更新采用**方案 D（StyleMemo 指令）+ derivation memo 语义**：

- core 只加一处改动：派生层值比较（memo 语义），不破坏现有任何语义（副作用派生天然免疫）
- 细粒度能力从指令生态长出：StyleMemo（通用样式映射）、PositionDirect（专用位置映射）
- 不动绑定层、不动 adapter 的 style 分支——字符串 style 与对象 style 的现有路径完全保留
