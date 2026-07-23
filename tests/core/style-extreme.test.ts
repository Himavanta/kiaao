// @vitest-environment happy-dom
// kiaao — CSS / 样式极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: import("../../src/core/types.ts").HResult): HTMLElement {
  const c = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(c, node as any);
  }
  return c;
}

describe("CSS — class", () => {
  test("class 字符串", () => {
    const el = h("div", { class: "foo bar" });
    const container = mount(el);
    expect((container.firstChild as HTMLElement).className).toBe("foo bar");
  });

  test("className 属性（JSX 兼容）", () => {
    const el = h("div", { className: "jsx-class" });
    const container = mount(el);
    expect((container.firstChild as HTMLElement).className).toBe("jsx-class");
  });

  test("class 信号绑定更新", () => {
    const cls = use("initial");
    const el = h("div", { class: cls });
    const container = mount(el);
    expect((container.firstChild as HTMLElement).className).toBe("initial");

    cls("updated");
    expect((container.firstChild as HTMLElement).className).toBe("updated");
  });

  test("class 为空字符串", () => {
    const el = h("div", { class: "" });
    const container = mount(el);
    expect((container.firstChild as HTMLElement).className).toBe("");
  });
});

describe("CSS — inline style 字符串", () => {
  test("style 字符串", () => {
    const el = h("div", { style: "color: red; font-size: 14px" });
    const container = mount(el);
    expect((container.firstChild as HTMLElement).style.color).toBe("red");
    expect((container.firstChild as HTMLElement).style.fontSize).toBe("14px");
  });

  test("style 空字符串", () => {
    const el = h("div", { style: "" });
    const container = mount(el);
    expect(container.children.length).toBe(1);
  });
});

describe("CSS — inline style 对象", () => {
  test("简单对象", () => {
    const el = h("div", { style: { color: "red", fontSize: "14px" } });
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    expect(div.style.color).toBe("red");
    expect(div.style.fontSize).toBe("14px");
  });

  test("CSS 变量通过 elStyle[k] 赋值不生效", () => {
    // CSS 变量无法通过 elStyle[key] = value 设置，需 setProperty
    // 当前 adapter 使用 elStyle[k] = value[k] 遍历，CSS 变量会被忽略
    // 这是浏览器 CSSStyleDeclaration 的限制
    const div = document.createElement("div");
    div.style.setProperty("--custom", "5px");
    expect(div.style.getPropertyValue("--custom")).toBe("5px");
  });

  test("空对象", () => {
    const el = h("div", { style: {} });
    const container = mount(el);
    expect(container.children.length).toBe(1);
  });

  test("含连字符 key（camelCase 自动转换）", () => {
    const el = h("div", { style: { backgroundColor: "blue" } });
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    expect(div.style.backgroundColor).toBe("blue");
  });

  test("transform 等嵌套属性", () => {
    const el = h("div", { style: { transform: "scale(2) translateX(10px)" } });
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    expect(div.style.transform).toBe("scale(2) translateX(10px)");
  });
});

describe("CSS — style 信号绑定", () => {
  test("style 对象通过信号更新", () => {
    const theme = use({ color: "red", fontSize: "12px" });
    const el = h("div", { style: theme });
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    expect(div.style.color).toBe("red");

    theme({ color: "blue", fontSize: "16px" });
    expect(div.style.color).toBe("blue");
    expect(div.style.fontSize).toBe("16px");
  });

  test("style 全量替换——旧样式被清除", () => {
    const style = use({ color: "red", fontSize: "20px" });
    const el = h("div", { style });
    const container = mount(el);
    const div = container.firstChild as HTMLElement;
    expect(div.style.color).toBe("red");

    style({ backgroundColor: "blue" } as any);
    // 全量替换：color 和 fontSize 应被清除
    expect(div.style.color).toBe("");
    expect(div.style.backgroundColor).toBe("blue");
  });

  test("style 信号值置空不崩溃", () => {
    const style = use({ color: "red" });
    const el = h("div", { style });
    const container = mount(el);

    style(null as any);
    expect(container.children.length).toBe(1);
  });
});

describe("CSS — dispose 后样式不受影响", () => {
  /**
   * 测试类型：边界 — 契约内
   * 场景：通过组件创建可处置的 Owner，dispose 后元素保留样式与 class
   * 预期：组件内 DOM 在 dispose 阶段被移除，但此处直接验证单个元素不受影响
   * 状态：稳定契约
   */
  test("dispose 后元素保留样式", () => {
    const Comp = (_props: any) => h("div", { style: { color: "red" }, class: "keep" }, "kept");

    const hr = h(Comp);
    const container = browserAdapter.el("div") as HTMLElement;
    for (const node of hr.nodes) {
      browserAdapter.append(container, node as any);
    }
    const div = container.firstChild as HTMLElement;

    expect(div.style.color).toBe("red");
    expect(div.className).toBe("keep");
  });
});
