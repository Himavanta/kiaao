// @vitest-environment happy-dom
// JSX Runtime 极端测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, Fragment } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";
import { jsx, jsxs } from "../../src/jsx-runtime/index.ts";

setAdapter(browserAdapter);

import type { HResult } from "../../src/core/index.ts";

function mount(result: HResult): HTMLElement {
  const c = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(c, node as any);
  }
  return c;
}

describe("JSX — createJsxElement (jsx/jsxs)", () => {
  test("basic element", () => {
    const result = jsx("div", { id: "test", children: "hello" });
    const container = mount(result);
    const el = container.firstChild as HTMLElement;
    expect(el?.tagName).toBe("DIV");
    expect(el?.id).toBe("test");
    expect(el?.textContent).toBe("hello");
  });

  test("null type 不崩溃", () => {
    const result = jsx(null, { children: "x" });
    // null type -> h(null) returns empty comment, no crash
    expect(result.nodes).toBeDefined();
  });

  test("undefined type 不崩溃", () => {
    const result = jsx(undefined, { children: "x" });
    expect(result.nodes).toBeDefined();
  });

  test("null props 不崩溃", () => {
    const result = jsx("span", null);
    const container = mount(result);
    expect(container.children.length).toBe(1);
  });

  test("children 为嵌套数组", () => {
    const result = jsx("div", {
      children: [
        ["a", "b"],
        ["c", ["d", "e"]],
      ],
    });
    const container = mount(result);
    expect(container.textContent).toBe("abcde");
  });

  test("children 含 null/undefined/false/true", () => {
    const result = jsx("div", {
      children: ["x", null, "y", undefined, false, true, "z"],
    });
    const container = mount(result);
    // null/undefined/false/true 都被 nestBindPrimitive 处理
    // null/undefined -> 过滤, false! -> 渲染为 "false", true -> "true"
    expect(container.textContent).toBe("xyfalsetruez");
  });

  test("单子节点不是数组", () => {
    const result = jsx("div", { children: "single" });
    const container = mount(result);
    expect(container.textContent).toBe("single");
  });

  test("Fragment 无 children", () => {
    const result = jsx(Fragment, {});
    const container = mount(result);
    expect(container.children.length).toBe(0);
  });

  test("Fragment 含子节点", () => {
    const result = jsx(Fragment, { children: ["a", "b", "c"] });
    const container = mount(result);
    expect(container.textContent).toBe("abc");
  });

  test("Fragment 嵌套 Fragment", () => {
    const result = jsx(Fragment, {
      children: jsx(Fragment, { children: ["nested"] }),
    });
    const container = mount(result);
    expect(container.textContent).toBe("nested");
  });
});

describe("JSX — jsxs (multi-child)", () => {
  test("jsxs 与 jsx 行为一致", () => {
    const r1 = jsxs("div", { children: ["a", "b"] });
    const r2 = jsx("div", { children: ["a", "b"] });
    expect(r1.nodes.length).toBe(1);
    expect(r2.nodes.length).toBe(1);
  });
});

describe("JSX — key prop", () => {
  test("key 不影响渲染", () => {
    const result = jsx("div", { key: "my-key", children: "keyed" });
    const container = mount(result);
    expect(container.textContent).toBe("keyed");
  });
});

describe("JSX — 事件 props", () => {
  test("onClick 被正确处理", () => {
    let clicked = false;
    const result = jsx("button", {
      onClick: () => {
        clicked = true;
      },
      children: "click",
    });
    const container = mount(result);
    const btn = container.querySelector("button")!;
    btn.click();
    expect(clicked).toBe(true);
  });

  test("多个事件 prop", () => {
    const events: string[] = [];
    const result = jsx("div", {
      onMouseEnter: () => events.push("enter"),
      onClick: () => events.push("click"),
      children: "multi",
    });
    const container = mount(result);
    const el = container.firstChild as HTMLElement;
    el.dispatchEvent(new MouseEvent("mouseenter"));
    el.click();
    expect(events).toContain("enter");
    expect(events).toContain("click");
  });
});

describe("JSX — spread props", () => {
  test("spread 基础对象", () => {
    const rest = { className: "spread", id: "spread-id" };
    const result = jsx("div", { ...rest, children: "spread" });
    const container = mount(result);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toBe("spread");
    expect(el.id).toBe("spread-id");
  });

  test("spread 含事件", () => {
    let clicked = false;
    const rest = {
      onClick: () => {
        clicked = true;
      },
    };
    const result = jsx("button", { ...rest, children: "click" });
    const container = mount(result);
    container.querySelector("button")!.click();
    expect(clicked).toBe(true);
  });

  test("spread 覆盖 children", () => {
    const rest = { children: "from-spread" };
    const result = jsx("div", { ...rest, children: "explicit" });
    const container = mount(result);
    // explicit 应在 spread 之后，覆盖 spread
    expect(container.textContent).toBe("explicit");
  });
});

describe("JSX — 函数组件", () => {
  test("函数组件作为 type", () => {
    function Comp(props: any) {
      return h("span", null, props.label);
    }
    const result = jsx(Comp, { label: "comp" });
    const container = mount(result);
    expect(container.textContent).toBe("comp");
  });

  test("函数组件含 children", () => {
    function Wrapper(props: any) {
      return h("div", { class: "wrapper" }, props.children);
    }
    const result = jsx(Wrapper, { children: h("span", null, "inner") });
    const container = mount(result);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toBe("wrapper");
    expect(wrapper.textContent).toBe("inner");
  });
});
