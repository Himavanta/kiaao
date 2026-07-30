// @vitest-environment happy-dom
// 验证函数子元素通过 handleComponent（组件管线）渲染

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount, disposeOwner, type HResult } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

/** 辅助：将 HResult 挂到 DOM 并 triggerMount */
function mount(result: HResult): HTMLElement {
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(container, node as Node);
  }
  if (result.owner) triggerMount(result.owner);
  return container;
}

describe("函数子元素 — 基础渲染", () => {
  test("() => h('span', null, 'hello') 渲染为 <span>hello</span>", () => {
    const app = () => h("div", null, () => h("span", null, "hello"));
    const result = h(app);
    const container = mount(result);
    expect(container.querySelector("span")?.textContent).toBe("hello");
  });

  test("() => 42 渲染为文本节点 '42'", () => {
    const app = () => h("div", null, () => 42);
    const result = h(app);
    const container = mount(result);
    expect(container.textContent).toBe("42");
  });

  test("() => undefined 不产生可见节点", () => {
    const app = () => h("div", null, () => undefined, "end");
    const result = h(app);
    const container = mount(result);
    // 只有 "end" 文本（undefined 转为空文本节点）
    expect(container.textContent).toBe("end");
  });

  test("多个函数子元素各自独立", () => {
    const app = () =>
      h(
        "div",
        null,
        () => h("span", { class: "a" }, "A"),
        () => h("span", { class: "b" }, "B"),
      );
    const result = h(app);
    const container = mount(result);
    expect(container.querySelector(".a")?.textContent).toBe("A");
    expect(container.querySelector(".b")?.textContent).toBe("B");
  });
});

describe("函数子元素 — Owner 生命周期", () => {
  test("函数子元素获得 Owner（通过 onMount 验证）", () => {
    let mounted = false;
    const app = () =>
      h("div", null, (_props: unknown, ctx: { onMount: (fn: () => void) => void }) => {
        ctx.onMount(() => {
          mounted = true;
        });
        return h("span", null, "child");
      });
    const result = h(app);
    mount(result);
    expect(mounted).toBe(true);
  });

  test("卸载父组件时，函数子元素的 onUnmount 被触发", () => {
    let unmounted = false;
    const app = () =>
      h("div", null, (_props: unknown, ctx: { onUnmount: (fn: () => void) => void }) => {
        ctx.onUnmount(() => {
          unmounted = true;
        });
        return h("span", null, "child");
      });
    const result = h(app);
    mount(result);

    expect(unmounted).toBe(false);
    disposeOwner(result.owner!);
    expect(unmounted).toBe(true);
  });

  test("函数子元素可以用 context.use 创建组件级信号", () => {
    let signalRef: any = null;
    const app = () =>
      h("div", null, (_props: unknown, ctx: { use: Function }) => {
        const count = ctx.use(0);
        signalRef = count;
        return h("span", null, count);
      });
    const result = h(app);
    mount(result);
    expect(signalRef).toBeDefined();
    expect(typeof signalRef).toBe("function");
  });
});

describe("函数子元素 — 信号快照（组件只执行一次）", () => {
  test("函数子元素内调 signal() 是快照，不会响应变化", () => {
    const count = use(0);
    const app = () => h("div", null, () => count());
    const result = h(app);
    const container = mount(result);

    expect(container.textContent).toBe("0");
    count(42);
    // 组件只跑一次，count() 是初始快照
    expect(container.textContent).toBe("0");
  });

  test("传 Signal 引用（非调用）可以响应变化", () => {
    const count = use(0);
    const app = () => h("div", null, count);
    const result = h(app);
    const container = mount(result);

    expect(container.textContent).toBe("0");
    count(42);
    expect(container.textContent).toBe("42");
  });
});

describe("函数子元素 — props.children 透传", () => {
  test("通过 props.children 传递组件函数仍然正常工作", () => {
    function Child() {
      return h("span", { class: "child" }, "child");
    }
    function Parent(props: { children: Function }) {
      return h("div", { class: "parent" }, props.children);
    }
    const result = h(Parent as any, null, Child);
    const container = mount(result);

    expect(container.querySelector(".child")?.textContent).toBe("child");
  });
});
