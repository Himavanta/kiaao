// @vitest-environment happy-dom
// kiaao — createGroupMotion (each mode) tests

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";
import { mount, unmount } from "../../src/dom/component.ts";
import { createGroupMotion } from "../../src/motion/index.ts";

const keyFn = (v: any) => v.id;

// ── Basics ───────────────────────────────────────────

describe("createGroupMotion — basics", () => {
  test("returns [visibleItems, GroupMotion] tuple", () => {
    const [items] = use([]);
    const [visibleItems, GroupMotion] = createGroupMotion(items);
    expect(typeof visibleItems).toBe("function");
    expect(typeof GroupMotion).toBe("function");
  });

  test("visibleItems initial value equals signal initial value", () => {
    const [items] = use([1, 2, 3]);
    const [visibleItems] = createGroupMotion(items);
    expect(visibleItems()).toEqual([1, 2, 3]);
  });

  test("visibleItems initial value is empty when signal starts empty", () => {
    const [items] = use([]);
    const [visibleItems] = createGroupMotion(items);
    expect(visibleItems()).toEqual([]);
  });

  test("works with component context", () => {
    const [items] = use([1]);
    const [visibleItems] = createGroupMotion(items, undefined, { use });
    expect(typeof visibleItems).toBe("function");
  });

  test("without keyFn works", () => {
    const [items] = use([1, 2]);
    const [visibleItems] = createGroupMotion(items);
    expect(visibleItems()).toEqual([1, 2]);
  });
});

// ── Signal Behavior (no DOM = immediate update) ──────

describe("createGroupMotion — signal behavior", () => {
  const data = [
    { id: 1, text: "A" },
    { id: 2, text: "B" },
  ];

  test("remove item: without elements, visibleItems updates immediately", () => {
    const [items, setItems] = use(data);
    const [visibleItems] = createGroupMotion(items, keyFn);

    setItems(data.slice(0, 1));
    expect(visibleItems()).toEqual(data.slice(0, 1));
  });

  test("remove all: without elements, updates immediately", () => {
    const [items, setItems] = use(data);
    const [visibleItems] = createGroupMotion(items, keyFn);

    setItems([]);
    expect(visibleItems()).toEqual([]);
  });

  test("add item: updates immediately (no exit)", () => {
    const [items, setItems] = use(data.slice(0, 1));
    const [visibleItems] = createGroupMotion(items, keyFn);

    setItems(data);
    expect(visibleItems()).toEqual(data);
  });

  test("no change: same signal value, no update", () => {
    const [items, setItems] = use(data);
    const [visibleItems] = createGroupMotion(items, keyFn);

    setItems(data);
    expect(visibleItems()).toEqual(data);
  });

  test("without keyFn: full exit path updates immediately when no elements", () => {
    const [items, setItems] = use(data);
    const [visibleItems] = createGroupMotion(items);

    setItems(data.slice(0, 1));
    expect(visibleItems()).toEqual(data.slice(0, 1));
  });

  test("remove then re-add same key", () => {
    const [items, setItems] = use(data);
    const [visibleItems] = createGroupMotion(items, keyFn);

    setItems(data.slice(0, 1));
    expect(visibleItems()).toEqual(data.slice(0, 1));

    setItems(data);
    expect(visibleItems()).toEqual(data);
  });
});

// ── Rapid calls ─────────────────────────────────────

describe("createGroupMotion — rapid calls", () => {
  const data = [
    { id: 1, text: "A" },
    { id: 2, text: "B" },
  ];

  test("rapid remove and re-add: final state correct", () => {
    const [items, setItems] = use(data);
    const [visibleItems] = createGroupMotion(items, keyFn);

    setItems(data.slice(0, 1));
    setItems(data);
    expect(visibleItems()).toEqual(data);
  });

  test("rapid sequence: remove, add new, remove different", () => {
    const [items, setItems] = use(data);
    const [visibleItems] = createGroupMotion(items, keyFn);

    setItems(data.slice(0, 1));
    setItems([data[0], { id: 3, text: "C" }]);
    setItems([{ id: 3, text: "C" }]);

    expect(visibleItems()).toEqual([{ id: 3, text: "C" }]);
  });
});

// ── Edge Cases ──────────────────────────────────────

describe("createGroupMotion — edge cases", () => {
  test("empty initial array", () => {
    const [items] = use([]);
    const [visibleItems] = createGroupMotion(items, keyFn);
    expect(visibleItems()).toEqual([]);
  });

  test("single item remove", () => {
    const [items, setItems] = use([{ id: 1, text: "A" }]);
    const [visibleItems] = createGroupMotion(items, keyFn);

    setItems([]);
    expect(visibleItems()).toEqual([]);
  });

  test("non-primitive keys with keyFn", () => {
    const [items, setItems] = use([
      { id: { a: 1 }, text: "A" },
      { id: { a: 2 }, text: "B" },
    ]);
    const keyFnObj = (v: any) => v.id.a;
    const [visibleItems] = createGroupMotion(items, keyFnObj);

    setItems([{ id: { a: 1 }, text: "A" }]);
    expect(visibleItems()).toEqual([{ id: { a: 1 }, text: "A" }]);
  });
});

// ── DOM Integration with each ────────────────────────

describe("createGroupMotion — DOM integration", () => {
  test("GroupMotion inside each renders items", () => {
    const [items] = use([
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ]);
    const [visibleItems, GroupMotion] = createGroupMotion(items, keyFn);

    const el = h("ul", { each: visibleItems, key: keyFn }, (item: () => any) =>
      h(GroupMotion as any, { key: item().id }, h("li", null, item().text)),
    );

    mount(el as HTMLElement, document.body);
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("A");
    expect(el.children[1].textContent).toBe("B");

    unmount(el as HTMLElement);
  });

  test("remove item: visibleItems updates final state", async () => {
    const [items, setItems] = use([
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ]);
    const [visibleItems, GroupMotion] = createGroupMotion(items, keyFn);

    const el = h("ul", { each: visibleItems, key: keyFn }, (item: () => any) =>
      h(GroupMotion as any, { key: item().id, from: { opacity: 0 } }, h("li", null, item().text)),
    );

    mount(el as HTMLElement, document.body);
    expect(el.children.length).toBe(2);

    setItems([{ id: 1, text: "A" }]);

    // 等待动画完成 + visibleItems 更新
    await new Promise((r) => setTimeout(r, 500));

    expect(visibleItems()).toEqual([{ id: 1, text: "A" }]);
    expect(el.children.length).toBe(1);

    unmount(el as HTMLElement);
  });

  test("nothing removed with from: visibleItems updates immediately", () => {
    const [items, setItems] = use([
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ]);
    const [visibleItems, GroupMotion] = createGroupMotion(items, keyFn);

    const el = h("ul", { each: visibleItems, key: keyFn }, (item: () => any) =>
      h(GroupMotion as any, { key: item().id }, h("li", null, item().text)),
    );

    mount(el as HTMLElement, document.body);
    expect(el.children.length).toBe(2);

    setItems([
      { id: 1, text: "A" },
      { id: 3, text: "C" },
    ]);

    expect(visibleItems()).toEqual([
      { id: 1, text: "A" },
      { id: 3, text: "C" },
    ]);

    unmount(el as HTMLElement);
  });
});
