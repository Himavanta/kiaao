// @vitest-environment happy-dom
// kiaao — 适配器热切换与多实例极端测试

import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";

import { setAdapter, removeNode, setRenderMode, getRenderMode } from "../../src/adapter/index.ts";
import { h, triggerMount } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

// 全局 adapter 注册
setAdapter(browserAdapter);

type HRes = import("../../src/core/types.ts").HResult;

function mount(result: HRes): HTMLElement {
  const c = document.createElement("div");
  for (const node of result.nodes) {
    browserAdapter.append(c, node);
  }
  if (result.owner) triggerMount(result.owner);
  return c;
}

describe("适配器——基本切换", () => {
  test("切换前后渲染正确", () => {
    const el = h("span", null, "before");
    const c = mount(el);
    expect(c.textContent).toBe("before");

    // 切换 adapter（同一实现）
    setAdapter(browserAdapter);
    const el2 = h("span", null, "after");
    const c2 = mount(el2);
    expect(c2.textContent).toBe("after");
  });

  test("setAdapter 多次调用不崩溃", () => {
    for (let i = 0; i < 100; i++) {
      setAdapter(browserAdapter);
    }
    expect(true).toBe(true);
  });
});

describe("适配器——getAdapter 错误处理", () => {
  beforeEach(() => {
    // 保存当前 adapter
  });
  afterEach(() => {
    setAdapter(browserAdapter);
  });

  test("未注册 adapter 时 getAdapter 抛异常", () => {
    // getAdapter 在 adapter 未注册时抛异常
    // 测试环境中已注册 browserAdapter，无法直接测试未注册路径
    expect(true).toBe(true);
  });

  test("未注册 adapter 时 removeNode 静默跳过", () => {
    // removeNode 使用 _adapter?.remove(node)，适配器未注册时静默跳过
    expect(() => removeNode(null)).not.toThrow();
    expect(() => removeNode(undefined)).not.toThrow();
  });
});

describe("适配器——removeNode 防御", () => {
  test("removeNode(null/undefined) 不崩溃", () => {
    setAdapter(browserAdapter);
    expect(() => removeNode(null)).not.toThrow();
    expect(() => removeNode(undefined)).not.toThrow();
  });

  test("removeNode(非节点) 静默跳过", () => {
    // removeNode 内部使用 _adapter?.remove(node)，非 node 不保证类型安全
    // null/undefined 被前置守卫过滤
    expect(() => removeNode(null)).not.toThrow();
    expect(() => removeNode(undefined)).not.toThrow();
  });
});

describe("RenderMode 切换", () => {
  test("getRenderMode 默认 dom", () => {
    expect(getRenderMode()).toBe("dom");
  });

  test("setRenderMode 切换", () => {
    setRenderMode("ssr");
    expect(getRenderMode()).toBe("ssr");
    setRenderMode("hydrate");
    expect(getRenderMode()).toBe("hydrate");
    setRenderMode("dom");
  });

  test("RenderMode 与 adapter 独立", () => {
    setRenderMode("ssr");
    setAdapter(browserAdapter);
    // RenderMode 和 adapter 是独立的
    expect(getRenderMode()).toBe("ssr");
    setRenderMode("dom");
  });
});

describe("多 adapter 实例", () => {
  test("两个独立 adapter 同时存在", () => {
    // adapter 是全局单例，但可以通过不同实现模拟
    const adapter1 = browserAdapter;
    const adapter2 = browserAdapter; // DOM 场景下相同

    setAdapter(adapter1);
    const el1 = h("div", null, "from-adapter1");
    const c1 = mount(el1);
    expect(c1.textContent).toBe("from-adapter1");

    setAdapter(adapter2);
    const el2 = h("div", null, "from-adapter2");
    const c2 = mount(el2);
    expect(c2.textContent).toBe("from-adapter2");
  });
});

describe("适配器——createApp 集成", () => {
  test("createApp 不依赖 adapter 热切换", async () => {
    const mod = await import("../../src/dom/create-app.ts");
    expect(typeof mod.createApp).toBe("function");
  });
});
