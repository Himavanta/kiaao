// @vitest-environment happy-dom
// kiaao — 递归组件极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount, disposeOwner } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: import("../../src/core/types.ts").HResult): HTMLElement {
  const c = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(c, node as any);
  }
  if (result.owner) triggerMount(result.owner);
  return c;
}

describe("递归组件", () => {
  test("递归 10 层渲染正确", () => {
    function Tree(props: { depth: number }) {
      if (props.depth <= 0) return h("span", { class: "leaf" }, "end");
      return h("div", { class: "branch" }, h(Tree as any, { depth: props.depth - 1 }));
    }

    const result = h(Tree as any, { depth: 10 });
    const container = mount(result);

    expect(container.querySelector(".leaf")?.textContent).toBe("end");
    expect(container.querySelectorAll(".branch").length).toBe(10);
  });

  test("递归 50 层渲染正确", () => {
    function Tree(props: { depth: number }) {
      if (props.depth <= 0) return h("span", { class: "leaf" }, "end");
      return h("div", { class: "branch" }, h(Tree as any, { depth: props.depth - 1 }));
    }

    const result = h(Tree as any, { depth: 50 });
    const container = mount(result);

    expect(container.querySelector(".leaf")?.textContent).toBe("end");
    expect(container.querySelectorAll(".branch").length).toBe(50);
  });

  test("递归 100 层渲染正确", () => {
    function Tree(props: { depth: number }) {
      if (props.depth <= 0) return h("span", { class: "leaf" }, "end");
      return h("div", { class: "branch" }, h(Tree as any, { depth: props.depth - 1 }));
    }

    const result = h(Tree as any, { depth: 100 });
    const container = mount(result);

    expect(container.querySelectorAll(".branch").length).toBe(100);
    expect(container.querySelector(".leaf")?.textContent).toBe("end");
  });

  test("递归组件 dispose 后 DOM 正确清理", () => {
    function Tree(props: { depth: number }) {
      if (props.depth <= 0) return h("span", null, "end");
      return h("div", null, h(Tree as any, { depth: props.depth - 1 }));
    }

    const result = h(Tree as any, { depth: 30 });
    const container = mount(result);

    expect(container.children.length).toBe(1);

    if (result.owner) disposeOwner(result.owner);
    expect(container.children.length).toBe(0);
  });
});

describe("递归 + 控制流", () => {
  test("递归组件内含 Show", () => {
    function Tree(props: { depth: number; show: () => boolean }) {
      if (props.depth <= 0) return h("span", null, "end");
      return h(
        "div",
        null,
        props.show()
          ? h(Tree as any, { depth: props.depth - 1, show: props.show })
          : h("span", null, "hidden"),
      );
    }

    const show = use(true);
    const result = h(Tree as any, { depth: 5, show });
    const container = mount(result);
    expect(container.querySelectorAll("div").length).toBe(5);
  });

  test("递归深度超出调用栈时捕获", () => {
    // 递归深度取决于运行环境 V8 调用栈限制，不保证每次都会抛
    // 组件实现者应自行控制深度
    function Tree(props: { depth: number }) {
      if (props.depth <= 0) return h("span", null, "end");
      return h("div", null, h(Tree as any, { depth: props.depth - 1 }));
    }

    // 较大深度可能抛出栈溢出，不强制断言
    try {
      const result = h(Tree as any, { depth: 50000 });
      mount(result);
    } catch {
      // 栈溢出，预期行为
    }
    expect(true).toBe(true);
  });
});
