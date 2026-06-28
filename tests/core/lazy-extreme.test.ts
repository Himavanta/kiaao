// @vitest-environment happy-dom
// Lazy 极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount, disposeOwner } from "../../src/core/index.ts";
import { browserAdapter, lazy } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

/** 辅助：将 HResult 挂到 DOM 并 triggerMount */
function mount(result: import("../../src/core/types.ts").HResult): HTMLElement {
  const c = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(c, node as any);
  }
  if (result.owner) triggerMount(result.owner);
  return c;
}

describe("Lazy — 基本功能", () => {
  test("loader resolve 后渲染组件", async () => {
    const LazyComp = lazy(() => Promise.resolve({ default: () => h("span", null, "loaded") }));
    const result = h(LazyComp as any);
    const container = mount(result);

    expect((result.nodes[0] as any).nodeType).toBe(8);

    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).toBe("loaded");
  });

  test("loader 直接返回组件（非 {default}）", async () => {
    const LazyComp = lazy(() => Promise.resolve(() => h("span", null, "direct")));
    const result = h(LazyComp as any);
    const container = mount(result);

    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).toBe("direct");
  });

  test("loader reject 显示错误信息", async () => {
    const orig = console.error;
    console.error = () => {};

    const LazyComp = lazy(() => Promise.reject(new Error("fail")));
    const result = h(LazyComp as any);
    const container = mount(result);

    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).toContain("fail");

    console.error = orig;
  });

  test("props 传递给 lazy 组件", async () => {
    const LazyComp = lazy(() =>
      Promise.resolve({ default: (props: any) => h("span", null, props.msg) }),
    );
    const result = h(LazyComp as any, { msg: "hello" });
    const container = mount(result);

    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).toBe("hello");
  });
});

describe("Lazy — 极端场景", () => {
  test("loader 永不 resolve — 不崩溃", async () => {
    const LazyComp = lazy(() => new Promise(() => {}));
    const result = h(LazyComp as any);
    mount(result);

    await new Promise((r) => setTimeout(r, 10));
    expect((result.nodes[0] as any).nodeType).toBe(8);
  });

  test("resolve 前 dispose — 不崩溃", async () => {
    let resolveFn!: (v: any) => void;
    const LazyComp = lazy(
      () =>
        new Promise((r) => {
          resolveFn = r;
        }),
    );
    const result = h(LazyComp as any);
    mount(result);

    disposeOwner(result.owner!);
    resolveFn!({ default: () => h("span", null, "late") });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.owner?.disposed).toBe(true);
  });

  test("100 个 lazy 组件同时加载", async () => {
    const containers: HTMLElement[] = [];
    for (let i = 0; i < 100; i++) {
      const LazyComp = lazy(() => Promise.resolve({ default: () => h("span", null, String(i)) }));
      const result = h(LazyComp as any);
      const container = mount(result);
      containers.push(container);
    }

    await new Promise((r) => setTimeout(r, 10));

    for (let i = 0; i < 100; i++) {
      expect(containers[i].textContent).toBe(String(i));
    }
  });

  test("lazy 组件内使用信号", async () => {
    const LazyComp = lazy(() =>
      Promise.resolve({
        default: () => {
          const count = use(0);
          const el = h("span", null, count);
          setTimeout(() => count(42), 0);
          return el;
        },
      }),
    );
    const result = h(LazyComp as any);
    const container = mount(result);

    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).toBe("42");
  });

  test("lazy 组件内 onMount 执行", async () => {
    let mounted = false;
    const LazyComp = lazy(() =>
      Promise.resolve({
        default: (props: any, ctx: any) => {
          ctx.onMount(() => {
            mounted = true;
          });
          return h("span", null, "mounted");
        },
      }),
    );
    const result = h(LazyComp as any);
    mount(result);

    await new Promise((r) => setTimeout(r, 10));
    expect(mounted).toBe(true);
  });

  test("多次创建相同 lazy 组件独立", async () => {
    const LazyComp = lazy(() => Promise.resolve({ default: () => h("span", null, "same") }));

    const result1 = h(LazyComp as any);
    const result2 = h(LazyComp as any);
    const container1 = mount(result1);
    const container2 = mount(result2);

    await new Promise((r) => setTimeout(r, 10));

    expect(container1.textContent).toBe("same");
    expect(container2.textContent).toBe("same");
  });
});
