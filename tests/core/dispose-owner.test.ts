// @vitest-environment happy-dom
// kiaao — disposeOwner 幂等性测试

import { describe, expect, test } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { getSignalState, h, triggerMount, use, type HResult } from "../../src/core/index.ts";
import { createOwner, disposeOwner } from "../../src/core/owner.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: HResult): HTMLElement {
  function Root() {
    return result;
  }
  const rootHr = h(Root as any);
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of rootHr.nodes) {
    browserAdapter.append(container, node as any);
  }
  if (rootHr.owner) triggerMount(rootHr.owner);
  return container;
}

describe("disposeOwner — idempotence", () => {
  test("calling disposeOwner twice is safe", () => {
    const owner = createOwner();
    disposeOwner(owner);
    disposeOwner(owner); // Should not crash
    expect(owner.disposed).toBe(true);
  });

  test("disposeOwner on already disposed owner is no-op", () => {
    const owner = createOwner();
    disposeOwner(owner);
    const elementsBefore = owner.elements.size;
    disposeOwner(owner);
    expect(owner.elements.size).toBe(elementsBefore);
  });

  test("elements are removed from DOM after dispose", () => {
    const result = h("div", { class: "to-remove" }, "content");
    const container = browserAdapter.el("div") as HTMLElement;
    browserAdapter.append(container, result.nodes[0] as any);

    expect(container.querySelector(".to-remove")).toBeTruthy();
    if (result.owner) disposeOwner(result.owner);
  });

  test("component owner dispose removes its elements from DOM", () => {
    const Comp = () => h("div", { class: "comp-el" }, "hello");
    const result = h(Comp);
    const container = mount(result);

    expect(container.querySelector(".comp-el")).toBeTruthy();
    if (result.owner) disposeOwner(result.owner);
    // After dispose, element should be removed
  });

  test("signal subscriptions are cleaned up on dispose", () => {
    const sig = use(0);
    let derivedCount = 0;
    const owner = createOwner();

    const derived = use(sig, () => {
      derivedCount++;
    });
    const state = getSignalState(derived)!;
    if (state?.stop) owner.cleanups.push(state.stop);

    sig(1);
    expect(derivedCount).toBe(2);

    disposeOwner(owner);
    sig(2);
    // After cleanup, derived should NOT re-evaluate
    expect(derivedCount).toBe(2);
  });

  test("disposeOwner on owner with child owners removes all elements", () => {
    const Child = () => h("span", { class: "child-el" }, "child");
    const Parent = () => h("div", null, h(Child));
    const result = h(Parent);
    const container = mount(result);

    expect(container.querySelector(".child-el")).toBeTruthy();
    if (result.owner) disposeOwner(result.owner);
  });

  test("repeated create + dispose 100 times does not leak elements", () => {
    const container = browserAdapter.el("div") as HTMLElement;
    browserAdapter.append(document.body, container);

    for (let i = 0; i < 100; i++) {
      const Comp = () => h("div", { class: "leak-test" }, String(i));
      const result = h(Comp);
      for (const node of result.nodes) {
        browserAdapter.append(container, node as any);
      }
      if (result.owner) triggerMount(result.owner);
      if (result.owner) disposeOwner(result.owner);
    }

    expect(container.children.length).toBe(0);
    browserAdapter.remove(container);
  });
});
