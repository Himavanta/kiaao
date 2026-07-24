# JSX 指令类型兼容方案

## 问题

指令函数通过 `direct()` 创建，类型为 `DirectiveFunction`：

```ts
type DirectiveFunction = (
  el: Element,
  props: Record<string, any>,
  context: DirectiveContext,
) => void;
```

在 JSX 中使用时：

```tsx
const [play, Motion] = createMotion(visible, context);

return (
  <Motion from={{ opacity: 0 }} to={{ opacity: 1 }}>
    <div>content</div>
  </Motion>
);
```

TypeScript 报错：

```
"Motion" 不能用作 JSX 组件。其返回类型 "void" 不是有效的 JSX 元素。
```

## 根因

### JSX 组件检查流程

TypeScript 对 JSX 标签 `<Motion>` 的类型检查分两步：

1. **`ElementClass` 匹配**：检查 `Motion` 是否兼容 `JSX.ElementClass`
2. **返回类型检查**：检查 `Motion` 的返回类型是否可赋值给 `JSX.Element`（即 `Node`）

### 不可调和的矛盾

`DirectiveFunction` 返回 `void`，JSX 要求返回 `Node`。`void` 在 strict 模式下不能赋值给 `Node`，所以 TS 拒绝。

设置 `ElementClass` overload 声明返回 `void | Node` 也不行——TS 检查的是函数的实际返回类型 `void`，而不是 overload 声明的返回类型。

## 其他框架的类似场景

### React —— `forwardRef`

```ts
const FancyInput = forwardRef<HTMLInputElement, Props>((props, ref) => ...);
```

`forwardRef` 接收的 render 函数有额外的 `ref` 参数，不兼容普通组件的类型签名。React 的解决方式：

```ts
forwardRef(renderFn) → ForwardRefExoticComponent<Props>
//                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                      新类型，只暴露 (props) => Element 给 JSX
```

`ForwardRefExoticComponent` 是一个**交集类型**，同时保留了内部 `ref` 处理逻辑和 JSX 组件所需的调用签名。

## 解决方案：intersection 类型

让 `direct()` 的返回类型包含 JSX 组件签名：

```ts
export const direct = <T extends DirectiveFunction>(
  fn: T,
): T & ((props: Record<string, any>) => Node) => {
  (fn as any)[DIRECT_KEY] = true;
  return fn as T & ((props: Record<string, any>) => Node);
};
```

`Motion` 类型变为：

```
DirectiveFunction & ((props: Record<string, any>) => Node)
```

### 为什么这是正确的

这个 intersection 描述的是指令函数在 kiaao 中的**双重身份**：

| 身份     | 调用方              | 实际行为                             | 类型描述            |
| -------- | ------------------- | ------------------------------------ | ------------------- |
| 指令     | `h()` 内部          | `directive(el, props, ctx)`          | `DirectiveFunction` |
| JSX 组件 | TypeScript 类型检查 | `h(directive, props)` 返回 `Element` | `(props) => Node`   |

JSX 编译 `<Motion>` 为 `h(Motion, props)`，`h()` 内部通过 `DIRECT_KEY` 识别指令函数并正确调度。intersection 中的 `(props) => Node` 签名为 TypeScript 提供了 JSX 所需的类型信息，不会影响运行时行为。

这与 React 的 `ForwardRefExoticComponent` 模式完全相同。

### 替代方案对比

| 方案 | JSX 检查 | 类型纯度 | 运行时影响 |
| ---------------------------------- | -------------- | -------- | -------------------- | --- |
| intersection **✓** | 通过 | 语义正确 | 无 |
| `void                              | Node` 返回类型 | 不通过 | 纯粹 | 无 |
| `void` → `Node`（改指令签名） | 通过 | 纯粹 | 所有指令需 return el |
| 改 `JSX.Element` 为 `Node \| void` | 通过 | 全局放宽 | 组件类型检查失效 |
