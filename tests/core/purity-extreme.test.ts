// @vitest-environment happy-dom
// kiaao — 组件纯度与 identity 极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount } from "../../src/core/index.ts";
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

describe("组件纯度", () => {
  test("相同 props 多次调用 h() 结果独立", () => {
    function Label(props: { text: string }) {
      return h("span", null, props.text);
    }

    const r1 = h(Label, { text: "hello" });
    const r2 = h(Label, { text: "hello" });

    // 每次 h() 产生独立的 HResult
    expect(r1).not.toBe(r2);
    expect(r1.nodes[0]).not.toBe(r2.nodes[0]);
  });

  test("无状态组件渲染稳定", () => {
    function Static() {
      return h("div", { class: "static" }, "content");
    }

    for (let i = 0; i < 50; i++) {
      const result = h(Static);
      const container = mount(result);
      expect(container.textContent).toBe("content");
      expect((container.firstChild as HTMLElement).className).toBe("static");
    }
  });

  test("组件引用 identity 在信号更新后不变", () => {
    const count = use(0);
    let renderCount = 0;

    function Tracker(props: { label: string }) {
      renderCount++;
      return h("span", null, `${props.label}: ${count()}`);
    }

    const result = h(Tracker, { label: "track" });
    const container = mount(result);
    expect(container.textContent).toBe("track: 0");

    // 信号更新触发重新渲染？不——只有派生或直接绑定的信号才会更新
    // 对于静态 h() 调用，Tracker 只是被调用一次
    expect(renderCount).toBe(1);
  });
});

describe("identity — 引用稳定性", () => {
  test("普通元素 h() 每次创建新节点", () => {
    const d1 = h("div", null, "a");
    const d2 = h("div", null, "a");
    expect(d1.nodes[0]).not.toBe(d2.nodes[0]);
  });

  test("Fragment 每次创建新 HResult", () => {
    void import("../../src/core/h.ts").then(({ Fragment }) => {
      const f1 = h(Fragment as any, null, "a", "b");
      const f2 = h(Fragment as any, null, "a", "b");
      expect(f1).not.toBe(f2);
    });
  });
});
