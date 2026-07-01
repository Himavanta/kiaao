// @vitest-environment happy-dom
// Motion 快速切换测试
//
// happy-dom 不支持 Web Animations API（motion 库的 animate() 会抛异常）。
// 但 try-catch 防护后整体流程仍可完成，visible 信号最终应与业务信号一致。

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { createApp } from "../../src/dom/create-app.ts";
import { browserAdapter } from "../../src/dom/index.ts";
import { use, h, Show } from "../../src/index.ts";
import { createMotion } from "../../src/motion/index.ts";

setAdapter(browserAdapter);

describe("Motion — 快速切换", () => {
  test("state(true)→false→true→false 快速切换后 visible 最终正确", async () => {
    const state = use(true);
    const [visible, raw] = createMotion(state);
    const MotionTag = raw as any;

    const App = () =>
      h(
        "div",
        null,
        h(Show, { value: visible } as any, [
          () =>
            h(
              MotionTag,
              {
                from: { opacity: 0, transform: "translateY(16px)" },
                to: { opacity: 1, transform: "translateY(0)" },
                duration: 0.3,
              },
              h("div"),
            ),
        ]),
      );

    createApp(h(App)).mount(document.body);
    await new Promise((r) => setTimeout(r, 10));

    expect(visible()).toBe(true);
    state(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(state()).toBe(false);
    state(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(state()).toBe(true);
    expect(visible()).toBe(true);
    state(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(state()).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(visible()).toBe(false);
  });

  test("快速连续切换不崩溃", async () => {
    const state = use(true);
    const [visible, raw] = createMotion(state);
    const MotionTag = raw as any;

    const App = () =>
      h(
        "div",
        null,
        h(Show, { value: visible } as any, [
          () =>
            h(
              MotionTag,
              {
                from: { opacity: 0 },
                to: { opacity: 1 },
                duration: 0.3,
              },
              h("span"),
            ),
        ]),
      );

    createApp(h(App)).mount(document.body);
    await new Promise((r) => setTimeout(r, 10));

    for (let i = 0; i < 5; i++) {
      state(!state());
      await new Promise((r) => setTimeout(r, 2));
      state(!state());
      await new Promise((r) => setTimeout(r, 2));
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(visible()).toBe(state());
  });

  test("动画信号隔离：业务信号变化后 visible 延迟更新", async () => {
    const state = use(true);
    const [visible] = createMotion(state);

    const App = () => h("div", null, h(Show, { value: visible } as any, [() => h("div")]));

    createApp(h(App)).mount(document.body);
    await new Promise((r) => setTimeout(r, 10));

    state(false);
    expect(visible()).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(visible()).toBe(false);
  });
});
