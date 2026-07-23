// @vitest-environment happy-dom
// Portal 极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount, disposeOwner, Show } from "../../src/core/index.ts";
import { browserAdapter, Portal } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

describe("Portal — 基本功能", () => {
  test("渲染到 body", () => {
    const target = document.createElement("div");
    target.id = "portal-target";
    document.body.append(target);

    const el = h(Portal as any, { to: "#portal-target" }, h("span", null, "hello"));
    if (el.owner) triggerMount(el.owner);

    expect(target.children.length).toBe(1);
    expect(target.querySelector("span")?.textContent).toBe("hello");
  });

  test("渲染到指定元素引用", () => {
    const target = document.createElement("div");
    document.body.append(target);

    const el = h(Portal as any, { to: target }, h("span", null, "world"));
    if (el.owner) triggerMount(el.owner);

    expect(target.children.length).toBe(1);
  });

  test("target 不存在时返回 comment 节点", () => {
    const el = h(Portal as any, { to: "#nonexistent-dummy" }, h("span"));
    if (el.owner) triggerMount(el.owner);

    // 应返回 comment 不崩溃
    expect(el.nodes.length).toBe(1);
  });

  test("多个 Portal 到同一 target", () => {
    const target = document.createElement("div");
    document.body.append(target);

    const el1 = h(Portal as any, { to: target }, h("span", null, "A"));
    const el2 = h(Portal as any, { to: target }, h("span", null, "B"));
    if (el1.owner) triggerMount(el1.owner);
    if (el2.owner) triggerMount(el2.owner);

    expect(target.children.length).toBe(2);
    expect(target.children[0]?.textContent).toBe("A");
    expect(target.children[1]?.textContent).toBe("B");
  });

  test("Portal 内使用信号", () => {
    const target = document.createElement("div");
    document.body.append(target);
    const text = use("init");

    const el = h(Portal as any, { to: target }, h("span", null, text));
    if (el.owner) triggerMount(el.owner);

    expect(target.querySelector("span")?.textContent).toBe("init");

    text("updated");
    expect(target.querySelector("span")?.textContent).toBe("updated");
  });
});

describe("Portal — 极端场景", () => {
  test("100 个 Portal 到同一 target 不崩溃", () => {
    const target = document.createElement("div");
    document.body.append(target);

    const results: any[] = [];
    for (let i = 0; i < 100; i++) {
      const el = h(Portal as any, { to: target }, h("span", null, String(i)));
      if (el.owner) triggerMount(el.owner);
      results.push(el);
    }

    expect(target.children.length).toBe(100);
  });

  test("Portal 嵌套 Portal", () => {
    const outerTarget = document.createElement("div");
    outerTarget.id = "outer";
    document.body.append(outerTarget);

    const innerTarget = document.createElement("div");
    innerTarget.id = "inner";
    document.body.append(innerTarget);

    // inner portal 渲染到 outer portal 的内容中
    const el = h(
      Portal as any,
      { to: outerTarget },
      h(Portal as any, { to: innerTarget }, h("span", null, "nested")),
    );
    if (el.owner) triggerMount(el.owner);

    expect(innerTarget.querySelector("span")?.textContent).toBe("nested");
  });

  test("Portal dispose 后目标元素内容被清理", () => {
    const target = document.createElement("div");
    document.body.append(target);

    const el = h(Portal as any, { to: target }, h("span", null, "temp"));
    if (el.owner) triggerMount(el.owner);
    expect(target.children.length).toBe(1);

    if (el.owner) disposeOwner(el.owner);
    expect(target.children.length).toBe(0);
  });

  test("Portal 内子元素含 signal 的 dispose 清理", () => {
    const target = document.createElement("div");
    document.body.append(target);
    const count = use(0);

    const el = h(Portal as any, { to: target }, h("span", null, count));
    if (el.owner) triggerMount(el.owner);
    expect(target.querySelector("span")?.textContent).toBe("0");

    count(1);
    expect(target.querySelector("span")?.textContent).toBe("1");

    if (el.owner) disposeOwner(el.owner);
    expect(target.children.length).toBe(0);
  });

  // Portal 在 Show 内切换时，分支卸载应清理 Portal 内容
  test("Portal 在 Show 内切换不泄漏", () => {
    const target = document.createElement("div");
    document.body.append(target);
    const show = use(true);

    const el = h(
      "div",
      null,
      h(Show as any, { value: show }, () =>
        h(Portal as any, { to: target }, h("span", null, "visible")),
      ),
    );
    if (el.owner) triggerMount(el.owner);
    expect(target.children.length).toBe(1);

    show(false);
    expect(target.children.length).toBe(0);

    show(true);
    expect(target.children.length).toBe(1);
  });
});
