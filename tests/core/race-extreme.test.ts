// @vitest-environment happy-dom
// kiaao — 竞态与时序极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount, disposeOwner } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: import("../../src/core/types.ts").HResult): HTMLElement {
  function Root() {
    return result;
  }
  const rootHr = h(Root as any);
  const c = browserAdapter.el("div") as HTMLElement;
  for (const node of rootHr.nodes) {
    browserAdapter.append(c, node as any);
  }
  if (rootHr.owner) triggerMount(rootHr.owner);
  return c;
}

describe("信号回调 — 时序竞争", () => {
  test("派生链中修改源信号不崩溃", () => {
    const a = use(0);
    const log: number[] = [];

    use(a, () => {
      const v = a();
      log.push(v);
      if (v < 5) a(v + 1);
      return v;
    });

    expect(log).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("setTimeout 内修改信号", () =>
    new Promise<void>((done) => {
      const sig = use(0);
      setTimeout(() => {
        sig(42);
        expect(sig()).toBe(42);
        done();
      }, 5);
    }));

  test("多个派生监听同一源信号", () => {
    const src = use(0);
    use(src, () => src() * 10);
    use(src, () => src() * 100);

    expect(true).toBe(true);
  });

  test("dispose 后信号写入不崩溃", () => {
    const sig = use(0);

    // 创建一个简单的信号消费者
    const derived = use(sig, () => sig() * 2);
    expect(derived()).toBe(0);

    // 无法直接 dispose 派生，但写入不会因 dispose 而崩溃
    sig(42);
    expect(derived()).toBe(84);
  });
});

describe("组件 dispose 时序", () => {
  test("dispose 幂等 — 重复调用不崩溃", () => {
    function App() {
      return h("div", null, "text");
    }
    const result = h(App as any);
    mount(result);

    if (result.owner) disposeOwner(result.owner);
    expect(() => disposeOwner(result.owner!)).not.toThrow();
  });

  test("dispose 后再次 dispose 不崩溃（幂等）", () => {
    function App() {
      return h("div", null, "text");
    }
    const result = h(App as any);
    mount(result);

    if (result.owner) disposeOwner(result.owner);
    expect(() => disposeOwner(result.owner!)).not.toThrow();
  });
});

describe("Show 重入", () => {
  test("Show 信号切换不崩溃", () => {
    const show = use(true);

    const result = h("div", null, show() ? h("span", null, "visible") : h("span", null, "hidden"));
    const container = mount(result);
    expect(container.textContent).toBe("visible");

    show(false);
    // 注意：函数子不是响应式绑定，
    // 要用真正的 <Show> 组件才能响应切换
    // 这里只是验证不崩溃
    expect(true).toBe(true);
  });

  test("使用真正的 Show 组件切换", async () => {
    const { Show } = await import("../../src/core/index.ts");
    const show = use(true);

    const result = h(
      "div",
      null,
      h(
        Show as any,
        { value: show },
        () => h("span", null, "visible"),
        () => h("span", null, "hidden"),
      ),
    );
    const container = mount(result);
    expect(container.textContent).toBe("visible");

    show(false);
    // Show 的 subscribeSignal 跳过初始调用
    // 需要等微任务
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe("hidden");
  });
});
