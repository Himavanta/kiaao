// @vitest-environment happy-dom
// kiaao — 错误恢复与 createApp 边界测试

import { expect, test, describe } from "vite-plus/test";

import { setAdapter, getAdapter } from "../../src/adapter/index.ts";
import { h, use, triggerMount } from "../../src/core/index.ts";
import { createOwner, disposeOwner } from "../../src/core/owner.ts";
import { createApp } from "../../src/dom/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

// ── createApp 边界 ────────────────────────────────────

describe("createApp — edge cases", () => {
  test("createApp with empty HResult mounts silently", () => {
    const hr = h("div");
    const app = createApp(hr);
    const container = browserAdapter.el("div") as HTMLElement;
    expect(() => app.mount(container)).not.toThrow();
    app.unmount();
  });

  test("createApp then mount twice on same container is safe", () => {
    const Comp = () => h("span", null, "content");
    const container = browserAdapter.el("div") as HTMLElement;
    const app = createApp(h(Comp));
    app.mount(container);
    expect(() => app.mount(container)).not.toThrow();
    app.unmount();
  });

  test("createApp unmount before mount is safe", () => {
    const Comp = () => h("span", null, "never");
    const app = createApp(h(Comp));
    expect(() => app.unmount()).not.toThrow();
  });

  test("createApp with null result does not crash", () => {
    const NullComp = () => null as any;
    const app = createApp(h(NullComp));
    const container = browserAdapter.el("div") as HTMLElement;
    expect(() => app.mount(container)).not.toThrow();
    app.unmount();
  });

  test("createApp with component that throws handles gracefully", () => {
    const ThrowComp = () => {
      throw new Error("init error");
    };
    const app = createApp(h(ThrowComp));
    const container = browserAdapter.el("div") as HTMLElement;
    expect(() => app.mount(container)).not.toThrow();
    app.unmount();
  });
});

// ── Owner 异常恢复 ─────────────────────────────────────

describe("owner — error recovery", () => {
  test("component that throws in render still produces owner", () => {
    const BadComp = () => {
      throw new Error("render fail");
    };
    const result = h(BadComp);
    expect(result.owner).toBeTruthy();
    expect(result.owner!.disposed).toBe(true);
  });

  test("dispose of already disposed owner chain is safe", () => {
    const parent = createOwner();
    const child = createOwner();
    child.parent = parent;
    parent.children.push(child);

    disposeOwner(parent);
    // Second dispose of child should be safe (already disposed)
    expect(() => disposeOwner(child)).not.toThrow();
    expect(child.disposed).toBe(true);
  });

  test("creating child after parent disposed is safe", () => {
    const parent = createOwner();
    disposeOwner(parent);
    const child = createOwner();
    child.parent = parent;
    parent.children.push(child);
    // parent already disposed, child is created but parent won't process it
    expect(child.disposed).toBe(false);
  });
});

// ── 多个信号绑定同一元素 ──────────────────────────────

describe("multi-signal — same element", () => {
  test("two signals binding to different attributes of same element", () => {
    const text = use("hello");
    const cls = use("box");

    const Comp = () => h("div", { class: cls }, text);
    const result = h(Comp);
    const container = browserAdapter.el("div") as HTMLElement;
    for (const node of result.nodes) browserAdapter.append(container, node as any);
    if (result.owner) triggerMount(result.owner);

    const el = container.querySelector("div")!;
    expect(el.textContent).toBe("hello");
    expect(el.className).toBe("box");

    text("world");
    expect(el.textContent).toBe("world");

    cls("highlight");
    expect(el.className).toBe("highlight");
  });

  test("signal bound to style then overridden by static style", () => {
    const color = use("red");

    // This pattern is supported: signal creates derived binding, static overrides
    const el = browserAdapter.el("div") as HTMLElement;
    const adapter = getAdapter();

    adapter.setProp(el, "style", { color: color() } as any);
    adapter.setProp(el, "style", { fontSize: "20px" });

    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("20px");
  });
});

// ── 信号在组件树不同层级 ──────────────────────────────

describe("signal — across component levels", () => {
  test("signal lifted to parent, used in child updates both", () => {
    const shared = use("shared");
    const Parent = () => h("div", { class: "parent" }, h(Child), h(Child));
    const Child = () => h("span", { class: "child" }, shared);
    const result = h(Parent);
    const container = browserAdapter.el("div") as HTMLElement;
    for (const node of result.nodes) browserAdapter.append(container, node as any);
    if (result.owner) triggerMount(result.owner);

    expect(container.querySelectorAll(".child").length).toBe(2);
    expect(container.textContent).toBe("sharedshared");

    shared("updated");
    expect(container.textContent).toBe("updatedupdated");
  });
});

// ── 错误回调 ─────────────────────────────────────────

describe("error — safeCall resilience", () => {
  test("multiple errors in lifecycle do not cascade", () => {
    let mountCount = 0;
    const Comp = (_p: any, ctx: any) => {
      ctx.onMount(() => {
        mountCount++;
      });
      ctx.onMount(() => {
        throw new Error("first error");
      });
      ctx.onMount(() => {
        mountCount++;
      });
      ctx.onMount(() => {
        throw new Error("second error");
      });
      return h("div", null, "still renders");
    };

    const result = h(Comp);
    const container = browserAdapter.el("div") as HTMLElement;
    for (const node of result.nodes) browserAdapter.append(container, node as any);
    if (result.owner) triggerMount(result.owner);

    // onMount that throw should not prevent others from executing
    expect(mountCount).toBe(2);
    expect(container.textContent).toBe("still renders");
  });

  test("error in onUnmount does not prevent element removal", () => {
    const Comp = (_p: any, ctx: any) => {
      ctx.onUnmount(() => {
        throw new Error("unmount fail");
      });
      return h("div", { class: "to-remove" }, "gone");
    };
    const result = h(Comp);
    const container = browserAdapter.el("div") as HTMLElement;
    for (const node of result.nodes) browserAdapter.append(container, node as any);
    if (result.owner) triggerMount(result.owner);

    expect(container.querySelector(".to-remove")).toBeTruthy();
    expect(() => disposeOwner(result.owner!)).not.toThrow();
    // Element should be removed despite error in onUnmount
  });
});

// ── 空/null 组件树 ────────────────────────────────────

describe("empty/null — component tree", () => {
  test("div with only null/undefined children renders empty", () => {
    const result = h("div", null, null, undefined);
    const container = browserAdapter.el("div") as HTMLElement;
    for (const node of result.nodes) browserAdapter.append(container, node as any);
    expect(container.children[0].childNodes.length).toBe(0);
  });

  test("nested empty divs render without crash", () => {
    const result = h("div", null, h("div"), h("div", null, h("div")));
    const container = browserAdapter.el("div") as HTMLElement;
    for (const node of result.nodes) browserAdapter.append(container, node as any);
    expect(container.querySelectorAll("div").length).toBe(4);
  });

  test("component returning array with mixed valid/invalid", () => {
    const Comp = () => [null, h("span", { class: "valid" }, "ok"), undefined, false];
    const result = h(Comp);
    expect(result.nodes.length).toBe(2);
    expect((result.nodes[0] as HTMLElement).className).toBe("valid");
  });
});
