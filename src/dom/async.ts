// kiaao v4 — Async utilities: romise

import { type Getter } from "../reactive/types.ts";
import { use } from "../reactive/core.ts";

/**
 * 将 Promise 工厂函数转换为响应式异步状态。
 * 自动处理 loading、error、data 三个状态。
 *
 * TODO: v4.0 中取消了自动依赖收集，因此 romise 目前仅执行一次。
 * 若需要响应式重新触发（当上游依赖变化时），需先 resolve dep tracking API。
 * 参见 spec.md §8 待定事项。
 *
 * @param factory 返回 Promise 或同步值的函数
 * @returns { data, loading, error } 三个 getter
 */
export function romise<T>(factory: () => Promise<T> | T): {
  data: Getter<T | null>;
  loading: Getter<boolean>;
  error: Getter<Error | null>;
} {
  const [data, setData] = use<T | null>(null);
  const [loading, setLoading] = use(true);
  const [error, setError] = use<Error | null>(null);

  // 注：目前仅执行一次，不追踪 factory 内部的信号访问。
  // 后续将通过显式 deps 参数支持响应式重新触发。
  Promise.resolve(factory())
    .then((d) => {
      setData(d);
      setLoading(false);
    })
    .catch((e) => {
      setError(e instanceof Error ? e : new Error(String(e)));
      setLoading(false);
    });

  return { data, loading, error };
}
