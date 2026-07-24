// @vitest-environment happy-dom
// 验证 adoptBranch 对函数 children 的支持

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, Show, use } from "../../src/core/index.ts";
import { createApp } from "../../src/dom/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

describe("adoptBranch function children", () => {
  test("function children gets called on each toggle", () => {
    const visible = use(false);
    let callCount = 0;

    const App = () =>
      h(
        "div",
        null,
        h(Show as any, { value: visible }, () =>
          h(
            "div",
            { class: "wrapper" },
            // 函数 children - 每次 Show 分支重建时调用
            () => {
              callCount++;
              return h("span", { class: "item" }, "fresh");
            },
          ),
        ),
      );

    const app = createApp(App);
    const container = browserAdapter.el("div") as HTMLElement;
    app.mount(container);

    visible(true);
    expect(container.querySelectorAll(".item").length).toBe(1);

    visible(false);
    visible(true);
    expect(container.querySelectorAll(".item").length).toBe(1);
    expect(callCount).toBe(2); // 2 次打开（initial 渲染时 Show 未激活，不触发）
    app.unmount();
  });
});
