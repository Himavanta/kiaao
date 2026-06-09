# `romise` 设计文档

**状态**：已实现  
**日期**：2026-06-09

## 一、问题

kiaao 应用中频繁出现的异步数据获取模式：

```tsx
function Component() {
  const [data, setData] = define<T | null>(null);
  const [loading, setLoading] = define(true);
  const [error, setError] = define<Error | null>(null);

  effect(() => {
    setLoading(true);
    setData(null);
    setError(null);

    doSomeFetch()
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e);
        setLoading(false);
      });
  });
  // ...
}
```

这段代码有样板代码量和竞态条件两个问题。`romise` 同时解决两者。

## 二、设计

### 接口

```ts
function romise<T>(factory: () => Promise<T> | T): {
  data: Getter<T | null>;
  loading: Getter<boolean>;
  error: Getter<Error | null>;
};
```

### 行为

|   状态   | 触发时机         | data | loading | error |
| :------: | :--------------- | :--: | :-----: | :---: |
|   初始   | 组件初始化时     | null |  true   | null  |
|   成功   | Promise resolve  |  T   |  false  | null  |
|   失败   | Promise reject   | null |  false  | Error |
| 重新请求 | factory 依赖变化 | null |  true   | null  |

### 竞态处理

每个新请求分配递增 ID，Promise 完成时只接受最新 ID 的结果，旧请求的结果被丢弃：

```
icon: A → 请求 ID=1（加载中）
icon: B → 请求 ID=2（加载中）
请求 2 返回 → data = B
请求 1 返回 → 丢弃（ID=1 不是最新 ID）
```

## 三、实现

```ts
// src/core/async.ts
import { type Getter } from "./types.ts";
import { define, effect } from "./runtime.ts";

let requestId = 0;

export function romise<T>(factory: () => Promise<T> | T): {
  data: Getter<T | null>;
  loading: Getter<boolean>;
  error: Getter<Error | null>;
} {
  const [data, setData] = define<T | null>(null);
  const [loading, setLoading] = define(true);
  const [error, setError] = define<Error | null>(null);

  effect(() => {
    const id = ++requestId;
    setLoading(true);
    setData(null);
    setError(null);

    Promise.resolve(factory())
      .then((d) => {
        if (id === requestId) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (id === requestId) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        }
      });
  });

  return { data, loading, error };
}
```

### 说明

- `Promise.resolve(factory())` 兼容 factory 返回 `T`（同步值）或 `Promise<T>` 的情况
- 使用闭包变量 `requestId`（模块级递增 ID），effect 每次重跑拿到最新 ID
- 非 Error 类型的 reject 值统一包装为 `Error`

## 四、使用示例

### Icon 组件

```tsx
function Icon(props) {
  const { data, loading, error } = romise(() => {
    const name = typeof props.icon === "function" ? props.icon() : props.icon;
    return name ? fetchIcon(name) : Promise.resolve(null);
  });

  const body = derive(() => data()?.body ?? "");

  return (
    <svg
      viewBox={data((v: any) => (v ? `0 0 ${v.width || 24} ${v.height || 24}` : "0 0 24 24"))}
      prop:innerHTML={body}
      {...svgProps}
    />
  );
}
```

### 同步值

```tsx
const { data, loading } = romise(() => {
  if (cached) return cached; // 同步返回
  return fetchData(); // 异步返回
});
```

## 五、导出位置

放在 `src/core/async.ts`，从 `src/index.ts` 导出：

```ts
// src/index.ts
export { romise } from "./core/async.ts";
```

等异步相关工具类多了以后可以拆出 `kiaao/async` 子路径。

## 六、测试要点

| 用例               | 说明                              |
| :----------------- | :-------------------------------- |
| Promise resolve    | data 更新为结果，loading 变 false |
| Promise reject     | error 更新，loading 变 false      |
| 同步返回值         | 立即响应                          |
| 快速连续请求       | 只有最新的结果生效                |
| effect 依赖变化    | 自动重新请求                      |
| 组件卸载后 resolve | 不触发更新（由 effect stop 保证） |

---

**文档结束**
