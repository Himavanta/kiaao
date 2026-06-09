// kiaao — Async utilities: romise

import { type Getter } from "./types.ts";
import { define, effect } from "./runtime.ts";

/**
 * 将 Promise 工厂函数转换为响应式异步状态。
 * 自动处理 loading、error、data 三个状态和竞态条件。
 *
 * @param factory 返回 Promise 或同步值的函数，其依赖在 effect 中自动追踪
 * @returns { data, loading, error } 三个 getter
 *
 * @example
 * const { data, loading } = romise(() => fetch(`/api/users/${id()}`).then(r => r.json()));
 */
export function romise<T>(factory: () => Promise<T> | T): {
  data: Getter<T | null>;
  loading: Getter<boolean>;
  error: Getter<Error | null>;
} {
  let requestId = 0;

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
