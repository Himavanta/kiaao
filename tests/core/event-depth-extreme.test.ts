// @vitest-environment happy-dom
// kiaao — DOM 事件深度极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, triggerMount, disposeOwner } from "../../src/core/index.ts";
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

describe("事件 — 基本行为", () => {
  test("onClick 触发", () => {
    let clicked = false;
    const el = h(
      "button",
      {
        onClick: () => {
          clicked = true;
        },
      },
      "click",
    );
    const container = mount(el);
    container.querySelector("button")!.click();
    expect(clicked).toBe(true);
  });

  test("多个事件监听同一个元素", () => {
    const events: string[] = [];
    const el = h(
      "div",
      {
        onClick: () => events.push("click"),
        onMouseEnter: () => events.push("enter"),
      },
      "multi",
    );
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    div.click();
    div.dispatchEvent(new MouseEvent("mouseenter"));
    expect(events).toContain("click");
    expect(events).toContain("enter");
  });

  test("事件处理函数替换", () => {
    const calls: number[] = [];
    const el = h("button", {
      onClick: () => calls.push(1),
      children: "replace",
    });
    const container = mount(el);
    const btn = container.querySelector("button")!;
    btn.click();
    expect(calls).toEqual([1]);
  });
});

describe("事件 — stopPropagation", () => {
  test("stopPropagation 阻止冒泡", () => {
    const outerCalls: string[] = [];
    const el = h(
      "div",
      { onClick: () => outerCalls.push("outer") },
      h(
        "button",
        {
          onClick: (e: MouseEvent) => {
            e.stopPropagation();
            outerCalls.push("inner");
          },
        },
        "stop",
      ),
    );
    const container = mount(el);
    container.querySelector("button")!.click();
    // 只有 inner 被调用，outer 因 stopPropagation 不触发
    expect(outerCalls).toEqual(["inner"]);
  });

  test("不阻止冒泡时冒泡到父元素", () => {
    const calls: string[] = [];
    const el = h(
      "div",
      { onClick: () => calls.push("outer") },
      h("button", { onClick: () => calls.push("inner") }, "bubble"),
    );
    const container = mount(el);
    container.querySelector("button")!.click();
    expect(calls).toContain("inner");
    expect(calls).toContain("outer");
  });
});

describe("事件 — preventDefault", () => {
  test("preventDefault 阻止默认行为", () => {
    let defaultPrevented = false;
    const el = h(
      "a",
      {
        href: "/test",
        onClick: (e: MouseEvent) => {
          e.preventDefault();
          defaultPrevented = true;
        },
      },
      "link",
    );
    const container = mount(el);
    const a = container.querySelector("a")!;
    a.click();
    expect(defaultPrevented).toBe(true);
    // 页面不应跳转（happy-dom 默认不跳转，但 preventDefault 应调用）
  });

  test("表单 submit 可阻止", () => {
    let submitted = false;
    const el = h(
      "form",
      {
        onSubmit: (e: Event) => {
          e.preventDefault();
          submitted = true;
        },
      },
      h("button", { type: "submit" }, "submit"),
    );
    const container = mount(el);
    const form = container.querySelector("form")!;
    form.dispatchEvent(new Event("submit"));
    expect(submitted).toBe(true);
  });
});

describe("事件 — 自定义事件", () => {
  test("dispatchEvent 自定义事件", () => {
    let received = false;
    const el = h(
      "div",
      {
        onCustom: () => {
          received = true;
        },
      },
      "custom",
    );
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    div.dispatchEvent(new CustomEvent("custom"));
    // 事件名映射：onCustom → custom
    expect(received).toBe(true);
  });

  test("自定义事件传数据", () => {
    let detail: any = null;
    const el = h(
      "div",
      {
        onData: (e: CustomEvent) => {
          detail = e.detail;
        },
      },
      "data",
    );
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    div.dispatchEvent(new CustomEvent("data", { detail: { msg: "hello" } }));
    expect(detail).toEqual({ msg: "hello" });
  });
});

describe("事件 — dispose 清理", () => {
  test("dispose 后事件不触发", () => {
    let clicked = false;
    function App() {
      return h(
        "button",
        {
          onClick: () => {
            clicked = true;
          },
        },
        "dispose",
      );
    }
    const el = h(App as any);
    const container = mount(el);
    const btn = container.querySelector("button")!;

    if (el.owner) disposeOwner(el.owner);
    btn.click();
    expect(clicked).toBe(false);
  });

  test("dispose 后移除事件监听", () => {
    let count = 0;
    function App() {
      return h(
        "button",
        {
          onClick: () => {
            count++;
          },
        },
        "count",
      );
    }
    const el = h(App as any);
    const container = mount(el);
    const btn = container.querySelector("button")!;

    btn.click();
    expect(count).toBe(1);

    if (el.owner) disposeOwner(el.owner);
    btn.click();
    expect(count).toBe(1);
  });
});

describe("事件 — edge cases", () => {
  test("onClick 值为 null 不崩溃", () => {
    const el = h("button", { onClick: null }, "null-event");
    const container = mount(el);
    container.querySelector("button")!.click();
    expect(true).toBe(true);
  });

  test("onClick 值为 undefined 不崩溃", () => {
    const el = h("button", { onClick: undefined }, "undef-event");
    const container = mount(el);
    container.querySelector("button")!.click();
    expect(true).toBe(true);
  });

  test("100 个元素各自绑定事件", () => {
    const counts: number[] = [];
    const children = [];
    for (let i = 0; i < 100; i++) {
      counts.push(0);
      const j = i;
      children.push(
        h(
          "button",
          {
            key: j,
            onClick: () => {
              counts[j]++;
            },
          },
          String(j),
        ),
      );
    }
    const el = h("div", null, ...children);
    const container = mount(el);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(100);

    buttons[42].click();
    expect(counts[42]).toBe(1);
    buttons[99].click();
    expect(counts[99]).toBe(1);
  });
});
