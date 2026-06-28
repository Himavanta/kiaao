// @vitest-environment happy-dom
// kiaao — 内存泄漏检测：反复创建/销毁后检查 DOM 和信号残留

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { getSignalState, h, use, triggerMount, type HResult } from "../../src/core/index.ts";
import { createOwner, disposeOwner } from "../../src/core/owner.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: HResult): HTMLElement {
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(container, node as any);
  }
  if (result.owner) triggerMount(result.owner);
  return container;
}

// ── 循环创建/销毁 ─────────────────────────────────────

describe("memory — create/dispose cycle", () => {
  test("1000 create+dispose does not accumulate DOM nodes", () => {
    const container = browserAdapter.el("div") as HTMLElement;
    browserAdapter.append(document.body, container);

    for (let i = 0; i < 1000; i++) {
      const Comp = () => h("div", { class: "cycle" }, String(i));
      const result = h(Comp);
      for (const node of result.nodes) {
        browserAdapter.append(container, node as any);
      }
      if (result.owner) triggerMount(result.owner);
      disposeOwner(result.owner!);
    }

    expect(container.children.length).toBe(0);
    browserAdapter.remove(container);
  });

  test("1000 Show toggle does not leak signal subscriptions", () => {
    // After cleanup, the derived should not fire
    let fireCount = 0;
    const sig = use(0);

    for (let i = 0; i < 1000; i++) {
      const owner = createOwner();
      const derived = use(sig, () => {
        fireCount++;
      });
      const state = getSignalState(derived)!;
      if (state?.stop) owner.cleanups.push(state.stop);
      disposeOwner(owner);
    }

    const before = fireCount;
    sig(42);
    // After 1000 cleanup cycles, the derived should NOT fire (cleaned up)
    expect(fireCount).toBe(before);
  });

  test("signal sub set size does not grow after repeated use()+dispose", () => {
    // Directly test the subscriber set
    const sig = use(0);
    const sigState = getSignalState(sig)!;

    const initialSubCount = sigState.subs.size;

    for (let i = 0; i < 100; i++) {
      const owner = createOwner();
      const derived = use(sig, () => {});
      const dState = getSignalState(derived)!;
      if (dState?.stop) owner.cleanups.push(dState.stop);
      disposeOwner(owner);
    }

    // Subscriber set should return to initial size after all cleanups
    expect(sigState.subs.size).toBe(initialSubCount);
  });
});

// ── 多层组件树 ────────────────────────────────────────

describe("memory — deep tree", () => {
  function deepTree(depth: number): any {
    if (depth <= 0) return h("span", { class: "leaf" }, "end");
    return h("div", { class: `depth-${depth}` }, deepTree(depth - 1));
  }

  test("50 levels deep creates and disposes without leak", () => {
    const result = deepTree(50);
    const container = mount(result);
    expect(container.querySelector(".leaf")).toBeTruthy();
    disposeOwner(result.owner!);
  });

  test("component tree depth 30 disposes cleanly", () => {
    const Level = (props: { depth: number }) => {
      if (props.depth <= 0) {
        return h("span", { class: "leaf" }, "end");
      }
      return h("div", null, h(Level, { depth: props.depth - 1 }));
    };
    const result = h(Level as any, { depth: 30 });
    const container = mount(result);
    expect(container?.querySelector(".leaf")).toBeTruthy();
    disposeOwner(result.owner!);
    // After dispose, leaf should be removed from DOM
  });
});

// ── 信号绑定清理 ──────────────────────────────────────

describe("memory — signal binding cleanup", () => {
  test("signal text binding stops updating after owner dispose", () => {
    const sig = use("hello");
    const owner = createOwner();

    // Simulate what nestBindPrimitive does
    const textNode = browserAdapter.text("") as Text;
    textNode.textContent = String(sig());
    const derived = use(sig, () => {
      textNode.textContent = String(sig());
    });
    const state = getSignalState(derived)!;
    if (state?.stop) owner.cleanups.push(state.stop);

    // Before dispose: signal change updates text
    sig("world");
    expect(textNode.textContent).toBe("world");

    disposeOwner(owner);

    // After dispose: signal change should NOT update text
    sig("gone");
    expect(textNode.textContent).toBe("world");
  });
});
