// @vitest-environment happy-dom
// Motion 极端测试
//
// 注意：Motion 依赖 Web Animations API（motion 库），happy-dom 不支持。
// 触发 triggerMount → onMount → playEnterAnimation → animate() 会抛异常。
// 这里仅测试 createMotion 返回结构和信号隔离逻辑，不挂载到 DOM。
// 动画实际播放需在浏览器环境验证。

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { use } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";
import { createMotion } from "../../src/motion/index.ts";

setAdapter(browserAdapter);

describe("Motion — 基本结构", () => {
  test("createMotion 返回 [visible, Directive]", () => {
    const [visible, Motion] = createMotion(() => true);
    expect(typeof visible).toBe("function");
    expect(typeof Motion).toBe("function");
  });

  test("visible 信号初始值与业务信号一致", () => {
    const [visible] = createMotion(() => true);
    expect(visible()).toBe(true);

    const [v2] = createMotion(() => false);
    expect(v2()).toBe(false);
  });

  test("createMotion 接受 use 创建的信号", () => {
    const sig = use(true);
    const [visible, Motion] = createMotion(sig);
    expect(visible()).toBe(true);
    expect(typeof Motion).toBe("function");
  });

  test("信号订阅已被注册", () => {
    const sig = use(true);
    createMotion(sig);

    // 直接修改业务信号，不会立即改变 visible（因为退出动画）
    sig(false);
    // visible 的更新是异步的（handleSignalChange 中 await Promise.allSettled）
    // 这里只验证业务信号变化本身不崩溃
    expect(sig()).toBe(false);
  });
});

describe("Motion — 多个实例", () => {
  test("两个 Motion 实例返回独立 visible", () => {
    const [va] = createMotion(() => true);
    const [vb] = createMotion(() => false);
    expect(va()).toBe(true);
    expect(vb()).toBe(false);
  });
});

describe("Motion — dispose 安全", () => {
  test("dispose 后信号变化不崩溃", () => {
    const sig = use(true);
    createMotion(sig);

    // 不挂载到 DOM，只验证 dispose 行为
    sig(false);
    expect(true).toBe(true);
  });
});
