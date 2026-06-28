// @vitest-environment happy-dom
// kiaao — 共享 HResult + toggle 循环：嵌套组件内容在多次开关后仍完整

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, Show, use, type Context } from "../../src/core/index.ts";
import { createApp } from "../../src/dom/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

describe("shared HResult toggle", () => {
  test("nested component children survive repeated open/close", () => {
    const visible = use(false);

    // 模拟 MenuRow：内部包含嵌套组件 + DOM 元素
    const MenuRow = ({ text }: { text: string }, _ctx: Context) =>
      h(
        "div",
        { class: "row" },
        h("span", { class: "icon" }, ">"),
        h("span", { class: "text" }, text),
      );

    // 共享的 children HResult（只创建一次，跨 toggle 复用）
    const content = h(
      "div",
      { class: "menu" },
      h(MenuRow, { text: "A" }),
      h(MenuRow, { text: "B" }),
    );

    const App = () =>
      h(
        "div",
        { class: "container" },
        h(Show as any, { value: visible }, () => h("div", { class: "wrapper" }, content)),
      );

    const app = createApp(h(App));
    const container = browserAdapter.el("div") as HTMLElement;
    app.mount(container);

    function checkRows(expectPresent: boolean) {
      const rows = container.querySelectorAll(".row");
      expect(rows.length).toBe(expectPresent ? 2 : 0);
      if (expectPresent) {
        // 行内嵌套内容必须完整
        expect(rows[0].children.length).toBe(2);
        expect(rows[1].children.length).toBe(2);
        expect(rows[0].querySelector(".text")?.textContent).toBe("A");
        expect(rows[1].querySelector(".text")?.textContent).toBe("B");
      }
    }

    // 第 1 次打开
    visible(true);
    checkRows(true);

    // 关闭
    visible(false);
    checkRows(false);

    // 第 2 次打开——shared HResult 的节点复用，子内容必须完整
    visible(true);
    checkRows(true);

    // 第 3 次
    visible(false);
    visible(true);
    checkRows(true);

    app.unmount();
  });
});
